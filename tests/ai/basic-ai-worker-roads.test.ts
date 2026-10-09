import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { hexKey } from '@/systems/hex-utils';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { getAvailableWorkerActions } from '@/systems/improvement-system';
import { processAITurn } from '@/ai/basic-ai';
import { assignWorkerDevelopmentJobs, collectWorkerDevelopmentJobs, processWorkerDevelopment, WORKER_PATH_TRIALS } from '@/ai/ai-worker-development';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import * as pathfinding from '@/systems/unit-pathfinding';
import { foundCityInState } from '@/systems/city-founding-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { declareMajorWar } from '@/systems/diplomacy-war';
import { chooseRoadBuilderUnit, getRoadBuildTarget } from '@/systems/road-network';
import { isUnitConcealedFrom } from '@/systems/concealment';

// Regression for a pre-existing bug found while implementing world-pressure MR4 (#530):
// no AIStrategicPlan ever declares a 'worker' required role (only
// frontline/ranged/capture/resource-expedition/naval-combat do, per every
// requiredRoles literal in ai-plan-portfolio.ts/ai-prepared-turn.ts), and 'worker' has
// no COMPATIBLE_ROLES fallback in ai-unit-assignment.ts either -- so workers never enter
// assignedUnitIds and never reach processMajorCivStrategicTurn's tactical dispatch. The
// road-building decision logic already written in ai-tactics.ts's
// rankCivilianAndTransportActions (chooseRoadBuilderUnit + the getAvailableWorkerActions
// fallback) was therefore dead code -- ai-tactics.test.ts's existing unit tests call
// rankUnitTacticalActions directly, which bypasses the plan-assignment gap entirely and
// never caught this. basic-ai.ts's processAITurnInternal now applies the same decision
// logic administratively (mirroring the MR4 catastrophe-restoration loop). This test
// exercises a real AI round end to end -- not a direct rankUnitTacticalActions call --
// to prove a worker actually walks to the target and builds the road.
function makeCity(id: string, owner: string, position: HexCoord): City {
  return {
    id, name: id, owner, position, population: 5, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [position], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };
}

// Capital (q=0) and outpost (q=4) sit on a flat, unclaimed (owner: null) grassland
// corridor -- ownerless tiles never trip canBuildRoad's "outside-territory" check, so
// unlike the MR4 fixture this scenario doesn't need to dodge recalculateTerritory().
// getRoadBuildTarget walks the path outward from the capital and picks the first
// non-city, buildable tile -- (q=1, r=0) here, matching the identical two-city-gap
// case already proven in tests/systems/road-network.test.ts.
function buildRoadBuilderScenario(): { state: GameState; civId: string; targetKey: string } {
  const civId = 'ai-1';
  const base = createNewGame(undefined, 'ai-worker-road-e2e', 'small');

  const capitalPos: HexCoord = { q: 0, r: 0 };
  const outpostPos: HexCoord = { q: 4, r: 0 };
  const workerPos: HexCoord = { q: -3, r: 0 };
  const targetPos: HexCoord = { q: 1, r: 0 };

  const capital = makeCity('ai-capital', civId, capitalPos);
  const outpost = makeCity('ai-outpost', civId, outpostPos);

  const tiles: Record<string, HexTile> = { ...base.map.tiles };
  for (let q = -3; q <= 4; q++) {
    const coord: HexCoord = { q, r: 0 };
    tiles[hexKey(coord)] = {
      coord, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }

  const worker = createUnit('worker', civId, workerPos, base.idCounters);

  const state: GameState = {
    ...base,
    cities: { [capital.id]: capital, [outpost.id]: outpost },
    units: { [worker.id]: worker },
    map: { ...base.map, tiles },
    civilizations: {
      ...base.civilizations,
      [civId]: {
        ...base.civilizations[civId],
        cities: [capital.id, outpost.id],
        units: [worker.id],
        techState: { ...base.civilizations[civId].techState, completed: ['road-building'] },
      },
    },
  };
  return { state, civId, targetKey: hexKey(targetPos) };
}

function runRounds(state: GameState, rounds: number): GameState {
  const bus = new EventBus();
  let current = state;
  for (let round = 0; round < rounds; round++) {
    const completed = runCompletedRound(current, bus, {
      improvements: (s, eb) => processImprovementTurns(s, eb),
      majors: (s, eb) => processNonHumanMajorRound(s, eb).state,
      world: (s, eb) => processTurn(s, eb),
    });
    if (!completed.ok) throw new Error(`round ${round + 1} failed`, { cause: completed.error });
    current = completed.state;
    completed.events.commitTo(bus);
  }
  return current;
}

describe('AI worker road-building — end to end (dead-code fix found during #526 MR4/MR5)', () => {
  it('an idle AI worker walks to the road target and builds the road over several real AI turns', () => {
    const { state, targetKey } = buildRoadBuilderScenario();
    expect(state.map.tiles[targetKey]?.hasRoad).toBeFalsy();

    // Distance from the worker's start (q=-3) to the target (q=1) is 4 tiles, and the
    // administrative loop moves one step per AI turn (matching the MR4 restoration
    // loop's own single-step-per-round behavior) -- so completion genuinely spans
    // several turns: ~4 to arrive, 1 to start the build, 2 more for the build tick
    // (ROAD_BUILD_TURNS). 12 rounds leaves generous margin, same as the MR4 fixture.
    const afterFewRounds = runRounds(state, 3);
    expect(afterFewRounds.map.tiles[targetKey]?.hasRoad).toBeFalsy();

    const final = runRounds(afterFewRounds, 9);
    expect(final.map.tiles[targetKey]?.hasRoad).toBe(true);
  });

  it('does nothing without road-building tech (negative)', () => {
    const { state, civId, targetKey } = buildRoadBuilderScenario();
    state.civilizations[civId]!.techState.completed = [];

    const final = runRounds(state, 12);

    expect(final.map.tiles[targetKey]?.hasRoad).toBeFalsy();
  });
});

// Small deterministic administrative campaign: real AI turns, canonical construction
// ticks, and turn-start movement resets; no unrelated world growth or combat draws.
function developmentScenario(workerPositions: number[] = [0]): GameState {
  const base = createNewGame(undefined, 'worker-development-1427', 'small');
  const tiles: Record<string, HexTile> = {};
  for (let q = 0; q <= 6; q++) {
    const coord = { q, r: 0 };
    tiles[hexKey(coord)] = {
      coord, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: q === 0 ? 'none' : 'farm', improvementTurnsLeft: 0,
      owner: 'ai-1', hasRiver: false, wonder: null,
    };
  }
  const city = makeCity('development-capital', 'ai-1', { q: 0, r: 0 });
  city.population = 2;
  city.focus = 'custom';
  city.ownedTiles = Object.values(tiles).map(tile => tile.coord);
  city.workedTiles = [{ q: 2, r: 0 }, { q: 4, r: 0 }];
  const workers = workerPositions.map(q => createUnit('worker', 'ai-1', { q, r: 0 }, base.idCounters));
  return {
    ...base, turn: 20, cities: { [city.id]: city },
    units: Object.fromEntries(workers.map(unit => [unit.id, unit])),
    map: { ...base.map, width: 7, height: 1, wrapsHorizontally: false, tiles, rivers: [] },
    barbarianCamps: {}, minorCivs: {}, tribalVillages: {},
    civilizations: Object.fromEntries(Object.entries(base.civilizations).map(([id, civ]) => [id, {
      ...civ, cities: id === 'ai-1' ? [city.id] : [],
      units: id === 'ai-1' ? workers.map(worker => worker.id) : [],
      visibility: { tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'visible'])) },
    }])),
  };
}

function developmentRound(state: GameState, bus = new EventBus()): GameState {
  const reset: GameState = {
    ...state, turn: state.turn + 1,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, {
      ...unit, movementPointsLeft: 2, hasActed: false, hasMoved: false,
    }])),
  };
  return processAITurn(processImprovementTurns(reset, bus), 'ai-1', bus);
}

function reportDevelopmentMeasurement(name: string, measurement: object): void {
  if (process.env.WORKER_DEVELOPMENT_REPORT !== '1') return;
  mkdirSync('.verification/worker-development', { recursive: true });
  writeFileSync(`.verification/worker-development/${name}.json`, `${JSON.stringify(measurement, null, 2)}\n`);
}

describe('AI land development through actual AI turns (#1427)', () => {
  it.each(['cattle', 'horses', 'oil', 'wine'] as const)('activates known %s with the correct completed improvement', resource => {
    const state = developmentScenario([2]);
    const definition = RESOURCE_DEFINITIONS.find(entry => entry.id === resource)!;
    const tile = state.map.tiles['2,0']!;
    tile.terrain = 'plains';
    tile.resource = resource;
    tile.improvement = 'none';
    state.civilizations['ai-1']!.techState.completed = [definition.tech];
    const actions = getAvailableWorkerActions(tile, [definition.tech], 'ai-1');
    expect(actions).toContain('farm');
    expect(actions).toContain(definition.requiredImprovement);
    let current = processAITurn(state, 'ai-1', new EventBus());
    expect(current.map.tiles['2,0']!.improvement).toBe(definition.requiredImprovement);
    expect(getCivAvailableResources(current, 'ai-1').has(resource)).toBe(false);
    for (let round = 0; round < 6; round++) current = developmentRound(current);
    expect(getCivAvailableResources(current, 'ai-1').has(resource)).toBe(true);
    reportDevelopmentMeasurement(resource, { resource, improvement: current.map.tiles['2,0']!.improvement,
      resourceAvailable: getCivAvailableResources(current, 'ai-1').has(resource), chargesUsed: 1 });
  });

  it('leaves an unsuitable city-center start and completes useful work nearby', () => {
    const state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    let current = state;
    for (let round = 0; round < 8; round++) current = developmentRound(current);
    expect(current.map.tiles['2,0']!.improvement).not.toBe('none');
    expect(current.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
  });

  it('keeps a busy road worker committed until construction completes', () => {
    const state = developmentScenario([1]);
    const outpost = makeCity('development-outpost', 'ai-1', { q: 6, r: 0 });
    state.cities[outpost.id] = outpost;
    state.civilizations['ai-1']!.cities.push(outpost.id);
    state.civilizations['ai-1']!.techState.completed = ['road-building'];
    const workerId = state.civilizations['ai-1']!.units[0]!;
    const started = applyWorkerAction(state, workerId, 'build_road');
    expect(started.ok).toBe(true);
    const current = developmentRound(started.state);
    expect(current.units[workerId]).toBeDefined();
    expect(current.units[workerId]!.position).toEqual({ q: 1, r: 0 });
    expect(current.units[workerId]!.workerTask?.action).toBe('build_road');
    expect(current.map.tiles['1,0']!.roadTurnsLeft).toBe(1);
    const completed = developmentRound(current);
    expect(completed.map.tiles['1,0']!.hasRoad).toBe(true);
  });

  it('finishes a city connection across remembered roads instead of targeting an already built fogged link', () => {
    let state = developmentScenario([6]);
    const civ = state.civilizations['ai-1']!;
    const outpost = makeCity('road-memory-outpost', 'ai-1', { q: 6, r: 0 });
    state.cities[outpost.id] = outpost;
    civ.cities.push(outpost.id);
    civ.techState.completed = ['road-building'];
    for (let q = 1; q <= 4; q++) state.map.tiles[`${q},0`]!.hasRoad = true;
    state = refreshLastSeenPresentationsForCiv(state, 'ai-1');
    state.civilizations['ai-1']!.visibility.tiles['3,0'] = 'fog';
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')[0]?.job.coord).toEqual({ q: 5, r: 0 });
    for (let round = 0; round < 5; round++) state = developmentRound(state);
    expect(state.map.tiles['5,0']!.hasRoad).toBe(true);
    expect(state.units[civ.units[0]!]!.chargesRemaining).toBe(1);
  });

  it('does not select a road target already under construction or route a builder through foreign occupants', () => {
    const state = developmentScenario([0]);
    const civ = state.civilizations['ai-1']!;
    civ.techState.completed = ['road-building'];
    const outpost = makeCity('road-outpost', 'ai-1', { q: 6, r: 0 });
    state.cities[outpost.id] = outpost;
    civ.cities.push(outpost.id);
    state.map.tiles['1,0']!.roadTurnsLeft = 1;
    expect(getRoadBuildTarget(state, 'ai-1')).toEqual({ q: 2, r: 0 });
    const blocker = createUnit('worker', 'player', { q: 1, r: 0 }, state.idCounters);
    state.units[blocker.id] = blocker;
    state.civilizations.player!.units.push(blocker.id);
    expect(chooseRoadBuilderUnit(state, 'ai-1')).toBeNull();
  });

  it('assigns two workers to separate worthwhile sites', () => {
    const state = developmentScenario([0, 6]);
    state.map.tiles['2,0']!.improvement = 'none';
    state.map.tiles['4,0']!.improvement = 'none';
    let current = state;
    for (let round = 0; round < 9; round++) current = developmentRound(current);
    expect(current.map.tiles['2,0']!.improvement).not.toBe('none');
    expect(current.map.tiles['4,0']!.improvement).not.toBe('none');
    expect(current.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
    expect(current.map.tiles['4,0']!.improvementTurnsLeft).toBe(0);
  });

  it('reserves a single resource for one worker and announces construction exactly once', () => {
    const state = developmentScenario([0, 6]);
    state.map.tiles['2,0']!.improvement = 'none';
    state.map.tiles['2,0']!.resource = 'cattle';
    state.civilizations['ai-1']!.techState.completed = ['domestication'];
    const assignments = assignWorkerDevelopmentJobs(state, 'ai-1');
    expect(assignments).toHaveLength(1);
    const bus = new EventBus();
    const started = vi.fn();
    const completed = vi.fn();
    bus.on('improvement:started', started);
    bus.on('improvement:completed', completed);
    let current = state;
    for (let round = 0; round < 9; round++) current = developmentRound(current, bus);
    expect(started).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(getCivAvailableResources(current, 'ai-1').has('cattle')).toBe(true);
    expect(Object.values(current.units).reduce((sum, unit) => sum + (unit.chargesRemaining ?? 2), 0)).toBe(3);
  });

  it.each([0, 2])('does not repeat acquisition-only work when a first resource source is completed or underway (%s turns left)', turnsLeft => {
    const state = developmentScenario([0, 6]);
    const civ = state.civilizations['ai-1']!;
    civ.techState.completed = ['animal-husbandry'];
    for (const key of ['2,0', '4,0']) Object.assign(state.map.tiles[key]!, {
      terrain: 'plains', resource: 'horses', improvement: 'none',
    });
    state.cities['development-capital']!.workedTiles = [{ q: 1, r: 0 }, { q: 3, r: 0 }];
    Object.assign(state.map.tiles['2,0']!, { improvement: 'pasture', improvementTurnsLeft: turnsLeft });
    expect(collectWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    expect(developmentRound(state).units[civ.units[1]!]!.chargesRemaining).toBe(2);
  });

  it('prefers nearby urgent food work over a distant first strategic resource', () => {
    const state = developmentScenario([1]);
    state.civilizations['ai-1']!.techState.completed = ['animal-husbandry'];
    state.map.tiles['2,0']!.improvement = 'none';
    Object.assign(state.map.tiles['6,0']!, { terrain: 'plains', resource: 'horses', improvement: 'none' });
    state.cities['development-capital']!.workedTiles = [{ q: 2, r: 0 }, { q: 6, r: 0 }];
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')[0]!.job.coord).toEqual({ q: 2, r: 0 });
    const after = developmentRound(state);
    expect(after.units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 2, r: 0 });
  });

  it.each([0, 1])('finishes useful mining despite one-gold treasury fluctuations (starting gold: %s)', startingGold => {
    let state = developmentScenario([3]);
    const civ = state.civilizations['ai-1']!;
    const city = state.cities['development-capital']!;
    for (let q = -3; q <= 12; q++) {
      const coord = { q, r: 0 };
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles['1,0']!, coord };
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }
    state.map.width = 16;
    city.position = { q: -2, r: 0 };
    city.population = 1;
    city.ownedTiles = [{ q: -3, r: 0 }];
    city.workedTiles = [...city.ownedTiles];
    Object.assign(state.map.tiles['-3,0']!, { improvement: 'none', hasRiver: true });
    const outpost = makeCity('mining-outpost', 'ai-1', { q: 10, r: 0 });
    outpost.population = 1;
    outpost.focus = 'custom';
    outpost.ownedTiles = [{ q: 9, r: 0 }];
    outpost.workedTiles = [...outpost.ownedTiles];
    state.cities[outpost.id] = outpost;
    civ.cities.push(outpost.id);
    Object.assign(state.map.tiles['9,0']!, { terrain: 'hills', improvement: 'none' });
    // Visible fixture terrain must have canonical observations before movement
    // turns the corridor into fog; visibility flags alone are not route memory.
    state = refreshLastSeenPresentationsForCiv(state, 'ai-1');
    const before = calculateProjectedCityYields(state, outpost.id);
    const id = civ.units[0]!;
    const positions: number[] = [];
    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('improvement:completed', completed);
    for (let round = 0; round < 12; round++) {
      state.civilizations['ai-1']!.gold = (round + startingGold) % 2;
      state = developmentRound(state, bus);
      positions.push(state.units[id]!.position.q);
    }
    expect(positions.slice(0, 6)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(state.map.tiles['9,0']!.improvement).toBe('mine');
    expect(state.map.tiles['9,0']!.improvementTurnsLeft).toBe(0);
    const after = calculateProjectedCityYields(state, outpost.id);
    expect(after.production - before.production).toBe(2);
    expect(after.gold - before.gold).toBe(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(state.units[id]!.chargesRemaining).toBe(1);
    reportDevelopmentMeasurement('treasury-fluctuation', { positions, before, after,
      completed: completed.mock.calls.length, chargesUsed: 1 });
  });

  it('validates real finalist travel cost so an apparent shortcut does not cause a target switch', () => {
    const state = developmentScenario();
    const city = state.cities['development-capital']!;
    state.map.tiles['2,0']!.improvement = 'none';
    state.map.tiles['1,0']!.terrain = 'ocean';
    for (const coord of [{ q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 }, { q: 1, r: 1 }, { q: 2, r: 1 }]) {
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles['3,0']!, coord,
        improvement: coord.r === 3 ? 'none' : 'farm' };
      state.civilizations['ai-1']!.visibility.tiles[hexKey(coord)] = 'visible';
      city.ownedTiles.push(coord);
    }
    city.workedTiles = [{ q: 2, r: 0 }, { q: 0, r: 3 }];
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')[0]!.job.coord).toEqual({ q: 0, r: 3 });
    let current = state;
    const targets: string[] = [];
    for (let round = 0; round < 3; round++) {
      targets.push(hexKey(assignWorkerDevelopmentJobs(current, 'ai-1')[0]!.job.coord));
      current = developmentRound(current);
    }
    expect(targets).toEqual(['0,3', '0,3', '0,3']);
  });

  it('does not improve an unknown resource differently from an otherwise identical tile', () => {
    const hidden = developmentScenario();
    hidden.map.tiles['2,0']!.improvement = 'none';
    hidden.map.tiles['2,0']!.resource = 'oil';
    const control = structuredClone(hidden);
    control.map.tiles['2,0']!.resource = null;
    expect(assignWorkerDevelopmentJobs(hidden, 'ai-1')).toEqual(assignWorkerDevelopmentJobs(control, 'ai-1'));
    const result = developmentRound(hidden);
    expect(result.units[hidden.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 1, r: 0 });
    expect(result.map.tiles['2,0']!.improvement).toBe('none');
  });

  it('does not read an unrevealed owned site even after its resource tech is researched', () => {
    const state = developmentScenario();
    state.map.tiles['4,0']!.improvement = 'none';
    state.map.tiles['4,0']!.resource = 'oil';
    state.civilizations['ai-1']!.techState.completed = ['petroleum-industry'];
    state.civilizations['ai-1']!.visibility.tiles['4,0'] = 'unexplored';
    expect(collectWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    expect(developmentRound(state).units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 0, r: 0 });
  });

  it('replans after research reveals a resource, including repairing an old incorrect farm', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.terrain = 'plains';
    state.map.tiles['2,0']!.resource = 'horses';
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    state = developmentRound(state);
    state.civilizations['ai-1']!.techState.completed.push('animal-husbandry');
    for (let round = 0; round < 8; round++) state = developmentRound(state);
    expect(getCivAvailableResources(state, 'ai-1').has('horses')).toBe(true);
  });

  it('discovers new owned work after expansion and abandons it after ownership loss', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    state.map.tiles['2,0']!.owner = 'player';
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    state = developmentRound(state);
    state.map.tiles['2,0']!.owner = 'ai-1';
    state = developmentRound(state);
    const id = state.civilizations['ai-1']!.units[0]!;
    expect(state.units[id]!.position).toEqual({ q: 1, r: 0 });
    state.map.tiles['2,0']!.owner = 'player';
    const afterLoss = developmentRound(state);
    expect(afterLoss.units[id]!.position).toEqual({ q: 1, r: 0 });
    expect(afterLoss.map.tiles['2,0']!.improvement).toBe('none');
  });

  it('has no stale reservation after the assigned worker dies', () => {
    let state = developmentScenario([0, 6]);
    state.map.tiles['2,0']!.improvement = 'none';
    const chosen = assignWorkerDevelopmentJobs(state, 'ai-1')[0]!;
    state = developmentRound(state);
    state = removeUnits(state, [chosen.workerId], { reason: 'destroyed' }).state;
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')[0]!.workerId).not.toBe(chosen.workerId);
    for (let round = 0; round < 10; round++) state = developmentRound(state);
    expect(state.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
    expect(state.map.tiles['2,0']!.improvement).toBe('farm');
  });

  it('stops traveling when another worker completes the site', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    state = developmentRound(state);
    state.map.tiles['2,0']!.improvement = 'farm';
    const id = state.civilizations['ai-1']!.units[0]!;
    const current = developmentRound(state);
    expect(current.units[id]!.position).toEqual(state.units[id]!.position);
    expect(current.units[id]!.chargesRemaining).toBe(2);
  });

  it('does not plan ordinary improvements while cityless, and resumes after resettlement', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    const cities = structuredClone(state.cities);
    state.cities = {};
    state.civilizations['ai-1']!.cities = [];
    state = developmentRound(state);
    expect(state.units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 0, r: 0 });
    state.cities = cities;
    state.civilizations['ai-1']!.cities = Object.keys(cities);
    for (let round = 0; round < 8; round++) state = developmentRound(state);
    expect(state.map.tiles['2,0']!.improvement).toBe('farm');
  });

  it('avoids a blocked route and resumes when the blocking foreign unit leaves', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    const foreign = createUnit('worker', 'player', { q: 1, r: 0 }, state.idCounters);
    state.units[foreign.id] = foreign;
    state.civilizations.player!.units.push(foreign.id);
    const id = state.civilizations['ai-1']!.units[0]!;
    state = developmentRound(state);
    expect(state.units[id]!.position).toEqual({ q: 0, r: 0 });
    state = removeUnits(state, [foreign.id], { reason: 'destroyed' }).state;
    for (let round = 0; round < 8; round++) state = developmentRound(state);
    expect(state.map.tiles['2,0']!.improvement).toBe('farm');
  });

  it('does not travel through a known hostile approach to reach otherwise safe work', () => {
    let state = developmentScenario();
    state.map.tiles['6,0']!.improvement = 'none';
    state.cities['development-capital']!.workedTiles = [{ q: 2, r: 0 }, { q: 6, r: 0 }];
    const coord = { q: 3, r: 1 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles['3,0']!, coord, owner: 'player' };
    state.civilizations['ai-1']!.visibility.tiles[hexKey(coord)] = 'visible';
    const enemy = createUnit('warrior', 'player', coord, state.idCounters);
    state.units[enemy.id] = enemy;
    state.civilizations.player!.units.push(enemy.id);
    const enemyCity = makeCity('enemy-seat', 'player', coord);
    state.cities[enemyCity.id] = enemyCity;
    state.civilizations.player!.cities.push(enemyCity.id);
    state = declareMajorWar(state, 'ai-1', 'player');
    expect(state.civilizations['ai-1']!.diplomacy.atWarWith).toContain('player');
    expect(collectWorkerDevelopmentJobs(state, 'ai-1').some(job => hexKey(job.coord) === '6,0')).toBe(true);
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    expect(developmentRound(state).units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 0, r: 0 });
  });

  it('honors canonical civilian border exemption without entering a foreign city', () => {
    const state = developmentScenario();
    state.map.tiles['1,0']!.owner = 'player';
    state.map.tiles['2,0']!.improvement = 'none';
    const after = developmentRound(state);
    expect(after.units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 1, r: 0 });
    const foreignCity = makeCity('foreign-blocker', 'player', { q: 1, r: 0 });
    state.cities[foreignCity.id] = foreignCity;
    state.civilizations.player!.cities.push(foreignCity.id);
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    expect(developmentRound(state).units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 0, r: 0 });
  });

  it('does not infer a threat from a concealed unit on a visible tile', () => {
    let state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    const coord = { q: 3, r: 1 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles['3,0']!, coord, owner: 'player', terrain: 'forest' };
    state.civilizations['ai-1']!.visibility.tiles[hexKey(coord)] = 'visible';
    state.civilizations.player!.civType = 'lothlorien';
    const enemyCity = makeCity('concealed-seat', 'player', coord);
    state.cities[enemyCity.id] = enemyCity;
    state.civilizations.player!.cities.push(enemyCity.id);
    state = declareMajorWar(state, 'ai-1', 'player');
    const enemy = createUnit('warrior', 'player', coord, state.idCounters);
    state.units[enemy.id] = enemy;
    state.civilizations.player!.units.push(enemy.id);
    expect(isUnitConcealedFrom(state, enemy, 'ai-1')).toBe(true);
    const control = removeUnits(state, [enemy.id], { reason: 'destroyed' }).state;
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual(assignWorkerDevelopmentJobs(control, 'ai-1'));
    const id = state.civilizations['ai-1']!.units[0]!;
    expect(developmentRound(state).units[id]!.position).toEqual(developmentRound(control).units[id]!.position);
  });

  it('prioritizes urgent catastrophe recovery over roads and resource development', () => {
    let state = developmentScenario([1]);
    state.opponentChallenge = 'veteran';
    const tile = state.map.tiles['2,0']!;
    tile.devastatedUntilTurn = 100;
    tile.resource = 'cattle';
    tile.improvement = 'none';
    const outpost = makeCity('outpost', 'ai-1', { q: 6, r: 0 });
    state.cities[outpost.id] = outpost;
    state.civilizations['ai-1']!.cities.push(outpost.id);
    state.civilizations['ai-1']!.techState.completed = ['road-building', 'domestication'];
    state.activeCrises = { catastrophe: {
      id: 'catastrophe', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: 'ai-1',
      cityIds: ['development-capital'], tileKeys: ['2,0'], startedTurn: 0, stage: 'recovery', turnsInStage: 1,
    } };
    state = developmentRound(state);
    const id = state.civilizations['ai-1']!.units[0]!;
    expect(state.units[id]!.position).toEqual({ q: 2, r: 0 });
    expect(state.units[id]!.chargesRemaining).toBe(2);
    state = developmentRound(state);
    expect(state.map.tiles['2,0']!.devastatedUntilTurn).toBeUndefined();
    expect(state.units[id]!.chargesRemaining).toBe(1);
    expect(state.map.tiles['2,0']!.improvement).toBe('none');
  });

  it('assigns restoration to a free worker rather than reserving it for loaded cargo', () => {
    const state = developmentScenario([1, 0]);
    state.opponentChallenge = 'veteran';
    const civ = state.civilizations['ai-1']!;
    state.units[civ.units[0]!]!.transportId = 'hull';
    state.map.tiles['2,0']!.devastatedUntilTurn = 100;
    state.activeCrises = { catastrophe: {
      id: 'catastrophe', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: 'ai-1',
      cityIds: ['development-capital'], tileKeys: ['2,0'], startedTurn: 0, stage: 'recovery', turnsInStage: 1,
    } };
    const after = developmentRound(state);
    expect(after.units[civ.units[1]!]!.position).toEqual({ q: 1, r: 0 });
    expect(after.units[civ.units[0]!]!.chargesRemaining).toBe(2);
  });

  it('releases a blocked restoration reservation so the worker can develop reachable land', () => {
    let state = developmentScenario();
    state.opponentChallenge = 'veteran';
    state.map.tiles['2,0']!.devastatedUntilTurn = 100;
    const coord = { q: 0, r: 1 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles['1,0']!, coord, improvement: 'none' };
    state.civilizations['ai-1']!.visibility.tiles[hexKey(coord)] = 'visible';
    state.cities['development-capital']!.ownedTiles.push(coord);
    state.cities['development-capital']!.workedTiles = [coord, { q: 4, r: 0 }];
    const blocker = createUnit('worker', 'player', { q: 1, r: 0 }, state.idCounters);
    state.units[blocker.id] = blocker;
    state.civilizations.player!.units.push(blocker.id);
    state.activeCrises = { catastrophe: {
      id: 'catastrophe', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: 'ai-1',
      cityIds: ['development-capital'], tileKeys: ['2,0'], startedTurn: 0, stage: 'recovery', turnsInStage: 1,
    } };
    const id = state.civilizations['ai-1']!.units[0]!;
    state = developmentRound(state);
    expect(state.units[id]!.position).toEqual(coord);
    for (let round = 0; round < 5; round++) state = developmentRound(state);
    expect(state.map.tiles[hexKey(coord)]!.improvement).toBe('farm');
    expect(state.map.tiles[hexKey(coord)]!.improvementTurnsLeft).toBe(0);
    expect(state.map.tiles['2,0']!.devastatedUntilTurn).toBe(100);
    expect(state.units[id]!.chargesRemaining).toBe(1);
    state = removeUnits(state, [blocker.id], { reason: 'destroyed' }).state;
    for (let round = 0; round < 4; round++) state = developmentRound(state);
    expect(state.map.tiles['2,0']!.devastatedUntilTurn).toBeUndefined();
    expect(state.units[id]).toBeUndefined();
  });

  it('leaves workers idle when all legal jobs have zero marginal value', () => {
    const state = developmentScenario([5]);
    state.map.tiles['5,0']!.improvement = 'none';
    state.map.tiles['5,0']!.terrain = 'desert';
    expect(collectWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    const current = developmentRound(state);
    const id = state.civilizations['ai-1']!.units[0]!;
    expect(current.units[id]!.position).toEqual({ q: 5, r: 0 });
    expect(current.units[id]!.chargesRemaining).toBe(2);
  });

  it('does not divert human workers or mutate input during planning and movement', () => {
    const state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    const before = structuredClone(state);
    processWorkerDevelopment(state, 'ai-1', new EventBus());
    expect(state).toEqual(before);
    state.civilizations['ai-1']!.isHuman = true;
    expect(processWorkerDevelopment(state, 'ai-1', new EventBus())).toBe(state);
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
  });

  it('excludes exhausted and loaded workers, and completes a last-charge construction once', () => {
    const state = developmentScenario([2]);
    state.map.tiles['2,0']!.improvement = 'none';
    const id = state.civilizations['ai-1']!.units[0]!;
    state.units[id]!.chargesRemaining = 0;
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    state.units[id]!.chargesRemaining = 1;
    state.units[id]!.transportId = 'hull';
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')).toEqual([]);
    state.units[id]!.transportId = undefined;
    let current = processAITurn(state, 'ai-1', new EventBus());
    expect(current.units[id]).toBeUndefined();
    for (let round = 0; round < 5; round++) current = developmentRound(current);
    expect(current.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
    expect(current.map.tiles['2,0']!.improvement).toBe('farm');
  });

  it('does not abandon active improvement construction for a road objective', () => {
    const state = developmentScenario([2]);
    state.map.tiles['2,0']!.improvement = 'none';
    state.civilizations['ai-1']!.techState.completed = ['road-building'];
    const outpost = makeCity('outpost', 'ai-1', { q: 6, r: 0 });
    state.cities[outpost.id] = outpost;
    state.civilizations['ai-1']!.cities.push(outpost.id);
    const id = state.civilizations['ai-1']!.units[0]!;
    const started = applyWorkerAction(state, id, 'farm');
    let current = started.state;
    for (let round = 0; round < 3; round++) {
      current = developmentRound(current);
      expect(current.units[id]!.position).toEqual({ q: 2, r: 0 });
      expect(current.units[id]!.chargesRemaining).toBe(1);
      expect(current.units[id]!.workerTask?.action).toBe('farm');
    }
    current = developmentRound(current);
    expect(current.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
  });

  it('produces identical development after a real save/load normalization during travel and construction', () => {
    const initial = developmentScenario();
    initial.map.tiles['2,0']!.improvement = 'none';
    let continuous: GameState = refreshLastSeenPresentationsForCiv(normalizeLoadedState(initial), 'ai-1');
    continuous = developmentRound(continuous);
    let reloaded: GameState = normalizeLoadedState(JSON.parse(JSON.stringify(continuous)) as GameState);
    for (let round = 0; round < 8; round++) {
      continuous = developmentRound(continuous);
      reloaded = developmentRound(reloaded);
      if (round === 2) reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(reloaded)) as GameState);
    }
    assertSimulationEquivalent(continuous, reloaded);
    expect(continuous.map.tiles['2,0']!.improvementTurnsLeft).toBe(0);
    expect(continuous.map.tiles['2,0']!.improvement).toBe('farm');
  });

  it('measures useful economic improvement, productive travel and finite charges over eight AI turns', () => {
    const state = developmentScenario();
    state.map.tiles['2,0']!.improvement = 'none';
    const cityId = 'development-capital';
    const before = calculateProjectedCityYields(state, cityId);
    const bus = new EventBus();
    const moved = vi.fn();
    const completed = vi.fn();
    bus.on('unit:move', moved);
    bus.on('improvement:completed', completed);
    let current = state;
    for (let round = 0; round < 8; round++) current = developmentRound(current, bus);
    const after = calculateProjectedCityYields(current, cityId);
    expect(after.food - before.food).toBe(2);
    expect(after.production - before.production).toBe(0);
    expect(after.gold - before.gold).toBe(0);
    expect(after.science - before.science).toBe(0);
    expect(moved).toHaveBeenCalledTimes(2);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(current.units[state.civilizations['ai-1']!.units[0]!]!.chargesRemaining).toBe(1);
    reportDevelopmentMeasurement('productivity', { before, after, travelTurns: moved.mock.calls.length,
      completed: completed.mock.calls.length, chargesUsed: 1 });
  });

  it.each(['medium', 'large'] as const)('bounds routing work with six workers on a representative %s map', size => {
    let state = createNewGame(undefined, `worker-perf-${size}`, size);
    const settlerId = state.civilizations['ai-1']!.units.find(id => state.units[id]?.type === 'settler')!;
    state = foundCityInState(state, settlerId, new EventBus()).state;
    const city = state.cities[state.civilizations['ai-1']!.cities[0]!]!;
    const workers = Array.from({ length: 6 }, () => createUnit('worker', 'ai-1', city.position, state.idCounters));
    for (const worker of workers) state.units[worker.id] = worker;
    state.civilizations['ai-1']!.units.push(...workers.map(worker => worker.id));
    const jobs = collectWorkerDevelopmentJobs(state, 'ai-1');
    const spy = vi.spyOn(pathfinding, 'findPath');
    const start = performance.now();
    const assignments = assignWorkerDevelopmentJobs(state, 'ai-1');
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBeLessThanOrEqual(workers.length * WORKER_PATH_TRIALS * 2);
    expect(new Set(assignments.map(entry => hexKey(entry.job.coord))).size).toBe(assignments.length);
    expect(assignments).toHaveLength(workers.length);
    reportDevelopmentMeasurement(size, { size, tiles: Object.keys(state.map.tiles).length,
      workers: workers.length, candidates: jobs.length, pathfindingCalls: calls,
      assignments: assignments.length, elapsedMs: performance.now() - start });
  });

  it('prunes disconnected resources before bounded routing so reachable home work is not starved', () => {
    const state = developmentScenario();
    const city = state.cities['development-capital']!;
    state.map.tiles['1,0']!.terrain = 'ocean';
    state.civilizations['ai-1']!.techState.completed = ['animal-husbandry'];
    for (const key of ['2,0', '3,0', '4,0', '5,0']) Object.assign(state.map.tiles[key]!, {
      terrain: 'plains', resource: 'horses', improvement: 'none',
    });
    for (let r = 1; r <= 3; r++) {
      const coord = { q: 0, r };
      state.map.tiles[hexKey(coord)] = { ...state.map.tiles['6,0']!, coord, improvement: r === 3 ? 'none' : 'farm' };
      state.civilizations['ai-1']!.visibility.tiles[hexKey(coord)] = 'visible';
      city.ownedTiles.push(coord);
    }
    city.workedTiles = [{ q: 0, r: 3 }, { q: 6, r: 0 }];
    expect(assignWorkerDevelopmentJobs(state, 'ai-1')[0]?.job.coord).toEqual({ q: 0, r: 3 });
    expect(developmentRound(state).units[state.civilizations['ai-1']!.units[0]!]!.position).toEqual({ q: 0, r: 1 });
  });
});
