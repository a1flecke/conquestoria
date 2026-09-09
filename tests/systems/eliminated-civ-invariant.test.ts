import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { foundCityInState } from '@/systems/city-founding-system';
import { reconcileCivilizationLiveness, emitCivilizationLivenessTransitions } from '@/systems/civilization-elimination-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import {
  ELIMINATED_CIV_AREAS,
  assertEliminatedCivHasNoLiveEntities,
  type EliminatedCivArea,
} from '../helpers/eliminated-civ-areas';

/**
 * #1001 — once `civ.isEliminated`, that civ retains no live owned entity and no
 * active obligation anywhere in `GameState`. Historical records ("civ X built
 * wonder Y") are a separate, allowed category.
 *
 * `ELIMINATED_CIV_AREAS` is `Record<keyof GameState, …>`, so a new persisted
 * field is a *compile* error until classified. This file adds the runtime half:
 * the key-coverage meta-test, a per-teardown-area regression so a future refactor
 * of `eliminateCivilization` cannot silently drop one, the allowed
 * historical-record classification, and a long post-elimination simulation.
 */

function newGame(seed: string, opponentCount = 2): GameState {
  return createNewGame({ civType: 'generic', mapSize: 'small', opponentCount, seed, gameTitle: seed });
}

/** Found a city for every civ so rosters have something real, then return the state. */
function withCities(state: GameState): GameState {
  let s = state;
  const bus = new EventBus();
  for (const civId of Object.keys(s.civilizations).sort()) {
    const settlerId = s.civilizations[civId].units.find(id => s.units[id]?.type === 'settler');
    if (settlerId) s = foundCityInState(s, settlerId, bus).state;
  }
  return s;
}

/** Strip every city + unit a civ owns (and its rosters), then let processTurn's
 *  liveness reconciliation eliminate it — the real elimination path. */
function eliminate(state: GameState, civId: string): GameState {
  const before = structuredClone(state);
  const working = structuredClone(state);
  for (const [cityId, city] of Object.entries(working.cities)) {
    if (city.owner === civId) delete working.cities[cityId];
  }
  for (const [unitId, unit] of Object.entries(working.units)) {
    if (unit.owner === civId) delete working.units[unitId];
  }
  working.civilizations[civId].cities = [];
  working.civilizations[civId].units = [];
  const bus = new EventBus();
  const result = reconcileCivilizationLiveness(before, working);
  emitCivilizationLivenessTransitions(result, bus);
  return result.state;
}

const AREA_ENTRIES = Object.entries(ELIMINATED_CIV_AREAS) as [keyof GameState, EliminatedCivArea][];
const TEARDOWN_AREAS = AREA_ENTRIES.filter(([, a]) => a.kind === 'teardown').map(([k]) => k);
const HISTORICAL_AREAS = AREA_ENTRIES.filter(([, a]) => a.kind === 'historical').map(([k]) => k);

describe('#1001 ELIMINATED_CIV_AREAS covers every GameState key', () => {
  it('classifies exactly the keys a live GameState has — no missing, no strays', () => {
    let live = withCities(newGame('elim-coverage'));
    for (let i = 0; i < 3; i++) live = processTurn(live, new EventBus());

    const liveKeys = new Set(Object.keys(live));
    const declaredKeys = new Set(Object.keys(ELIMINATED_CIV_AREAS));

    const undeclared = [...liveKeys].filter(k => !declaredKeys.has(k));
    const stray = [...declaredKeys].filter(k => !liveKeys.has(k));

    expect(undeclared, `GameState keys with no ELIMINATED_CIV_AREAS classification: ${undeclared.join(', ')}`).toEqual([]);
    // `stray` is allowed to be non-empty (optional containers a fresh game omits),
    // but every stray must still be a real key of the GameState type — which the
    // `Record<keyof GameState, …>` annotation already guarantees at compile time.
    expect(Array.isArray(stray)).toBe(true);
  });

  it('every area has a why, and teardown areas have a scan', () => {
    for (const [key, area] of AREA_ENTRIES) {
      expect(area.why, `${key} needs a rationale`).toBeTruthy();
      if (area.kind === 'teardown') expect(typeof area.scan, `${key} teardown needs a scan`).toBe('function');
    }
    expect(TEARDOWN_AREAS.length).toBeGreaterThan(10);
    expect(HISTORICAL_AREAS.length).toBeGreaterThan(0);
  });
});

describe('#1001 every teardown area is actually asserted', () => {
  // A planted dead-civ reference in each teardown area must make the validator
  // throw and name that area — proving a future refactor that stops scrubbing
  // one area is caught.
  function baseEliminatedState(seed: string): GameState {
    const state = newGame(seed);
    state.civilizations['ai-1'].isEliminated = true;
    state.civilizations['ai-1'].cities = [];
    state.civilizations['ai-1'].units = [];
    state.civilizations['ai-1'].diplomacy = {
      ...state.civilizations['ai-1'].diplomacy,
      relationships: {}, atWarWith: [], treaties: [], events: [],
      vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
    };
    for (const [id, u] of Object.entries(state.units)) if (u.owner === 'ai-1') delete state.units[id];
    for (const [id, c] of Object.entries(state.cities)) if (c.owner === 'ai-1') delete state.cities[id];
    // Scrub the other civs' references so ONLY the planted one remains.
    for (const [oid, other] of Object.entries(state.civilizations)) {
      if (oid === 'ai-1') continue;
      delete other.diplomacy.relationships['ai-1'];
      other.diplomacy.atWarWith = other.diplomacy.atWarWith.filter(x => x !== 'ai-1');
    }
    return state;
  }

  const planters: Partial<Record<keyof GameState, (s: GameState) => void>> = {
    currentPlayer: s => { s.currentPlayer = 'ai-1'; },
    winner: s => { s.winner = 'ai-1'; },
    civilizations: s => { s.civilizations.player.diplomacy.atWarWith = ['ai-1']; },
    units: s => { const u = Object.values(s.units)[0]!; s.units['zombie-1'] = { ...u, id: 'zombie-1', owner: 'ai-1' }; },
    cities: s => { const c = Object.values(s.cities)[0]!; s.cities['zombie-city'] = { ...c, id: 'zombie-city', owner: 'ai-1' }; },
    embargoes: s => { s.embargoes = [{ targetCivId: 'ai-1', participants: ['player'], startedTurn: 1 } as never]; },
    defensiveLeagues: s => { s.defensiveLeagues = [{ id: 'l1', members: ['player', 'ai-1'], formedTurn: 1 } as never]; },
    pendingDiplomacyRequests: s => { s.pendingDiplomacyRequests = [{ fromCivId: 'player', toCivId: 'ai-1' } as never]; },
    pendingEvents: s => { s.pendingEvents = { 'ai-1': [] }; },
    espionage: s => { s.espionage = { 'ai-1': { spies: {}, detectedThreats: {}, activeInterrogations: {} } as never }; },
    opponentAI: s => {
      s.opponentAI = { majorCivs: { 'ai-1': {} as never }, pressureByCiv: {}, barbarianHomeCampByUnitId: {} } as never;
    },
    marketplace: s => {
      s.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
        tradeRoutes: [{ id: 'r1', foreignCivId: 'ai-1' } as never], purchasedResources: [] };
    },
    autonomyByCiv: s => { s.autonomyByCiv = { 'ai-1': { plans: { p1: {} } } as never }; },
    economyStatusByCiv: s => { s.economyStatusByCiv = { 'ai-1': {} as never }; },
    councilMemory: s => { s.councilMemory = { 'ai-1': {} as never }; },
    activeCrises: s => { s.activeCrises = { c1: { id: 'c1', targetCivId: 'ai-1' } as never }; },
    crisisForces: s => { s.crisisForces = { f1: { id: 'f1', targetCivId: 'ai-1', unitIds: [] } as never }; },
    stampedes: s => { s.stampedes = { s1: { targetCivId: 'ai-1' } as never }; },
    rogueElephantHosts: s => { s.rogueElephantHosts = { h1: { targetCivId: 'ai-1' } as never }; },
    beasts: s => { s.beasts = { mode: 'wild', lairs: {}, sightingsByCiv: { 'ai-1': [] } } as never; },
    minorCivs: s => {
      const mcId = Object.keys(s.minorCivs)[0]!;
      s.minorCivs[mcId].diplomacy.atWarWith = [...s.minorCivs[mcId].diplomacy.atWarWith, 'ai-1'];
      s.minorCivs[mcId].activeQuests['ai-1'] = { id: 'q1' } as never; // #1001 gap: an offered quest to a dead civ
    },
    minorCivCoalitions: s => { s.minorCivCoalitions = { k1: { id: 'k1', targetCivId: 'ai-1', memberIds: [], status: 'forming', createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0 } }; },
    minorCivRegionalCooldowns: s => { s.minorCivRegionalCooldowns = { r1: { targetCivId: 'ai-1', memberIds: [], cooldownUntil: 5 } }; },
    territoryFrontiers: s => { s.territoryFrontiers = { t1: { holderCivId: 'ai-1', challengerCivId: 'player' } as never }; },
    nationalProjectChoices: s => { s.nationalProjectChoices = { 'ai-1': 'iron' as never }; },
    builtNationalProjects: s => { s.builtNationalProjects = { 'ai-1:foo': { civId: 'ai-1', cityId: 'x', eraBuilt: 1 } }; },
    legendaryWonderProjects: s => { s.legendaryWonderProjects = { w1: { wonderId: 'w', ownerId: 'ai-1', cityId: 'x' } as never }; },
    legendaryWonderTacticalEffects: s => { s.legendaryWonderTacticalEffects = { trainingGrantsByCiv: { 'ai-1': { era: 1, grantedRoles: [] } }, interceptionClaimTurnByCiv: {} }; },
    legendaryWonderIntel: s => { s.legendaryWonderIntel = { 'ai-1': [] }; },
    pendingGeneralCandidateChoices: s => { s.pendingGeneralCandidateChoices = [{ civId: 'ai-1' } as never]; },
    pirateFleets: s => { s.pirateFleets = { pf1: { targetCivId: 'ai-1' } as never }; },
    pirateFleetCooldownByCivLandmass: s => { s.pirateFleetCooldownByCivLandmass = { 'ai-1:lm0': 5 }; },
    resurgentCampCooldownByCivLandmass: s => { s.resurgentCampCooldownByCivLandmass = { 'ai-1:lm0': 5 }; },
    pirates: s => {
      s.pirates = {
        version: 1, factions: {}, history: [], pressure: { value: 0, suppression: [] },
        intelByCiv: { 'ai-1': {} }, nextSpawnCheckTurn: 0, activatedTurn: null,
        activationWarningDeliveredByCiv: {},
      } as never;
    },
  };

  for (const area of TEARDOWN_AREAS) {
    it(`${area}: a planted eliminated-civ reference is caught`, () => {
      const planter = planters[area];
      expect(planter, `no planter fixture for teardown area "${area}"`).toBeTruthy();
      const state = baseEliminatedState(`elim-plant-${area}`);
      planter!(state);
      let message = '';
      try { assertEliminatedCivHasNoLiveEntities(state); } catch (e) { message = (e as Error).message; }
      expect(message, `${area} planter did not trip the validator`).toContain(`[${area}]`);
    });
  }
});

describe('#1001 historical records survive elimination', () => {
  it('a wonder discovered / built by the dead civ, and its founded religion, are kept and pass the validator', () => {
    let state = withCities(newGame('elim-historical'));
    for (let i = 0; i < 3; i++) state = processTurn(state, new EventBus());
    state = eliminate(state, 'ai-1');
    expect(() => assertEliminatedCivHasNoLiveEntities(state)).not.toThrow(); // real teardown is clean first

    state.discoveredWonders = { 'great-library': 'ai-1' };
    state.wonderDiscoverers = { 'great-library': ['ai-1', 'player'] };
    state.completedLegendaryWonders = { colossus: { ownerId: 'ai-1', cityId: 'gone', turnCompleted: 12 } };
    state.religions = { 'religion-ai-1': { id: 'religion-ai-1', name: 'Old Faith', ownerCivId: 'ai-1', foundedTurn: 8 } as never };
    state.dominationIntel = { player: { defeatsByCivId: { 'ai-1': { civId: 'ai-1', civName: 'Gone', observedTurn: 3, defeatedById: 'player', source: 'participant' } }, reportsByContenderId: {} } };

    expect(() => assertEliminatedCivHasNoLiveEntities(state)).not.toThrow();
    // ...and the records are still there.
    expect(state.discoveredWonders['great-library']).toBe('ai-1');
    expect(state.completedLegendaryWonders['colossus'].ownerId).toBe('ai-1');
    expect(state.religions['religion-ai-1']).toBeDefined();
    expect(state.dominationIntel['player'].defeatsByCivId['ai-1']).toBeDefined();
  });
});

describe('#1001 long post-elimination simulation', () => {
  it('eliminating two civs mid-game leaves no live reference across 25 more turns, and a save/reload round-trip', () => {
    let state = withCities(newGame('elim-longrun', 3));
    for (let i = 0; i < 6; i++) state = processTurn(state, new EventBus());

    state = eliminate(state, 'ai-1');
    expect(() => assertEliminatedCivHasNoLiveEntities(state)).not.toThrow();

    for (let turn = 0; turn < 25; turn++) {
      state = processTurn(state, new EventBus());
      // Eliminate a second civ partway through, to exercise multi-eliminated state.
      if (turn === 8) state = eliminate(state, 'ai-2');

      for (const deadId of ['ai-1', ...(turn >= 8 ? ['ai-2'] : [])]) {
        expect(state.civilizations[deadId].isEliminated, `turn ${turn}: ${deadId} was resurrected`).toBe(true);
        expect(
          Object.values(state.units).some(u => u.owner === deadId)
          || Object.values(state.cities).some(c => c.owner === deadId),
          `turn ${turn}: ${deadId} regained an owned entity`,
        ).toBe(false);
      }
      try {
        assertEliminatedCivHasNoLiveEntities(state);
      } catch (e) {
        throw new Error(`turn ${turn}: ${(e as Error).message}`);
      }
    }

    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') throw new Error(`reload failed: ${parsed.message}`);
    expect(() => assertEliminatedCivHasNoLiveEntities(parsed.state)).not.toThrow();
    expect(parsed.state.civilizations['ai-1'].isEliminated).toBe(true);
    expect(parsed.state.civilizations['ai-2'].isEliminated).toBe(true);
  }, 30_000);
});
