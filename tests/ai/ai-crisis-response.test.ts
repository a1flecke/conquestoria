import { describe, expect, it } from 'vitest';
import type { ActiveCrisis, City, GameState, HexCoord, HexTile, Unit } from '@/core/types';
import { getCrisisDispatchCandidates, getCrisisResponseActions, applyCrisisResponses } from '@/ai/ai-crisis-response';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';

function faction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
    maritimeStage: 3, notoriety: 5, shipIds: ['ship-1'],
    headquarters: { kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null,
    intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: 'ai-city', plannedRound: 1 },
    transitionGuards: { emittedEventKeys: [] },
    ...overrides,
  };
}

function baseState(challenge: string): GameState {
  return {
    opponentChallenge: challenge,
    civilizations: {
      'ai-1': {
        id: 'ai-1', isHuman: false, isEliminated: false,
        visibility: { tiles: { '2,1': 'visible' } },
      },
    },
    units: { 'ship-1': { id: 'ship-1', type: 'pirate_frigate', owner: 'pirate-1', position: { q: 2, r: 1 } } },
    pirates: { factions: { 'pirate-1': faction() } },
  } as unknown as GameState;
}

describe('getCrisisDispatchCandidates', () => {
  it('produces one pirate-fleet candidate targeting the fleet leader unit', () => {
    const candidates = getCrisisDispatchCandidates(baseState('standard'), 'ai-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'pirate-fleet',
      sourceId: 'pirate-1',
      targetUnitId: 'ship-1',
    });
  });

  it('scales score by crisisDispatchWeight (veteran > explorer for the same state)', () => {
    const veteranScore = getCrisisDispatchCandidates(baseState('veteran'), 'ai-1')[0]!.score;
    const explorerScore = getCrisisDispatchCandidates(baseState('explorer'), 'ai-1')[0]!.score;
    expect(veteranScore).toBeGreaterThan(explorerScore);
  });

  it('produces zero candidates when the fleet leader unit is dead', () => {
    const state = baseState('standard');
    delete (state.units as Record<string, unknown>)['ship-1'];
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the fleet has no live faction', () => {
    const state = baseState('standard');
    state.pirates = { factions: {} } as GameState['pirates'];
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the fleet targets a different civ', () => {
    const state = baseState('standard');
    (state.pirates!.factions['pirate-1'] as { intent: { targetCivId: string } }).intent.targetCivId = 'ai-2';
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the civ cannot currently see the fleet leader (no unearned exact targets)', () => {
    const state = baseState('standard');
    (state.civilizations['ai-1'] as { visibility: { tiles: Record<string, string> } })
      .visibility.tiles = {};
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });
});

// #529 MR3 Task 3.2 — quarantine + fund-remedy response policy.
function outbreakCrisis(overrides: Partial<ActiveCrisis> = {}): ActiveCrisis {
  return {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'ai-1',
    cityIds: ['c1'], tileKeys: [], startedTurn: 0, stage: 'active', turnsInStage: 1,
    ...overrides,
  };
}

function responseState(overrides: Record<string, unknown> = {}): GameState {
  return {
    turn: 4,
    opponentChallenge: 'standard',
    civilizations: {
      'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, gold: 1000 },
    },
    cities: {
      c1: { id: 'c1', population: 5, owner: 'ai-1' },
    },
    activeCrises: { 'crisis-1': outbreakCrisis() },
    ...overrides,
  } as unknown as GameState;
}

describe('getCrisisResponseActions', () => {
  it('quarantines only once crisis age reaches crisisResponseDelayTurns (explorer: age 4)', () => {
    const notYet = getCrisisResponseActions(responseState({ turn: 3, opponentChallenge: 'explorer' }), 'ai-1');
    expect(notYet.some(a => a.kind === 'quarantine')).toBe(false);
    const now = getCrisisResponseActions(responseState({ turn: 4, opponentChallenge: 'explorer' }), 'ai-1');
    expect(now).toContainEqual({ kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('quarantines immediately at crisis age 0 for veteran challenge', () => {
    const actions = getCrisisResponseActions(responseState({ turn: 0, opponentChallenge: 'veteran' }), 'ai-1');
    expect(actions).toContainEqual({ kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('quarantines the lowest-population unquarantined infected city first', () => {
    const state = responseState({
      turn: 0, opponentChallenge: 'veteran',
      cities: {
        c1: { id: 'c1', population: 5, owner: 'ai-1' },
        c2: { id: 'c2', population: 2, owner: 'ai-1' },
      },
      activeCrises: { 'crisis-1': outbreakCrisis({ cityIds: ['c1', 'c2'] }) },
    });
    const actions = getCrisisResponseActions(state, 'ai-1');
    expect(actions.filter(a => a.kind === 'quarantine')).toEqual([
      { kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c2' },
    ]);
  });

  it('funds a remedy only when treasury meets the challenge multiplier (standard: cost x2.0)', () => {
    // c1 population 5 -> appease cost 75; standard multiplier 2.0 -> need >= 150.
    const short = getCrisisResponseActions(
      responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 149 } } }), 'ai-1',
    );
    expect(short.some(a => a.kind === 'fund-remedy')).toBe(false);
    const enough = getCrisisResponseActions(
      responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 150 } } }), 'ai-1',
    );
    expect(enough).toContainEqual({ kind: 'fund-remedy', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('never generates actions for a human civ', () => {
    const state = responseState({
      civilizations: { p1: { id: 'p1', isHuman: true, isEliminated: false, gold: 1000 } },
      activeCrises: { 'crisis-1': outbreakCrisis({ targetCivId: 'p1' }) },
    });
    expect(getCrisisResponseActions(state, 'p1')).toEqual([]);
  });

  it('is deterministic: identical actions on cloned state', () => {
    const state = responseState();
    const a = getCrisisResponseActions(structuredClone(state), 'ai-1');
    const b = getCrisisResponseActions(structuredClone(state), 'ai-1');
    expect(a).toEqual(b);
  });

  it('#590 MR3: quarantines and funds remedy for an AI civ\'s own famine crisis, same as outbreak', () => {
    const state = responseState({
      turn: 0, opponentChallenge: 'veteran',
      civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, gold: 1000 } },
      activeCrises: { 'crisis-1': outbreakCrisis({ archetype: 'famine', flavorId: 'crop-blight' }) },
    });
    const actions = getCrisisResponseActions(state, 'ai-1');
    expect(actions).toContainEqual({ kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c1' });
    expect(actions).toContainEqual({ kind: 'fund-remedy', crisisId: 'crisis-1', cityId: 'c1' });
  });
});

// #526 MR4 — AI catastrophe restoration: pair idle workers with the nearest
// canRestoreLand-eligible tile in a catastrophe crisis's tileKeys, gated by
// crisisResponseDelayTurns like the other response actions.
function plainTile(coord: HexCoord, owner: string | null): HexTile {
  return {
    coord, terrain: 'grassland', elevation: 'lowland', resource: null,
    improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function devastatedTile(coord: HexCoord, owner: string, devastatedUntilTurn = 100): HexTile {
  return { ...plainTile(coord, owner), devastatedUntilTurn };
}

function workerUnit(id: string, owner: string, position: HexCoord, overrides: Partial<Unit> = {}): Unit {
  return {
    id, type: 'worker', owner, position, movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, chargesRemaining: 2, isResting: false,
    ...overrides,
  } as Unit;
}

function catastropheCrisis(overrides: Partial<ActiveCrisis> = {}): ActiveCrisis {
  return {
    id: 'crisis-2', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: 'ai-1',
    cityIds: ['c1'], tileKeys: ['2,0'], startedTurn: 0, stage: 'recovery', turnsInStage: 1,
    ...overrides,
  };
}

const CITY_POS: HexCoord = { q: 0, r: 0 };
const WORKER_POS: HexCoord = { q: 1, r: 0 };
const DEVASTATED_POS: HexCoord = { q: 2, r: 0 };

function restoreState(overrides: Record<string, unknown> = {}): GameState {
  return {
    turn: 0,
    opponentChallenge: 'veteran',
    civilizations: {
      'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, gold: 1000, techState: { completed: [] } },
    },
    cities: { c1: { id: 'c1', population: 5, owner: 'ai-1', position: CITY_POS } },
    map: {
      width: 10, height: 10, wrapsHorizontally: false, rivers: [],
      tiles: {
        '0,0': plainTile(CITY_POS, 'ai-1'),
        '1,0': plainTile(WORKER_POS, 'ai-1'),
        '2,0': devastatedTile(DEVASTATED_POS, 'ai-1'),
      },
    },
    units: { 'worker-1': workerUnit('worker-1', 'ai-1', WORKER_POS) },
    activeCrises: { 'crisis-2': catastropheCrisis() },
    ...overrides,
  } as unknown as GameState;
}

describe('getCrisisResponseActions — restore (catastrophe)', () => {
  it('assigns an idle worker to the nearest devastated tile immediately for veteran (age 0)', () => {
    const actions = getCrisisResponseActions(restoreState({ turn: 0, opponentChallenge: 'veteran' }), 'ai-1');
    expect(actions).toContainEqual({ kind: 'restore', crisisId: 'crisis-2', tileKey: '2,0', workerUnitId: 'worker-1' });
  });

  it('withholds restore tasking until crisis age reaches crisisResponseDelayTurns (explorer: age 4)', () => {
    const notYet = getCrisisResponseActions(restoreState({ turn: 3, opponentChallenge: 'explorer' }), 'ai-1');
    expect(notYet.some(a => a.kind === 'restore')).toBe(false);
    const now = getCrisisResponseActions(restoreState({ turn: 4, opponentChallenge: 'explorer' }), 'ai-1');
    expect(now).toContainEqual({ kind: 'restore', crisisId: 'crisis-2', tileKey: '2,0', workerUnitId: 'worker-1' });
  });

  it('never re-tasks a worker already committed to a workerTask', () => {
    const state = restoreState({
      units: {
        'worker-1': workerUnit('worker-1', 'ai-1', WORKER_POS, {
          workerTask: { action: 'farm', coord: WORKER_POS },
        }),
      },
    });
    expect(getCrisisResponseActions(state, 'ai-1').some(a => a.kind === 'restore')).toBe(false);
  });

  it('never re-tasks a worker already committed to a trade route', () => {
    const state = restoreState({
      units: { 'worker-1': workerUnit('worker-1', 'ai-1', WORKER_POS, { committedToRouteId: 'route-1' }) },
    });
    expect(getCrisisResponseActions(state, 'ai-1').some(a => a.kind === 'restore')).toBe(false);
  });

  it('does not assign a tile that is not actually devastated', () => {
    const state = restoreState({
      map: {
        width: 10, height: 10, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': plainTile(CITY_POS, 'ai-1'),
          '1,0': plainTile(WORKER_POS, 'ai-1'),
          '2,0': plainTile(DEVASTATED_POS, 'ai-1'),
        },
      },
    });
    expect(getCrisisResponseActions(state, 'ai-1').some(a => a.kind === 'restore')).toBe(false);
  });

  it('never generates a restore action for a human civ', () => {
    const state = restoreState({
      civilizations: { p1: { id: 'p1', isHuman: true, isEliminated: false, gold: 1000, techState: { completed: [] } } },
      cities: { c1: { id: 'c1', population: 5, owner: 'p1', position: CITY_POS } },
      map: {
        width: 10, height: 10, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': plainTile(CITY_POS, 'p1'),
          '1,0': plainTile(WORKER_POS, 'p1'),
          '2,0': devastatedTile(DEVASTATED_POS, 'p1'),
        },
      },
      units: { 'worker-1': workerUnit('worker-1', 'p1', WORKER_POS) },
      activeCrises: { 'crisis-2': catastropheCrisis({ targetCivId: 'p1' }) },
    });
    expect(getCrisisResponseActions(state, 'p1')).toEqual([]);
  });
});

// #526 MR4 — end-to-end payoff: run real turns (crisis tick + full AI tactical
// round) and confirm the delay knob actually decides the resilience-bonus
// outcome, not just that a 'restore' action gets proposed in isolation.
function makeE2ECity(id: string, owner: string, position: HexCoord): City {
  return {
    id, name: id, owner, position, population: 5, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [position], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };
}

// A straight 4-tile line from the worker's start to the devastated tile. This
// distance (rather than the isolated tests' "adjacent") is deliberately wide:
// it keeps veteran (delay 0) finishing well inside the fixed 5-turn recovery
// window and explorer (delay 4) finishing well outside it regardless of the
// exact per-round movement rate the tactical layer happens to grant, so the
// assertion isn't a coin-flip on an off-by-one in round accounting.
//
// The devastated tile sits at distance 3 from the city (not further) because
// city-territory-system.ts's per-turn recalculateTerritory() re-derives tile
// ownership from each city's claim radius every round (getBaseTerritoryRadius
// -> 3 for population >= 4) — a manually-forced `owner` on a tile outside
// that radius gets silently reset to null on the very first round, which
// fails canRestoreLand's ownership check. The worker itself doesn't need to
// stand on owned land, so it starts outside the radius to keep the distance.
function buildRestorationScenario(challenge: 'veteran' | 'explorer'): { state: GameState; cityId: string; civId: string } {
  const civId = 'ai-1';
  const base = createNewGame(undefined, `restore-e2e-${challenge}`, 'small');

  const cityPos: HexCoord = { q: 0, r: 0 };
  const workerPos: HexCoord = { q: -1, r: 0 };
  const devastatedPos: HexCoord = { q: 3, r: 0 };
  const city = makeE2ECity('ai-capital', civId, cityPos);

  const tiles: Record<string, HexTile> = { ...base.map.tiles };
  for (let q = -1; q <= 3; q++) {
    const coord: HexCoord = { q, r: 0 };
    tiles[hexKey(coord)] = {
      coord, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      ...(q === 3 ? { devastatedUntilTurn: base.turn + 8 } : {}),
    };
  }

  const worker = createUnit('worker', civId, workerPos, base.idCounters);

  const crisis: ActiveCrisis = {
    id: 'crisis-e2e', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: civId,
    cityIds: [city.id], tileKeys: [hexKey(devastatedPos)], startedTurn: base.turn, stage: 'recovery', turnsInStage: 1,
  };

  const state: GameState = {
    ...base,
    opponentChallenge: challenge,
    cities: { [city.id]: city },
    units: { [worker.id]: worker },
    map: { ...base.map, tiles },
    civilizations: {
      ...base.civilizations,
      [civId]: { ...base.civilizations[civId], cities: [city.id], units: [worker.id] },
    },
    activeCrises: { [crisis.id]: crisis },
  };
  return { state, cityId: city.id, civId };
}

function runRestorationRounds(state: GameState, rounds: number): GameState {
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

describe('AI catastrophe restoration — end to end (#526 MR4)', () => {
  it('veteran (delay 0) restores the tile in time and earns the resilience bonus', () => {
    const { state, cityId } = buildRestorationScenario('veteran');
    const final = runRestorationRounds(state, 12);
    expect(final.cities[cityId]?.resilienceBonusUntilTurn).toBeDefined();
  });

  it('explorer (delay 4) misses the recovery window and never earns the bonus', () => {
    const { state, cityId } = buildRestorationScenario('explorer');
    const final = runRestorationRounds(state, 20);
    expect(final.cities[cityId]?.resilienceBonusUntilTurn).toBeUndefined();
  });
});

describe('applyCrisisResponses', () => {
  it('applies a funded remedy via applyRemedy, deducting real gold', () => {
    const state = responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 200 } } });
    const next = applyCrisisResponses(state);
    expect((next.civilizations['ai-1'] as { gold: number }).gold).toBe(200 - 75);
    expect(next.activeCrises!['crisis-1'].remedyCompletionByCity).toHaveProperty('c1');
  });

  it('does not deduct gold or start a remedy when treasury is short', () => {
    const state = responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 100 } } });
    const next = applyCrisisResponses(state);
    expect((next.civilizations['ai-1'] as { gold: number }).gold).toBe(100);
    expect(next.activeCrises!['crisis-1'].remedyCompletionByCity ?? {}).not.toHaveProperty('c1');
  });

  it('applies a quarantine via applyQuarantine, marking the city quarantined', () => {
    const state = responseState({ turn: 0, opponentChallenge: 'veteran' });
    const next = applyCrisisResponses(state);
    expect(next.activeCrises!['crisis-1'].quarantinedCityIds).toContain('c1');
  });

  it('never touches a human civ crisis', () => {
    const state = responseState({
      civilizations: { p1: { id: 'p1', isHuman: true, isEliminated: false, gold: 1000 } },
      activeCrises: { 'crisis-1': outbreakCrisis({ targetCivId: 'p1' }) },
    });
    const next = applyCrisisResponses(state);
    expect(next.activeCrises!['crisis-1']).toEqual(state.activeCrises!['crisis-1']);
    expect((next.civilizations.p1 as { gold: number }).gold).toBe(1000);
  });
});
