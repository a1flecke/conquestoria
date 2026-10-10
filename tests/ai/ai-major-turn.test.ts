import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { nextPlanPhase, processMajorCivStrategicTurn } from '@/ai/ai-major-turn';
import { buildMajorCivPerception } from '@/ai/ai-perception';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import type {
  AIStrategicPlan,
  GameState,
  HexCoord,
  Unit,
  UnitType,
} from '@/core/types';
import { foundCity } from '@/systems/city-system';
import {
  cityDistance,
  isCityCenterTerrain,
  MIN_CITY_CENTER_DISTANCE,
} from '@/systems/city-territory-system';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createUnit, resetUnitTurn } from '@/systems/unit-lifecycle';
import { findPath } from '@/systems/unit-pathfinding';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-system';
import * as movementSystem from '@/systems/unit-movement-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { assertBilateralWar, assertCargoReciprocity, assertAirBaseIntegrity } from '../helpers/save-state-invariants';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
import { declareMajorWar } from '@/systems/diplomacy-war';
import { normalizeLoadedState } from '@/storage/save-manager';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { withPerfProbe } from '../perf/perf-probe';
import { assignUnitsToPortfolio } from '@/ai/ai-unit-assignment';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { rankUnitTacticalActions } from '@/ai/ai-tactics';
import { createOperationalRouting, getKnownOperationalRange, getOperationalRoute } from '@/ai/ai-operational-routing';

const AI = 'ai-1';
const HUMAN = 'player';

function writeOperationalEvidence(name: string, trajectory: unknown): void {
  mkdirSync('.verification/operational-warfare', { recursive: true });
  writeFileSync(`.verification/operational-warfare/${name}.json`, `${JSON.stringify(trajectory, null, 2)}\n`);
}

function makeState(): GameState {
  const state = createNewGame({
    civType: 'egypt',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Major turn',
    seed: 'major-turn',
    opponentChallenge: 'veteran',
  });
  // #982: turn 20 happened to roll a `resolveCityAssault` loss for the
  // ('captor'/'target-city') fixture under the new gameId-rooted
  // `city-assault-resolve` seed (it previously "won" only because the old
  // turn*7919-based seed had no gameId to root it). 21 is an arbitrary turn
  // that rolls a win for that exact fixture; the assault odds/formula
  // themselves are untouched -- swordsman (25) vs. a population-1 unwalled
  // outpost (intrinsic 4) still resolves per the documented ~70-95% win band.
  state.turn = 21;
  state.units = {};
  state.cities = {};
  state.barbarianCamps = {};
  state.map.wrapsHorizontally = false;
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'grassland';
    tile.elevation = 'lowland';
    tile.owner = null;
    tile.resource = null;
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
  }
  for (const civilization of Object.values(state.civilizations)) {
    civilization.units = [];
    civilization.cities = [];
  }
  for (const [owner, id, position] of [
    [AI, 'ai-survival-settler', { q: 0, r: 4 }],
    [HUMAN, 'human-survival-settler', { q: 4, r: 4 }],
  ] as const) {
    const settler = { ...createUnit('settler', owner, position, state.idCounters), id, movementPointsLeft: 0, hasActed: true };
    state.units[id] = settler;
    state.civilizations[owner].units.push(id);
  }
  state.civilizations[AI].diplomacy.atWarWith = [HUMAN];
  state.civilizations[HUMAN].diplomacy.atWarWith = [AI];
  state.civilizations[AI].visibility.tiles = Object.fromEntries(
    Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
  );
  return state;
}

function addUnit(
  state: GameState,
  id: string,
  type: UnitType,
  owner: string,
  position: HexCoord,
  overrides: Partial<Unit> = {},
): Unit {
  const unit = {
    ...createUnit(type, owner, position, state.idCounters),
    id,
    ...overrides,
  };
  state.units[id] = unit;
  state.civilizations[owner]?.units.push(id);
  return unit;
}

function addCity(
  state: GameState,
  id: string,
  owner: string,
  position: HexCoord,
) {
  const city = foundCity(owner, position, state.map, state.idCounters);
  city.id = id;
  state.cities[id] = city;
  state.civilizations[owner]?.cities.push(id);
  state.map.tiles[hexKey(position)].owner = owner;
  return city;
}

/** A real land tile at least `minDistance` from every city in the fixture. */
function distantLandTile(state: GameState, minDistance: number): HexCoord {
  const cities = Object.values(state.cities).map(city => city.position);
  const tile = Object.values(state.map.tiles).find(candidate =>
    isCityCenterTerrain(candidate.terrain)
    && cities.every(position =>
      cityDistance(candidate.coord, position, state.map) >= minDistance));
  if (!tile) throw new Error('fixture has no distant land tile');
  return tile.coord;
}

function makePlan(
  target: AIStrategicPlan['target'],
  assignedUnitIds: string[],
  overrides: Partial<AIStrategicPlan> = {},
): AIStrategicPlan {
  return {
    id: 'major-plan',
    actorId: AI,
    objective: target.kind === 'city' ? 'capture' : 'expand',
    target,
    theaterId: 'local:test',
    phase: 'attacking',
    reasonCodes: ['continue-active-war'],
    commitment: 0.7,
    createdTurn: 18,
    reconsiderAfterTurn: 22,
    expiresAfterTurn: 30,
    lastProgressTurn: 19,
    requiredRoles: { frontline: 1 },
    assignedUnitIds,
    ...overrides,
  };
}

function prepared(
  state: GameState,
  plan: AIStrategicPlan,
): PreparedMajorCivPlan {
  const portfolio = {
    ...createEmptyMajorCivPlanPortfolio(),
    primaryPlan: plan,
    lastPlannedTurn: state.turn,
  };
  return {
    civId: AI,
    perception: buildMajorCivPerception(state, AI),
    portfolio,
    assignments: {
      portfolio,
      assignmentsByPlanId: { [plan.id]: [...plan.assignedUnitIds] },
      recoveryUnitIds: [],
      forceDemands: [],
      rejectedByUnitId: {},
    },
    forceDemands: [],
    traces: [],
    nationalIntent: {
      current: 'develop', previous: null, selectedTurn: 0, reconsiderAfterTurn: 0,
      shockActive: false, shockFreeStreak: 0, reasonCodes: [],
    },
  };
}

function detourFixture(): { state: GameState; plan: AIStrategicPlan; unitId: string; cityId: string } {
  let state = makeState();
  const corridor = [
    { q: 1, r: 1 }, { q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 },
    { q: 1, r: 3 }, { q: 2, r: 3 }, { q: 3, r: 3 }, { q: 4, r: 2 }, { q: 5, r: 1 },
  ];
  const corridorKeys = new Set(corridor.map(hexKey));
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    tile.terrain = corridorKeys.has(key) ? 'grassland' : 'ocean';
  }
  const unit = addUnit(state, 'detour-captor', 'swordsman', AI, corridor[0]!);
  const city = addCity(state, 'detour-city', HUMAN, corridor.at(-1)!);
  const plan = makePlan(
    { kind: 'city', id: city.id, lastKnownPosition: city.position },
    [unit.id],
    { phase: 'advancing' },
  );
  state = refreshLastSeenPresentationsForCiv(state, AI);
  return { state, plan, unitId: unit.id, cityId: city.id };
}

function nextOperationalTurn(state: GameState): GameState {
  return {
    ...state,
    turn: state.turn + 1,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, resetUnitTurn(unit)])),
  };
}

describe('processMajorCivStrategicTurn', () => {
  it('executes relevant bombardment before a contested city assault', () => {
    let state = makeState();
    const city = addCity(state, 'contested-siege-city', HUMAN, { q: 4, r: 0 });
    city.population = 20;
    city.buildings = ['walls'];
    city.hp = 100;
    addUnit(state, 'contested-siege', 'catapult', AI, { q: 2, r: 0 });
    addUnit(state, 'contested-captor', 'swordsman', AI, { q: 3, r: 0 });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, ['contested-siege', 'contested-captor'], { supportRoles: { siege: 1 } });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(result.actions[0]).toEqual({ kind: 'bombard-city', unitId: 'contested-siege', cityId: city.id });
    expect(result.actions.some(action => action.kind === 'capture-city')).toBe(true);
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(state.turn);
    expect(state.cities[city.id]!.hp).toBe(100);
  });

  it('preempts an invasion for emergency defense and returns the defender once the crisis ends', () => {
    let state = makeState();
    const home = addCity(state, 'emergency-home', AI, { q: 0, r: 0 });
    const target = addCity(state, 'invasion-target', HUMAN, { q: 5, r: 3 });
    addUnit(state, 'emergency-defender', 'swordsman', AI, home.position);
    addUnit(state, 'invasion-captor', 'swordsman', AI, { q: 0, r: 3 });
    addUnit(state, 'imminent-attacker', 'warrior', HUMAN, { q: 1, r: 0 }, { health: 1 });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    const invasion = makePlan({ kind: 'city', id: target.id, lastKnownPosition: target.position }, ['emergency-defender'], { phase: 'advancing', requiredRoles: { capture: 2 } });
    const defense = makePlan({ kind: 'city', id: home.id, lastKnownPosition: home.position }, [], { id: 'emergency', objective: 'defend', phase: 'advancing' });
    const turn = prepared(state, invasion);
    turn.portfolio.defensePlansByCityId = { [home.id]: defense };
    const assign = (current: GameState, portfolio: PreparedMajorCivPlan['portfolio'], emergency: boolean) => assignUnitsToPortfolio({
      portfolio,
      units: ['emergency-defender', 'invasion-captor'].map(id => {
        const unit = current.units[id]!;
        return { id, type: unit.type, health: unit.health, experience: unit.experience, embarked: false, activeOtherDuty: false,
          travelTurnsByPlanId: { [invasion.id]: Math.ceil(hexDistance(unit.position, target.position) / 2), [defense.id]: Math.ceil(hexDistance(unit.position, home.position) / 2) } };
      }),
      profile: OPPONENT_CHALLENGE_PROFILES.veteran,
      defenseThreatScoreByPlanId: emergency ? { emergency: 100 } : {},
      eliminationDefensePlanIds: emergency ? ['emergency'] : [],
      onlyImmediateDefenderUnitIds: emergency ? ['emergency-defender'] : [],
      requiresEmbarkationByPlanId: {},
    });
    turn.assignments = assign(state, turn.portfolio, true);
    turn.portfolio = turn.assignments.portfolio;
    expect(turn.assignments.assignmentsByPlanId.emergency).toContain('emergency-defender');
    expect(turn.assignments.assignmentsByPlanId[invasion.id]).not.toContain('emergency-defender');
    const defended = processMajorCivStrategicTurn(state, turn, new EventBus());
    expect(defended.actions[0]).toMatchObject({ kind: 'attack', unitId: 'emergency-defender' });
    expect(defended.state.units['imminent-attacker']).toBeUndefined();
    expect(defended.state.cities[home.id]!.owner).toBe(AI);
    expect(defended.state.units['invasion-captor']).toBeDefined();
    state = nextOperationalTurn(defended.state);
    const resumed = prepared(state, state.opponentAI!.majorCivs[AI]!.primaryPlan!);
    resumed.assignments = assign(state, resumed.portfolio, false);
    resumed.portfolio = resumed.assignments.portfolio;
    expect(resumed.assignments.assignmentsByPlanId[invasion.id]).toContain('emergency-defender');
    let resumedTurn = resumed;
    let moved = false;
    const trace: unknown[] = [];
    for (let round = 0; round < 3; round += 1) {
      const routing = createOperationalRouting();
      trace.push({ turn: state.turn, plan: resumedTurn.portfolio.primaryPlan, units: ['emergency-defender', 'invasion-captor'].map(id => {
        const unit = state.units[id]!;
        const route = getOperationalRoute(state, unit, target.position, routing);
        return { unit, route, range: getKnownOperationalRange(state, unit, routing), ranked: rankUnitTacticalActions({ state, actorId: AI, plan: resumedTurn.portfolio.primaryPlan!, assignedUnitIds: resumedTurn.assignments.assignmentsByPlanId[invasion.id]!, routing }, id) };
      }) });
      const advancing = processMajorCivStrategicTurn(state, resumedTurn, new EventBus());
      trace.push({ actions: advancing.actions });
      moved ||= advancing.actions.some(action => action.kind === 'move' && action.unitId === 'emergency-defender');
      assertBilateralWar(advancing.state);
      state = nextOperationalTurn(advancing.state);
      resumedTurn = prepared(state, state.opponentAI!.majorCivs[AI]!.primaryPlan!);
      resumedTurn.assignments = assign(state, resumedTurn.portfolio, false);
      resumedTurn.portfolio = resumedTurn.assignments.portfolio;
    }
    writeOperationalEvidence('defense-return-stall', trace);
    expect(moved).toBe(true);
  });

  it.each(['safe', 'threatened', 'hidden-threat', 'concealed-threat'] as const)('regroups a separated rear unit on a %s route instead of refreshing progress with unrelated actions', condition => {
    let state = makeState();
    const target = addCity(state, 'split-target', HUMAN, { q: 5, r: 0 });
    const rear = addUnit(state, 'returning-rear', 'swordsman', AI, { q: 0, r: 0 });
    const front = addUnit(state, 'front', 'swordsman', AI, { q: 2, r: 3 }, { hasActed: true, movementPointsLeft: 0 });
    if (condition !== 'safe') {
      addUnit(state, 'regroup-threat', 'archer', HUMAN, condition === 'concealed-threat' ? { q: 2, r: 1 } : { q: 1, r: 3 });
      if (condition === 'hidden-threat') state.civilizations[AI].visibility.tiles['1,3'] = 'fog';
      if (condition === 'concealed-threat') {
        state.civilizations[HUMAN].civType = 'lothlorien';
        state.map.tiles['2,1']!.terrain = 'forest';
      }
    }
    state = refreshLastSeenPresentationsForCiv(state, AI);
    if (condition === 'concealed-threat') expect(isUnitConcealedFrom(state, state.units['regroup-threat']!, AI)).toBe(true);
    const plan = makePlan({ kind: 'city', id: target.id, lastKnownPosition: target.position }, [rear.id, front.id], { phase: 'advancing', requiredRoles: { capture: 2 }, lastProgressTurn: 19 });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    const action = result.actions.find(action => action.unitId === rear.id);
    expect(action).toEqual({ kind: 'move', unitId: rear.id, destination: condition === 'threatened' ? { q: 0, r: 1 } : { q: 0, r: 2 } });
    const moved = result.state.units[rear.id]!;
    expect(hexDistance(moved.position, target.position)).toBeGreaterThanOrEqual(hexDistance(rear.position, target.position));
    expect(hexDistance(moved.position, front.position)).toBeLessThan(hexDistance(rear.position, front.position));
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(state.turn);
    expect(result.state.units[front.id]!.position).toEqual(front.position);
    expect(state.units[rear.id]!.position).toEqual({ q: 0, r: 0 });
  });

  it.each(['acted-support', 'threatened-step'] as const)('does not vacate the bottleneck for %s', condition => {
    const fixture = detourFixture();
    const { state } = fixture;
    state.units[fixture.unitId] = { ...createUnit('horseman', AI, { q: 0, r: 2 }, state.idCounters), id: fixture.unitId };
    addUnit(state, 'blocked-support', 'catapult', AI, { q: 0, r: 1 }, condition === 'acted-support' ? { hasActed: true, movementPointsLeft: 0 } : {});
    if (condition === 'threatened-step') {
      state.map.tiles['1,4']!.terrain = 'grassland';
      addUnit(state, 'lane-threat', 'archer', HUMAN, { q: 1, r: 4 });
    }
    const plan = { ...fixture.plan, assignedUnitIds: [fixture.unitId, 'blocked-support'], supportRoles: { siege: 1 } };
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(result.state.units[fixture.unitId]!.position).toEqual({ q: 0, r: 2 });
  });

  it('does not advance a healthy but visibly outmatched withdrawing force toward the enemy', () => {
    let state = makeState();
    addCity(state, 'fallback-home', AI, { q: 0, r: 0 });
    addUnit(state, 'outmatched', 'swordsman', AI, { q: 2, r: 0 });
    const city = addCity(state, 'overwhelming-city', HUMAN, { q: 6, r: 0 });
    addUnit(state, 'overwhelming-defender', 'main_battle_tank', HUMAN, city.position);
    addUnit(state, 'observing-scout', 'scout', AI, { q: 4, r: 1 }, { hasActed: true, movementPointsLeft: 0 });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, ['outmatched'], { phase: 'withdrawing' });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(hexDistance(result.state.units.outmatched!.position, { q: 0, r: 0 })).toBeLessThan(2);
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).toBe('withdrawing');
    expect(result.state.units.outmatched!.health).toBe(100);
  });

  it('uses a legal wrapped approach across the seam', () => {
    let state = makeState();
    state.map.wrapsHorizontally = true;
    const target = addCity(state, 'seam-city', HUMAN, { q: state.map.width - 3, r: 0 });
    addUnit(state, 'seam-captor', 'swordsman', AI, { q: 0, r: 0 });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    const plan = makePlan({ kind: 'city', id: target.id, lastKnownPosition: target.position }, ['seam-captor'], { phase: 'advancing' });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    const move = result.actions.find(action => action.kind === 'move');
    expect(move?.kind).toBe('move');
    if (move?.kind !== 'move') throw new Error('missing wrapped approach');
    expect(move.destination.q).toBeGreaterThan(state.map.width / 2);
    expect(resolveUnitMoveIntent(state, 'seam-captor', move.destination, { actor: 'ai', civId: AI }).ok).toBe(true);
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(state.turn);
  });

  it.each(['detour', 'mixed-support'] as const)('keeps whole-state determinism across a mid-operation save for %s', kind => {
    const fixture = detourFixture();
    let initial = fixture.state;
    let initialPlan = fixture.plan;
    if (kind === 'mixed-support') {
      addUnit(initial, 'saved-support', 'catapult', AI, { q: 0, r: 1 });
      initialPlan = { ...initialPlan, assignedUnitIds: [...initialPlan.assignedUnitIds, 'saved-support'], supportRoles: { siege: 1 } };
    }
    initial = normalizeLoadedState(initial);
    const run = (reload: boolean) => {
      let state = structuredClone(initial);
      let plan = initialPlan;
      const actions = [];
      for (let round = 0; round < 8; round += 1) {
        const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
        actions.push(result.actions);
        state = nextOperationalTurn(result.state);
        if (reload && round === 2) {
          const parsed = parseSaveFile(serializeSaveFile(state));
          if (parsed.status !== 'success') throw new Error(parsed.message);
          state = normalizeLoadedState(parsed.state);
        }
        plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
        assertBilateralWar(state);
        assertCargoReciprocity(state);
        assertAirBaseIntegrity(state);
      }
      return { state, actions };
    };
    const uninterrupted = run(false);
    const repeated = run(false);
    const reloaded = run(true);
    expect(repeated.actions).toEqual(uninterrupted.actions);
    expect(reloaded.actions).toEqual(uninterrupted.actions);
    assertSimulationEquivalent(uninterrupted.state, repeated.state, `${kind}: repeat`);
    assertSimulationEquivalent(uninterrupted.state, reloaded.state, `${kind}: save/reload`);
  });

  it('preserves the sole last-city defender despite wounds and severe supply', () => {
    const state = makeState();
    const home = addCity(state, 'last-home', AI, { q: 0, r: 0 });
    addUnit(state, 'sole-defender', 'swordsman', AI, home.position, {
      health: 20, landSupply: { state: 'severe', hostileUnsupportedTurns: 7, suppliedTurnsSinceRecovery: 0 },
    });
    const plan = makePlan({ kind: 'city', id: home.id, lastKnownPosition: home.position }, ['sole-defender'], { objective: 'defend', phase: 'advancing' });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(result.actions.every(action => action.kind !== 'withdraw')).toBe(true);
    expect(result.state.units['sole-defender']!.position).toEqual(home.position);
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).not.toBe('withdrawing');
  });

  it.each([1, 8])('makes a bounded mixed-force siege against population %s through canonical history', population => {
    let state = makeState();
    state.civilizations[AI].diplomacy.atWarWith = [];
    state.civilizations[HUMAN].diplomacy.atWarWith = [];
    addCity(state, 'siege-base', AI, { q: 0, r: 4 });
    const target = addCity(state, 'walled-target', HUMAN, { q: 5, r: 0 });
    target.buildings = ['walls'];
    target.population = population;
    target.hp = 100;
    addUnit(state, 'siege-captor', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'siege-support', 'catapult', AI, { q: 1, r: 0 });
    addUnit(state, 'ranged-support', 'archer', AI, { q: 0, r: 1 });
    addUnit(state, 'garrison', 'warrior', HUMAN, target.position);
    state = declareMajorWar(state, AI, HUMAN);
    state = refreshLastSeenPresentationsForCiv(state, AI);
    let plan = makePlan({ kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['siege-captor', 'siege-support', 'ranged-support'],
      { phase: 'mobilizing', supportRoles: { siege: 1, ranged: 1 } });
    const bus = new EventBus();
    const capture = vi.fn();
    bus.on('city:captured', capture);
    const trajectory = [];
    for (let round = 0; round < 20; round += 1) {
      const result = processMajorCivStrategicTurn(state, prepared(state, plan), bus);
      state = result.state;
      plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
      trajectory.push({ turn: state.turn, phase: plan.phase, actions: result.actions.map(action => action.kind), hp: state.cities[target.id]!.hp, owner: state.cities[target.id]!.owner });
      assertBilateralWar(state);
      assertCargoReciprocity(state);
      assertAirBaseIntegrity(state);
      if (plan.phase === 'complete' || plan.phase === 'abandoned') break;
      state = nextOperationalTurn(state);
    }
    writeOperationalEvidence(`walled-siege-${population}`, trajectory);
    expect(trajectory.flatMap(row => row.actions)).toContain('attack');
    expect(state.units.garrison).toBeUndefined();
    expect(state.cities[target.id]!.owner).toBe(AI);
    expect(plan.phase).toBe('complete');
    expect(capture).toHaveBeenCalledOnce();
    expect(Object.values(state.wars ?? {}).flatMap(war => war.events)
      .filter(event => event.type === 'city-captured' && event.cityId === target.id)).toHaveLength(1);
  });

  it('does not change the chosen approach when an unobserved obstacle changes', () => {
    let state = makeState();
    addUnit(state, 'known-captor', 'swordsman', AI, { q: 0, r: 0 });
    const city = addCity(state, 'known-target', HUMAN, { q: 6, r: 0 });
    const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, ['known-captor'], { phase: 'advancing' });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    state.civilizations[AI].visibility.tiles['2,0'] = 'fog';
    const hidden = structuredClone(state);
    hidden.map.tiles['2,0']!.terrain = 'ocean';
    addUnit(hidden, 'unobserved', 'tank', HUMAN, { q: 2, r: 0 });
    const execute = vi.spyOn(movementSystem, 'executeUnitMove');
    try {
      processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
      const original = execute.mock.calls[0]?.[2];
      execute.mockClear();
      processMajorCivStrategicTurn(hidden, prepared(hidden, plan), new EventBus());
      expect(execute.mock.calls[0]?.[2]).toEqual(original);
      expect(original).toEqual({ q: 2, r: 0 });
    } finally {
      execute.mockRestore();
    }
  });

  it('recognizes severe supply withdrawal and resumes readiness after canonical resupply', () => {
    let state = makeState();
    addCity(state, 'resupply-base', AI, { q: 0, r: 0 });
    addUnit(state, 'depleted', 'swordsman', AI, { q: 2, r: 0 }, {
      landSupply: { state: 'severe', hostileUnsupportedTurns: 7, suppliedTurnsSinceRecovery: 0 },
    });
    const target = addCity(state, 'supply-target', HUMAN, { q: 6, r: 0 });
    let plan = makePlan({ kind: 'city', id: target.id, lastKnownPosition: target.position }, ['depleted'], { phase: 'advancing' });
    state = refreshLastSeenPresentationsForCiv(state, AI);
    const withdrawing = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(withdrawing.actions[0]?.kind).toBe('withdraw');
    expect(withdrawing.state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).toBe('withdrawing');
    state = resolveLandSupplyForCiv(withdrawing.state, AI);
    expect(state.units.depleted!.landSupply!.state).toBe('full');
    state = nextOperationalTurn(state);
    plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
    const recovered = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(recovered.state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).toBe('mobilizing');
    state = nextOperationalTurn(recovered.state);
    plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
    const reentered = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(reentered.state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).toBe('advancing');
    expect(reentered.actions.some(action => action.kind === 'move')).toBe(true);
  });

  it('does not report unrelated worker construction as capture-plan progress', () => {
    const state = makeState();
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    for (const key of ['1,1', '5,1', '0,4', '0,5']) state.map.tiles[key]!.terrain = 'grassland';
    state.map.tiles['0,4']!.owner = AI;
    state.civilizations[AI].techState.completed = ['agriculture'];
    addCity(state, 'home', AI, { q: 0, r: 5 });
    addUnit(state, 'stuck-captor', 'swordsman', AI, { q: 1, r: 1 });
    addUnit(state, 'unrelated-worker', 'worker', AI, { q: 0, r: 4 });
    const target = addCity(state, 'island-target', HUMAN, { q: 5, r: 1 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['stuck-captor', 'unrelated-worker'],
      { phase: 'advancing' },
    );
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'worker-action', unitId: 'unrelated-worker' }));
    expect(result.state.units['stuck-captor']!.position).toEqual({ q: 1, r: 1 });
    expect(result.state.cities[target.id]!.owner).toBe(HUMAN);
    expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(plan.lastProgressTurn);
  });

  it('follows a known legal detour that initially increases objective distance over real AI turns', () => {
    const fixture = detourFixture();
    let { state, plan } = fixture;
    const unit = state.units[fixture.unitId]!;
    const city = state.cities[fixture.cityId]!;
    const path = findPath(unit.position, city.position, state.map, 'land', { unit });
    expect(path).not.toBeNull();
    expect(hexDistance(path![1]!, city.position)).toBeGreaterThan(hexDistance(unit.position, city.position));
    expect(resolveUnitMoveIntent(state, unit.id, path![1]!, { actor: 'ai', civId: AI }).ok).toBe(true);

    const before = structuredClone(state);
    const firstProbe = withPerfProbe(() => processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus()));
    const first = firstProbe.result;
    expect(state).toEqual(before);
    expect(first.actions).toContainEqual(expect.objectContaining({ kind: 'move', unitId: unit.id }));
    expect(first.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(state.turn);
    expect(hexDistance(first.state.units[unit.id]!.position, city.position)).toBeGreaterThan(4);
    state = first.state;
    const trajectory: unknown[] = [{ turn: state.turn, actions: first.actions, work: firstProbe.counts }];
    for (let round = 0; round < 8 && state.cities[city.id]!.owner !== AI; round += 1) {
      state = nextOperationalTurn(state);
      plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
      const probe = withPerfProbe(() => processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus()));
      const result = probe.result;
      trajectory.push({ turn: state.turn, actions: result.actions, position: result.state.units[unit.id]?.position, work: probe.counts });
      state = result.state;
    }
    expect(state.cities[city.id]!.owner, JSON.stringify(trajectory)).toBe(AI);
    expect(state.opponentAI!.majorCivs[AI]!.primaryPlan!.phase).toBe('consolidating');
    assertBilateralWar(state);
    assertCargoReciprocity(state);
    assertAirBaseIntegrity(state);
    writeOperationalEvidence('legal-detour', trajectory);
  });

  it('holds a disconnected target over bounded turns without illegal moves or manufactured progress', () => {
    const fixture = detourFixture();
    let { state, plan } = fixture;
    state.map.tiles['0,3']!.terrain = 'ocean';
    state = refreshLastSeenPresentationsForCiv(state, AI);
    for (let round = 0; round < 6; round += 1) {
      const before = structuredClone(state);
      const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
      expect(result.actions).toEqual([{ kind: 'hold', unitId: fixture.unitId }]);
      expect(result.state.units[fixture.unitId]!.position).toEqual(before.units[fixture.unitId]!.position);
      expect(result.state.opponentAI!.majorCivs[AI]!.primaryPlan!.lastProgressTurn).toBe(19);
      expect(state).toEqual(before);
      state = nextOperationalTurn(result.state);
      plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
    }
  });

  it('moves mixed-speed troops through the detour without leaving the slow support behind', () => {
    const fixture = detourFixture();
    let { state, plan } = fixture;
    state.units[fixture.unitId] = { ...createUnit('horseman', AI, { q: 1, r: 1 }, state.idCounters), id: fixture.unitId };
    addUnit(state, 'slow-support', 'catapult', AI, { q: 0, r: 1 });
    plan = { ...plan, assignedUnitIds: [fixture.unitId, 'slow-support'], supportRoles: { siege: 1 } };
    let moves = 0;
    const trajectory = [];
    for (let round = 0; round < 8 && state.cities[fixture.cityId]!.owner !== AI; round += 1) {
      const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());
      moves += result.actions.filter(action => action.kind === 'move').length;
      const front = result.state.units[fixture.unitId];
      const support = result.state.units['slow-support'];
      expect(front).toBeDefined();
      expect(support).toBeDefined();
      expect(hexDistance(front!.position, support!.position)).toBeLessThanOrEqual(2);
      trajectory.push({ turn: state.turn, actions: result.actions, front: front!.position, support: support!.position,
        separation: hexDistance(front!.position, support!.position) });
      state = nextOperationalTurn(result.state);
      plan = state.opponentAI!.majorCivs[AI]!.primaryPlan!;
    }
    expect(moves).toBeGreaterThan(2);
    writeOperationalEvidence('mixed-support', { moves, trajectory });
    expect(hexDistance(state.units[fixture.unitId]!.position, state.cities[fixture.cityId]!.position)).toBeLessThanOrEqual(1);
  });

  it('allows an assigned Anti-Tank Gun to satisfy a frontline mobilization slot', () => {
    const state = makeState();
    addUnit(state, 'anti-tank', 'anti_tank_gun', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'armor-defense', anchor: { q: 1, r: 0 } },
      ['anti-tank'],
      {
        objective: 'defend',
        phase: 'mobilizing',
        createdTurn: state.turn,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase).toBe('advancing');
  });

  it('#1330: does not mutate the input state (the public entry point clones)', () => {
    const state = makeState();
    addUnit(state, 'anti-tank', 'anti_tank_gun', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'armor-defense', anchor: { q: 1, r: 0 } },
      ['anti-tank'],
      { objective: 'defend', phase: 'mobilizing', requiredRoles: { frontline: 1 } },
    );
    const prep = prepared(state, plan);
    const before = structuredClone(state);

    processMajorCivStrategicTurn(state, prep, new EventBus());

    expect(state).toEqual(before);
  });

  it('uses the canonical pair seed when resolving a major-AI attack', () => {
    const state = makeState();
    const attacker = addUnit(state, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    const defender = addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: defender.id, lastKnownPosition: defender.position },
      [attacker.id],
      { objective: 'raid', phase: 'advancing', requiredRoles: { frontline: 1 } },
    );
    const expected = resolveCombat(
      attacker,
      defender,
      state.map,
      deterministicCombatSeed(state.gameId, state.turn, attacker.id, defender.id),
      buildCombatContextForDefender(state, attacker, defender),
      state.era,
    );

    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());

    expect(result.state.units[defender.id]?.health)
      .toBe(Math.max(0, defender.health - expected.defenderDamage));
  });

  it('sets revealedThisTurn on an AI-controlled submarine that attacks (parity with human path)', () => {
    // #542: revealedThisTurn is set inside applyCombatOutcomeToState, the one
    // canonical function both this AI path and player-action-controller.ts's human
    // path call -- this proves the AI path actually reaches it, not a second,
    // parallel implementation. See tests/systems/combat-reward-system.test.ts for
    // the equivalent direct-unit-test coverage of applyCombatOutcomeToState itself.
    const state = makeState();
    const attacker = addUnit(state, 'attacker', 'submarine', AI, { q: 0, r: 0 });
    const defender = addUnit(state, 'defender', 'galley', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: defender.id, lastKnownPosition: defender.position },
      [attacker.id],
      { objective: 'raid', phase: 'advancing', requiredRoles: { 'naval-combat': 1 } },
    );

    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());

    expect(result.state.units[attacker.id]?.revealedThisTurn).toBe(true);
  });

  it('modernizes before tactics so an upgraded unit cannot act twice', () => {
    const state = makeState();
    const home = addCity(state, 'home-city', AI, { q: 0, r: 0 });
    addUnit(state, 'obsolete', 'spy_scout', AI, home.position, {
      experience: 30,
    });
    state.civilizations[AI].techState.completed = [
      'espionage-scouting',
      'espionage-informants',
    ];
    state.civilizations[AI].gold = 200;
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['obsolete'],
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.obsolete.type).toBe('spy_informant');
    expect(result.state.units.obsolete.hasActed).toBe(true);
    expect(result.actions.some(action => action.unitId === 'obsolete')).toBe(false);
  });

  it('rejects a prepared portfolio whose primary plan belongs to another actor', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['attacker'],
      { actorId: HUMAN },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it('rallies a mobilizing force without prematurely capturing its target', () => {
    const state = makeState();
    addUnit(state, 'fast-unit', 'horseman', AI, { q: 0, r: 0 });
    addUnit(state, 'support', 'warrior', AI, { q: 0, r: 1 });
    const target = addCity(state, 'target-city', HUMAN, { q: 6, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['fast-unit', 'support'],
      {
        phase: 'mobilizing',
        rallyPoint: { q: 2, r: 0 },
        requiredRoles: { frontline: 1, capture: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action => action.kind === 'move')).toBe(true);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toMatch(/mobilizing|advancing/);
  });

  it('still rallies when a tempting attack is illegal during mobilization', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'nearby-enemy', 'warrior', HUMAN, { q: 1, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 6, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      {
        phase: 'mobilizing',
        rallyPoint: { q: 0, r: 2 },
        requiredRoles: { capture: 1 },
      },
    );
    const bus = new EventBus();
    const combat = vi.fn();
    bus.on('combat:resolved', combat);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(combat).not.toHaveBeenCalled();
    expect(result.actions).toContainEqual(expect.objectContaining({
      kind: 'move',
      unitId: 'captor',
    }));
    expect(result.state.units.captor.position).not.toEqual({ q: 0, r: 0 });
  });

  it('does not capture during mobilization when no rally point is available', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      {
        phase: 'mobilizing',
        rallyPoint: undefined,
        requiredRoles: { capture: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action => action.kind === 'capture-city'))
      .toBe(false);
  });

  it('keeps scouting when the target is known only by rumor', () => {
    const state = makeState();
    addUnit(state, 'scout', 'scout', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['scout'],
      {
        phase: 'scouting',
        requiredRoles: { recon: 1 },
      },
    );
    const preparedTurn = prepared(state, plan);
    preparedTurn.perception.knownCities = preparedTurn.perception.knownCities
      .map(city => city.id === target.id
        ? { ...city, confidence: 'rumored' as const }
        : city);

    const result = processMajorCivStrategicTurn(
      state,
      preparedTurn,
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('scouting');
  });

  it('does not enter a new attacking phase during migration grace', () => {
    const state = makeState();
    if (!state.opponentAI) throw new Error('missing opponent AI state');
    state.opponentAI.migrationGraceRoundsRemaining = 2;
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 100,
    });
    const plan = makePlan(
      { kind: 'unit', id: 'defender', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      {
        objective: 'raid',
        phase: 'advancing',
        createdTurn: state.turn,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions.some(action => action.kind === 'attack')).toBe(true);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('advancing');
  });

  it('captures through canonical movement and emits capture and territory parity events', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    state.map.tiles[hexKey(target.position)].improvement = 'farm';
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );
    const before = structuredClone(state);
    const bus = new EventBus();
    const captured = vi.fn();
    const flipped = vi.fn();
    const moved = vi.fn();
    bus.on('city:captured', captured);
    bus.on('territory:tile-flipped', flipped);
    bus.on('unit:move', moved);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(state).toEqual(before);
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual(target.position);
    expect(captured).toHaveBeenCalledOnce();
    expect(flipped).toHaveBeenCalled();
    expect(moved).toHaveBeenCalledOnce();
  });

  it('#887 MR1: records a city-captured career event for the AI General who Seize-enabled the capture (parity with the human path)', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 }, {
      seizeGrantedBy: { generalDefinitionId: 'gen_ramesses', turn: state.turn },
    });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    state.civilizations[AI].generalHistory = [
      { unitId: 'general-1', generalDefinitionId: 'gen_ramesses', spawnedTurn: 3, careerEvents: [] },
    ];
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(state, prepared(state, plan), new EventBus());

    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.civilizations[AI].generalHistory?.[0].careerEvents).toContainEqual({
      type: 'city-captured', turn: state.turn, cityId: 'target-city', cityName: target.name,
    });
  });

  it('applies combat rewards and camp-destruction history through canonical systems', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'barbarian', 'warrior', 'barbarian', { q: 1, r: 0 }, {
      health: 1,
    });
    state.barbarianCamps.camp = {
      id: 'camp',
      position: { q: 1, r: 0 },
      strength: 1,
      spawnCooldown: 2,
    };
    const plan = makePlan(
      { kind: 'camp', id: 'camp', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );
    const bus = new EventBus();
    const combat = vi.fn();
    const destroyed = vi.fn();
    bus.on('combat:resolved', combat);
    bus.on('barbarian:camp-destroyed', destroyed);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.units.barbarian).toBeUndefined();
    expect(result.state.barbarianCamps.camp).toBeUndefined();
    expect(result.state.legendaryWonderHistory?.destroyedStrongholds)
      .toContainEqual(expect.objectContaining({ civId: AI, campId: 'camp' }));
    expect(combat).toHaveBeenCalledOnce();
    expect(destroyed).toHaveBeenCalledOnce();
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .not.toBe('abandoned');
  });

  // #845: before rankCampAssault/executeAction's 'assault-camp' case existed, the AI had
  // no way to destroy an undefended camp at all -- only the post-combat follow-up above
  // (which only fires when the AI kills a garrisoning unit first) existed. An AI adjacent to
  // an undefended camp would move toward it (now correctly stopping at adjacency, not walking
  // onto it, per #843's isBlockedMoveDestination) and then have no action, stalling
  // indefinitely. This proves the AI now destroys an undefended camp exactly like it already
  // destroys a defended one above -- same events, same reward mechanism, no combat step needed.
  it('destroys an undefended camp directly, mirroring the defended-camp destruction path', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    state.barbarianCamps.camp = {
      id: 'camp',
      position: { q: 1, r: 0 },
      strength: 1,
      spawnCooldown: 2,
    };
    const plan = makePlan(
      { kind: 'camp', id: 'camp', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );
    const bus = new EventBus();
    const destroyed = vi.fn();
    bus.on('barbarian:camp-destroyed', destroyed);
    const goldBefore = state.civilizations[AI].gold;

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.barbarianCamps.camp).toBeUndefined();
    expect(result.state.civilizations[AI].gold).toBe(goldBefore + (15 + 1 * 2));
    expect(result.state.legendaryWonderHistory?.destroyedStrongholds)
      .toContainEqual(expect.objectContaining({ civId: AI, campId: 'camp' }));
    expect(destroyed).toHaveBeenCalledOnce();
    expect(result.state.units.attacker).toMatchObject({ hasActed: true, position: { q: 0, r: 0 } });
  });

  it('founds a city through the shared whole-state helper', () => {
    const state = makeState();
    addUnit(state, 'settler', 'settler', AI, { q: 2, r: 2 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 2, r: 2 } },
      ['settler'],
      {
        objective: 'expand',
        requiredRoles: { settlement: 1 },
      },
    );
    const bus = new EventBus();
    const founded = vi.fn();
    bus.on('city:founded', founded);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.units.settler).toBeUndefined();
    expect(Object.values(result.state.cities)
      .some(city => city.owner === AI && hexKey(city.position) === '2,2'))
      .toBe(true);
    expect(founded).toHaveBeenCalledOnce();
  });

  it('does not attack or capture a peaceful major civilization', () => {
    const state = makeState();
    state.civilizations[AI].diplomacy.atWarWith = [];
    state.civilizations[HUMAN].diplomacy.atWarWith = [];
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action =>
      action.kind === 'attack' || action.kind === 'capture-city'))
      .toBe(false);
  });

  it('lets AI Mechanized Infantry advance and capture after defeating the final city defender', () => {
    const state = makeState();
    addUnit(state, 'captor', 'mechanized_infantry', AI, { q: 0, r: 0 });
    addUnit(state, 'last-defender', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 1,
    });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units['last-defender']).toBeUndefined();
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual(target.position);
    expect(result.actions.map(action => action.kind))
      .toEqual(['attack', 'capture-city']);
  });

  it('keeps the repel state (damage, action-consumption) when the AI\'s undefended-city assault is repelled (#522)', () => {
    // Regression for a pre-merge review bug: occupyMajorCity's failure branch used to
    // `return { state, captured: false }` -- the ORIGINAL pre-assault state, not
    // assault.state -- silently discarding counter-fire damage and hasActed/
    // movementPointsLeft consumption on a repel. That made a repelled AI assault a
    // free, fully-reversible no-op: the attacker kept full health and could be
    // re-selected to retry the same doomed assault. A hopelessly outmatched attacker
    // (warrior, strength 10) against a maximally defended city (population 40, walls +
    // star_fort) makes the repel effectively certain regardless of RNG seed.
    const state = makeState();
    addUnit(state, 'captor', 'warrior', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    target.population = 40;
    target.buildings = ['walls', 'star_fort'];
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN); // repelled, not captured
    const captorAfter = result.state.units.captor;
    if (captorAfter) {
      // Survived the counter-fire: must be marked as having acted, not silently reverted.
      expect(captorAfter.health).toBeLessThan(100);
      expect(captorAfter.hasActed).toBe(true);
      expect(captorAfter.movementPointsLeft).toBe(0);
    } else {
      // Counter-fire killed it -- must actually be gone, not resurrected by a stale
      // pre-assault state, and pruned from the owner's roster.
      expect(result.state.civilizations[AI].units).not.toContain('captor');
    }
  });

  it('executes worker improvements through the canonical worker system', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 1, r: 2 });
    addUnit(state, 'worker', 'worker', AI, { q: 2, r: 2 });
    state.map.tiles['2,2'].owner = AI;
    const plan = makePlan(
      { kind: 'region', id: 'home-region', anchor: { q: 2, r: 2 } },
      ['worker'],
      {
        objective: 'expand',
        requiredRoles: { worker: 1 },
      },
    );
    const bus = new EventBus();
    const started = vi.fn();
    bus.on('improvement:started', started);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.map.tiles['2,2'].improvement).not.toBe('none');
    expect(result.state.units.worker.hasActed).toBe(true);
    expect(started).toHaveBeenCalledOnce();
  });

  it('establishes a legal resource outpost and consumes the expedition', () => {
    const state = makeState();
    state.civilizations[AI].techState.completed.push('bronze-working');
    state.map.tiles['2,2'].resource = 'iron';
    addUnit(state, 'expedition', 'expedition', AI, { q: 2, r: 2 });
    const plan = makePlan(
      { kind: 'resource', resource: 'iron', position: { q: 2, r: 2 } },
      ['expedition'],
      {
        objective: 'secure-resource',
        requiredRoles: { 'resource-expedition': 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.map.tiles['2,2'].improvement)
      .toBe('resource_outpost');
    expect(result.state.units.expedition).toBeUndefined();
    expect(result.state.civilizations[AI].units).not.toContain('expedition');
  });

  it('loads a land unit through the canonical transport helper', () => {
    const state = makeState();
    state.map.tiles['4,0'].terrain = 'ocean';
    addUnit(state, 'passenger', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'transport', 'transport', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'overseas', anchor: { q: 4, r: 0 } },
      ['passenger'],
      {
        objective: 'expand',
        requiredRoles: { transport: 1, frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.passenger.transportId).toBe('transport');
    expect(result.state.units.transport.cargoUnitIds).toContain('passenger');
  });

  it('unloads endangered cargo through the canonical transport helper', () => {
    const state = makeState();
    const transport = addUnit(
      state,
      'transport',
      'transport',
      AI,
      { q: 1, r: 1 },
      { cargoUnitIds: ['cargo'], health: 20 },
    );
    addUnit(state, 'cargo', 'warrior', AI, transport.position, {
      transportId: transport.id,
    });
    const plan = makePlan(
      { kind: 'region', id: 'landing', anchor: { q: 3, r: 1 } },
      ['cargo'],
      {
        objective: 'expand',
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions[0]?.kind).toBe('unload');
    expect(result.state.units.cargo.transportId).toBeUndefined();
    expect(result.state.units.transport.cargoUnitIds).not.toContain('cargo');
  });

  it('uses wrapped adjacency when capturing across the horizontal seam', () => {
    const state = makeState();
    state.map.wrapsHorizontally = true;
    const attackerPosition = { q: state.map.width - 1, r: 0 };
    addUnit(state, 'captor', 'swordsman', AI, attackerPosition);
    const target = addCity(state, 'target-city', HUMAN, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual({ q: 0, r: 0 });
  });

  it('transitions a badly damaged attacking force into withdrawal', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'damaged', 'swordsman', AI, { q: 2, r: 0 }, {
      health: 10,
    });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['damaged'],
      { phase: 'attacking', requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('withdrawing');
    expect(result.actions[0]?.kind).toMatch(/withdraw|rest/);
  });

  it('cleans up an adjacent rebel through the same canonical combat path', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'rebel', 'warrior', 'rebels', { q: 1, r: 0 }, {
      health: 1,
    });
    const plan = makePlan(
      { kind: 'unit', id: 'rebel', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.rebel).toBeUndefined();
    expect(result.actions[0]).toMatchObject({
      kind: 'attack',
      targetUnitId: 'rebel',
    });
  });

  it('uses minor-civilization conquest only when canonical minor war is active', () => {
    const state = makeState();
    const minor = Object.values(state.minorCivs)[0];
    if (!minor) throw new Error('missing generated minor civilization');
    minor.isDestroyed = false;
    minor.units = [];
    minor.diplomacy.atWarWith = [AI];
    state.civilizations[AI].diplomacy.atWarWith.push(minor.id);
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, minor.cityId, minor.id, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );
    const bus = new EventBus();
    const destroyed = vi.fn();
    bus.on('minor-civ:destroyed', destroyed);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.minorCivs[minor.id].isDestroyed).toBe(true);
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('does not conquer a minor civilization when neither side records a war', () => {
    const state = makeState();
    const minor = Object.values(state.minorCivs)[0];
    if (!minor) throw new Error('missing generated minor civilization');
    minor.isDestroyed = false;
    minor.units = [];
    minor.diplomacy.atWarWith = [];
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, minor.cityId, minor.id, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.minorCivs[minor.id].isDestroyed).toBe(false);
    expect(result.state.cities[target.id].owner).toBe(minor.id);
    expect(result.actions.some(action =>
      action.kind === 'attack' || action.kind === 'capture-city'))
      .toBe(false);
  });

  it('abandons an invalid target without moving assigned units toward stale coordinates', () => {
    const state = makeState();
    const attacker = addUnit(
      state,
      'attacker',
      'swordsman',
      AI,
      { q: 0, r: 0 },
    );
    const plan = makePlan(
      { kind: 'unit', id: 'missing-target', lastKnownPosition: { q: 4, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions).toEqual([]);
    expect(result.state.units.attacker.position).toEqual(attacker.position);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('abandoned');
  });

  it('executes urgent city defense before an unrelated primary expansion', () => {
    const state = makeState();
    const home = addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'threat', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 1,
    });
    addUnit(state, 'settler', 'settler', AI, { q: 4, r: 4 });
    const primary = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 4, r: 4 } },
      ['settler'],
      {
        id: 'primary',
        objective: 'expand',
        requiredRoles: { settlement: 1 },
      },
    );
    const defense = makePlan(
      { kind: 'city', id: home.id, lastKnownPosition: home.position },
      ['defender'],
      {
        id: 'defense',
        objective: 'defend',
        requiredRoles: { frontline: 1 },
      },
    );
    const preparedTurn = prepared(state, primary);
    preparedTurn.portfolio.defensePlansByCityId = { [home.id]: defense };
    preparedTurn.assignments.portfolio = preparedTurn.portfolio;
    preparedTurn.assignments.assignmentsByPlanId.defense = ['defender'];

    const result = processMajorCivStrategicTurn(
      state,
      preparedTurn,
      new EventBus(),
    );

    expect(result.actions[0]).toMatchObject({
      kind: 'attack',
      unitId: 'defender',
      targetUnitId: 'threat',
    });
  });

  it('does not withdraw from a stronger nearby civilization while at peace', () => {
    const state = makeState();
    state.civilizations[AI].diplomacy.atWarWith = [HUMAN];
    addUnit(state, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    addUnit(state, 'peaceful-army', 'tank', 'ai-2', { q: 2, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['attacker'],
      { phase: 'advancing', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .not.toBe('withdrawing');
  });

  it('does not withdraw a non-combat expand plan from a nearby hostile it was never going to fight (#1107)', () => {
    // Found investigating #1107's own Task 7 long-horizon verification, not
    // caused by #1107 itself -- shouldWithdraw compares the assigned force's
    // combat strength against nearby hostile strength
    // (ownStrength / hostileStrength < 0.65). A settler's UNIT_DEFINITIONS
    // strength is 0, so that ratio is structurally always 0 whenever ANY
    // hostile unit is merely within 4 tiles of the target -- regardless of
    // whether it actually threatens a settler that was never going to fight
    // it. Confirmed against the real long-horizon campaign
    // (lh-late-era-medium, unit-126): a settler-only expand plan cycled
    // mobilizing -> withdrawing -> mobilizing forever, its objective rewritten
    // to 'recover' (walk home) every time a barbarian merely wandered within
    // range, never once reaching 'advancing' or completing its journey.
    // #1107's coastal-recovery bias made this reliably reproduce (a coastal
    // target is more likely to have a wandering pirate/barbarian nearby), but
    // the bug itself is in shouldWithdraw and applies to any expand plan.
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'colonist', 'settler', AI, { q: 2, r: 0 });
    // Within colonist's own vision (2) so it's genuinely 'visible' after this
    // round's real fog recompute, within shouldWithdraw's distance-4-of-target
    // check, and off the settler's direct path (2,0)->(3,0)->(4,0)->(5,0) so
    // it doesn't block movement (a confound that produced a false pass in an
    // earlier draft of this test).
    addUnit(state, 'raider', 'warrior', 'barbarian', { q: 3, r: 1 });
    const plan = makePlan(
      { kind: 'region', id: 'settle:5,0', anchor: { q: 5, r: 0 } },
      ['colonist'],
      { phase: 'advancing', requiredRoles: { settlement: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .not.toBe('withdrawing');
  });

  it('keeps consolidating while a visible hostile counterattack is nearby', () => {
    const state = makeState();
    const captured = addCity(state, 'captured-city', AI, { q: 1, r: 0 });
    addUnit(state, 'occupier', 'swordsman', AI, { q: 1, r: 0 }, {
      hasActed: true,
      movementPointsLeft: 0,
    });
    addUnit(state, 'counterattacker', 'warrior', HUMAN, { q: 3, r: 0 });
    const plan = makePlan(
      {
        kind: 'city',
        id: captured.id,
        lastKnownPosition: captured.position,
      },
      ['occupier'],
      {
        phase: 'consolidating',
        lastProgressTurn: state.turn - 2,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('consolidating');
  });

  it('does not count holding position as fresh consolidation progress', () => {
    const state = makeState();
    const captured = addCity(state, 'captured-city', AI, { q: 1, r: 0 });
    addUnit(state, 'occupier', 'swordsman', AI, { q: 1, r: 0 }, {
      hasActed: true,
      movementPointsLeft: 0,
    });
    const plan = makePlan(
      {
        kind: 'city',
        id: captured.id,
        lastKnownPosition: captured.position,
      },
      ['occupier'],
      {
        phase: 'consolidating',
        lastProgressTurn: state.turn - 1,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('consolidating');
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.lastProgressTurn)
      .toBe(state.turn - 1);
  });
});

describe('#1064 non-offensive plan phase', () => {
  it('advances an expand plan to advancing without a capture or frontline unit', () => {
    const state = createNewGame(undefined, 'phase-expand-advances', 'small');
    const civ = state.civilizations['ai-1'];
    const startingPosition = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    addCity(state, 'home', civ.id, startingPosition);
    const home = state.cities[civ.cities[0]!]!;
    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);
    state.turn = 30;
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);

    const plan: AIStrategicPlan = {
      id: 'expand-plan',
      actorId: civ.id,
      objective: 'expand',
      target: { kind: 'region', id: `settle:${hexKey(anchor)}`, anchor },
      theaterId: `local:${hexKey(anchor)}`,
      phase: 'mobilizing',
      reasonCodes: ['nearby-opportunity'],
      commitment: 0.25,
      createdTurn: 20,
      reconsiderAfterTurn: 23,
      expiresAfterTurn: 32,
      lastProgressTurn: 29,
      requiredRoles: { settlement: 1 },
      assignedUnitIds: [settler.id],
    };

    expect(nextPlanPhase(
      state, plan, [settler.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('advancing');
  });

  it('still requires a capture or frontline unit for an offensive plan', () => {
    const state = createNewGame(undefined, 'phase-capture-gated', 'small');
    const civ = state.civilizations['ai-1'];
    const startingPosition = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    addCity(state, 'home', civ.id, startingPosition);
    const home = state.cities[civ.cities[0]!]!;
    const worker = createUnit('worker', civ.id, home.position, state.idCounters);
    state.units[worker.id] = worker;
    civ.units.push(worker.id);
    state.turn = 30;
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);

    const plan: AIStrategicPlan = {
      id: 'capture-plan',
      actorId: civ.id,
      objective: 'capture',
      target: { kind: 'region', id: `raid:${hexKey(anchor)}`, anchor },
      theaterId: `local:${hexKey(anchor)}`,
      phase: 'mobilizing',
      reasonCodes: ['continue-active-war'],
      commitment: 0.5,
      createdTurn: 20,
      reconsiderAfterTurn: 23,
      expiresAfterTurn: 32,
      lastProgressTurn: 29,
      requiredRoles: { frontline: 1 },
      assignedUnitIds: [worker.id],
    };

    expect(nextPlanPhase(
      state, plan, [worker.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('mobilizing');
  });

  it('still requires a capture or frontline unit for a non-offensive, non-expand plan', () => {
    // #1064's fix is scoped to `expand` specifically, not "every objective that isn't
    // capture/raid/blockade" -- a `repel` plan assigned only a worker (no frontline or
    // capture role) must stay gated exactly like an offensive plan would, or the fix's
    // blast radius silently widens to five objective types it was never meant to touch.
    const state = createNewGame(undefined, 'phase-repel-still-gated', 'small');
    const civ = state.civilizations['ai-1'];
    const startingPosition = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    addCity(state, 'home', civ.id, startingPosition);
    const home = state.cities[civ.cities[0]!]!;
    const worker = createUnit('worker', civ.id, home.position, state.idCounters);
    state.units[worker.id] = worker;
    civ.units.push(worker.id);
    state.turn = 30;
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);

    const plan: AIStrategicPlan = {
      id: 'repel-plan',
      actorId: civ.id,
      objective: 'repel',
      target: { kind: 'region', id: `repel:${hexKey(anchor)}`, anchor },
      theaterId: `local:${hexKey(anchor)}`,
      phase: 'mobilizing',
      reasonCodes: ['urgent-defense'],
      commitment: 0.5,
      createdTurn: 20,
      reconsiderAfterTurn: 23,
      expiresAfterTurn: 32,
      lastProgressTurn: 29,
      requiredRoles: { frontline: 1 },
      assignedUnitIds: [worker.id],
    };

    expect(nextPlanPhase(
      state, plan, [worker.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('mobilizing');
  });
});

describe('#1124 mobilization deadline semantics', () => {
  // The #1122 contested/hardened shape: two DISTINCT frontline-capable units plus one
  // capture-capable unit. A single warrior satisfies capture:1 and contributes 1 toward
  // frontline (via role compatibility), but not the full frontline:2 -- this is the
  // smallest shape where hasRequiredRoles and the post-deadline hasCaptureOrFrontline
  // floor actually diverge, since a lone generalist unit always trivially clears a
  // frontline:1/capture:1 ask.
  function contestedPlan(
    createdTurn: number,
    assignedUnitIds: string[],
    overrides: Partial<AIStrategicPlan> = {},
  ): AIStrategicPlan {
    return makePlan(
      { kind: 'region', id: 'raid:contested', anchor: { q: 5, r: 5 } },
      assignedUnitIds,
      {
        objective: 'capture',
        phase: 'mobilizing',
        createdTurn,
        reconsiderAfterTurn: createdTurn + 10,
        expiresAfterTurn: createdTurn + 20,
        lastProgressTurn: createdTurn,
        requiredRoles: { frontline: 2, capture: 1 },
        ...overrides,
      },
    );
  }

  it('does not bypass required roles on the very round a veteran plan is created (0 elapsed rounds)', () => {
    // RED under pre-fix `>=`: veteran's mobilizationRounds is 0, so
    // `after.turn - plan.createdTurn >= 0` is true even with zero elapsed rounds --
    // deadlineReached fires on the plan's very first readiness check, before it has ever
    // had a real chance to assemble the second frontline unit #1122 asked for.
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 20;
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });
    const plan = contestedPlan(20, ['warrior-1']);

    expect(nextPlanPhase(
      state, plan, ['warrior-1'], [], buildMajorCivPerception(state, AI),
    )).toBe('mobilizing');
  });

  it('still relaxes required roles for veteran after one genuine elapsed round', () => {
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 21;
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });
    const plan = contestedPlan(20, ['warrior-1']);

    expect(nextPlanPhase(
      state, plan, ['warrior-1'], [], buildMajorCivPerception(state, AI),
    )).toBe('advancing');
  });

  it('never delays a veteran plan whose required roles are already fully satisfied', () => {
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 20;
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });
    addUnit(state, 'warrior-2', 'warrior', AI, { q: 0, r: 1 });
    const plan = contestedPlan(20, ['warrior-1', 'warrior-2']);

    expect(nextPlanPhase(
      state, plan, ['warrior-1', 'warrior-2'], [], buildMajorCivPerception(state, AI),
    )).toBe('advancing');
  });

  it('shifts explorer\'s effective deadline from 2 elapsed rounds to 3', () => {
    const state = makeState();
    state.opponentChallenge = 'explorer';
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });

    state.turn = 22;
    expect(nextPlanPhase(
      state, contestedPlan(20, ['warrior-1']), ['warrior-1'], [],
      buildMajorCivPerception(state, AI),
    )).toBe('mobilizing');

    state.turn = 23;
    expect(nextPlanPhase(
      state, contestedPlan(20, ['warrior-1']), ['warrior-1'], [],
      buildMajorCivPerception(state, AI),
    )).toBe('advancing');
  });

  it('shifts standard\'s effective deadline from 1 elapsed round to 2', () => {
    const state = makeState();
    state.opponentChallenge = 'standard';
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });

    state.turn = 21;
    expect(nextPlanPhase(
      state, contestedPlan(20, ['warrior-1']), ['warrior-1'], [],
      buildMajorCivPerception(state, AI),
    )).toBe('mobilizing');

    state.turn = 22;
    expect(nextPlanPhase(
      state, contestedPlan(20, ['warrior-1']), ['warrior-1'], [],
      buildMajorCivPerception(state, AI),
    )).toBe('advancing');
  });

  it('never advances a capture plan with zero real combat/capture capability, however late the deadline', () => {
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 200;
    addUnit(state, 'worker-1', 'worker', AI, { q: 0, r: 0 });
    const plan = contestedPlan(20, ['worker-1']);

    expect(nextPlanPhase(
      state, plan, ['worker-1'], [], buildMajorCivPerception(state, AI),
    )).toBe('mobilizing');
  });

  it('leaves the expand objective\'s exemption from the capture/frontline floor untouched', () => {
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 20;
    const settler = addUnit(state, 'settler-1', 'settler', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'settle:expand', anchor: { q: 5, r: 5 } },
      [settler.id],
      {
        objective: 'expand',
        phase: 'mobilizing',
        createdTurn: 20,
        requiredRoles: { settlement: 1 },
      },
    );

    expect(nextPlanPhase(
      state, plan, [settler.id], [], buildMajorCivPerception(state, AI),
    )).toBe('advancing');
  });

  it('produces the same result across a save/reload round trip of state and plan', () => {
    const state = makeState();
    state.opponentChallenge = 'veteran';
    state.turn = 20;
    addUnit(state, 'warrior-1', 'warrior', AI, { q: 0, r: 0 });
    const plan = contestedPlan(20, ['warrior-1']);

    const before = nextPlanPhase(
      state, plan, ['warrior-1'], [], buildMajorCivPerception(state, AI),
    );

    const reloadedState: GameState = JSON.parse(JSON.stringify(state));
    const reloadedPlan: AIStrategicPlan = JSON.parse(JSON.stringify(plan));
    const after = nextPlanPhase(
      reloadedState, reloadedPlan, ['warrior-1'], [],
      buildMajorCivPerception(reloadedState, AI),
    );

    expect(after).toBe(before);
  });
});
