import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processCrisisTurn, getCrisisYieldMultiplier } from '@/systems/crisis-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexesInRange, hexKey } from '@/systems/hex-utils';
import type { ActiveCrisis, City, GameState, HexCoord, HexTile, OpponentChallenge } from '@/core/types';

const CITY_POS: HexCoord = { q: 0, r: 0 };
const ENEMY_TILE_POS: HexCoord = { q: 1, r: 0 };

function makeTile(coord: HexCoord, owner: string | null, overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord,
    terrain: 'hills',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    ...overrides,
  };
}

function makeCatastropheFixture({
  turn = 40,
  era = 3,
  challenge = 'standard' as OpponentChallenge,
  flavorId = 'earthquake',
  cityImprovement = 'none' as HexTile['improvement'],
  onlyOwnCityTile = false,
}: {
  turn?: number;
  era?: number;
  challenge?: OpponentChallenge;
  flavorId?: string;
  cityImprovement?: HexTile['improvement'];
  /** When true, only the city's own tile is owned by the civ within blast radius —
   * makes epicenter selection deterministic (single candidate) for tests that need
   * to assert exactly what happens to the epicenter, not "if it happened to land here". */
  onlyOwnCityTile?: boolean;
} = {}): { state: GameState; crisisId: string } {
  const civId = 'p1';
  const city: City = {
    id: 'c1', name: 'c1', owner: civId, position: CITY_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [CITY_POS], workedTiles: [],
    focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };

  const tiles: Record<string, HexTile> = {};
  // Own every tile within radius 3 of the city except one deliberately enemy-owned tile,
  // so the "never devastates another civ's or unowned land" invariant is falsifiable.
  for (const coord of hexesInRange(CITY_POS, 3)) {
    const key = hexKey(coord);
    const isCityTile = key === hexKey(CITY_POS);
    const isEnemy = coord.q === ENEMY_TILE_POS.q && coord.r === ENEMY_TILE_POS.r;
    const owner = isCityTile ? civId : onlyOwnCityTile ? null : (isEnemy ? 'enemy' : civId);
    tiles[key] = makeTile(coord, owner,
      isCityTile ? { improvement: cityImprovement, improvementTurnsLeft: 0 } : {});
  }

  const crisisId = 'crisis-1';
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId, archetype: 'catastrophe', targetCivId: civId,
    cityIds: ['c1'], tileKeys: [], startedTurn: turn, stage: 'active', turnsInStage: 0,
  };

  const state: GameState = {
    turn, era, currentPlayer: civId, gameOver: false, winner: null,
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { c1: city },
    civilizations: {
      [civId]: {
        id: civId, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: ['c1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState([civId], civId),
        challenge,
      },
      enemy: {
        id: 'enemy', name: 'Enemy', color: '#c2410c', isHuman: false, civType: 'rome',
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState([civId, 'enemy'], 'enemy'),
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0,
      tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal',
    },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    activeCrises: { [crisisId]: crisis },
  } as GameState;

  return { state, crisisId };
}

describe('catastrophe shock', () => {
  it('applies the shock on the same turn the crisis starts: picks an owned epicenter, devastates owned tiles within blast radius, moves to recovery', () => {
    const { state, crisisId } = makeCatastropheFixture();
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.stage).toBe('recovery');
    expect(crisis.tileKeys.length).toBeGreaterThan(0);
    for (const key of crisis.tileKeys) {
      const tile = next.map.tiles[key];
      expect(tile.owner).toBe('p1');
      expect(tile.devastatedUntilTurn).toBe(state.turn + 8); // standard devastationTurns
    }
  });

  it('applies a whole-city recovery yield penalty during the recovery stage (not just zeroing devastated tiles)', () => {
    const { state, cityId } = { ...makeCatastropheFixture(), cityId: 'c1' };
    // Before the shock (stage 'active'), no recovery penalty applies yet.
    expect(getCrisisYieldMultiplier(state, cityId)).toBe(1);
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises!['crisis-1'].stage).toBe('recovery');
    // standard challenge catastrophe yieldPenalty is 0.20 -> multiplier 0.80
    expect(getCrisisYieldMultiplier(next, cityId)).toBeCloseTo(0.8);
  });

  it('never devastates a tile owned by another civ or unowned land', () => {
    const { state, crisisId } = makeCatastropheFixture();
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.tileKeys).not.toContain(hexKey(ENEMY_TILE_POS));
    const enemyTile = next.map.tiles[hexKey(ENEMY_TILE_POS)];
    expect(enemyTile.devastatedUntilTurn).toBeUndefined();
  });

  it('destroys the epicenter improvement only on veteran era >= 3', () => {
    // Only the city tile is owned within blast radius, so it's the sole epicenter
    // candidate — deterministic, not a coin flip.
    const { state } = makeCatastropheFixture({ challenge: 'veteran', era: 3, cityImprovement: 'mine', onlyOwnCityTile: true });
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises!['crisis-1'];
    expect(crisis.tileKeys).toEqual([hexKey(CITY_POS)]);
    expect(next.map.tiles[hexKey(CITY_POS)].improvement).toBe('none');
  });

  it('does not destroy the epicenter improvement on veteran era < 3', () => {
    const { state } = makeCatastropheFixture({ challenge: 'veteran', era: 2, cityImprovement: 'mine', onlyOwnCityTile: true });
    const next = processCrisisTurn(state, new EventBus());
    expect(next.map.tiles[hexKey(CITY_POS)].improvement).toBe('mine');
  });

  it('does not destroy improvements on standard or explorer even at era >= 3', () => {
    const { state } = makeCatastropheFixture({ challenge: 'standard', era: 3, cityImprovement: 'mine', onlyOwnCityTile: true });
    const next = processCrisisTurn(state, new EventBus());
    const cityTileAfter = next.map.tiles[hexKey(CITY_POS)];
    expect(cityTileAfter.improvement).toBe('mine');
  });

  it('resolves recovered with a resilience bonus once every tile is actively restored within the 5-turn window', () => {
    const { state, crisisId } = makeCatastropheFixture({ turn: 40 });
    let s = processCrisisTurn(state, new EventBus());
    const crisis = s.activeCrises![crisisId];
    // Simulate a worker restoring every devastated tile before the deadline.
    const restoredTiles = { ...s.map.tiles };
    for (const key of crisis.tileKeys) {
      restoredTiles[key] = { ...restoredTiles[key], devastatedUntilTurn: undefined };
    }
    s = { ...s, turn: 43, map: { ...s.map, tiles: restoredTiles } };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    const resolved = processCrisisTurn(s, bus);
    expect(resolved.activeCrises?.[crisisId]).toBeUndefined();
    expect(events).toEqual([{ crisisId, flavorId: 'earthquake', civId: 'p1', outcome: 'recovered' }]);
    expect(resolved.cities.c1.resilienceBonusUntilTurn).toBe(48); // turn(43) + 5
  });

  it('resolves expired with no bonus once devastation passes naturally without restoration (standard/veteran)', () => {
    const { state, crisisId } = makeCatastropheFixture({ turn: 40, challenge: 'standard' });
    let s = processCrisisTurn(state, new EventBus());
    // Fast-forward turns without restoring anything until natural expiry (8 turns).
    for (let i = 0; i < 9; i++) {
      s = processCrisisTurn({ ...s, turn: s.turn + 1 }, new EventBus());
    }
    expect(s.activeCrises?.[crisisId]).toBeUndefined();
    expect(s.cities.c1.resilienceBonusUntilTurn).toBeUndefined();
  });

  it('resolves recovered (not expired) with no bonus for explorer once devastation passes naturally', () => {
    const { state, crisisId } = makeCatastropheFixture({ turn: 40, challenge: 'explorer' });
    let s = processCrisisTurn(state, new EventBus());
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    for (let i = 0; i < 5; i++) {
      s = processCrisisTurn({ ...s, turn: s.turn + 1 }, bus);
    }
    expect(s.activeCrises?.[crisisId]).toBeUndefined();
    expect(events).toEqual([{ crisisId, flavorId: 'earthquake', civId: 'p1', outcome: 'recovered' }]);
    expect(s.cities.c1.resilienceBonusUntilTurn).toBeUndefined();
  });

  it('abandons the crisis instead of silently "recovering with a bonus" when no owned tile exists for an epicenter', () => {
    // Pathological state: not even the target city's own tile is owned by its civ within
    // blast radius (shouldn't happen via normal territory rules, but must not produce a
    // phantom "recovered + bonus" outcome if it somehow does).
    const { state, crisisId } = makeCatastropheFixture({ onlyOwnCityTile: true });
    const orphanedState: GameState = {
      ...state,
      map: { ...state.map, tiles: { ...state.map.tiles, [hexKey(CITY_POS)]: { ...state.map.tiles[hexKey(CITY_POS)], owner: null } } },
    };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    const next = processCrisisTurn(orphanedState, bus);
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
    expect(events).toEqual([{ crisisId, flavorId: 'earthquake', civId: 'p1', outcome: 'abandoned' }]);
    expect(next.cities.c1.resilienceBonusUntilTurn).toBeUndefined();
  });

  it('never re-claims a tile another still-active catastrophe already devastated, and abandons if that leaves nothing new to devastate', () => {
    // Force a single-candidate epicenter (the city tile) so the two crises are
    // guaranteed to contend for the exact same tile.
    const { state, crisisId } = makeCatastropheFixture({ onlyOwnCityTile: true, turn: 40 });
    const preExistingDevastation = 90; // far beyond this crisis's own would-be timer
    const contestedState: GameState = {
      ...state,
      map: {
        ...state.map,
        tiles: {
          ...state.map.tiles,
          [hexKey(CITY_POS)]: { ...state.map.tiles[hexKey(CITY_POS)], devastatedUntilTurn: preExistingDevastation },
        },
      },
    };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    const next = processCrisisTurn(contestedState, bus);

    // The new crisis found nothing new to devastate and abandons immediately...
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
    expect(events).toEqual([{ crisisId, flavorId: 'earthquake', civId: 'p1', outcome: 'abandoned' }]);
    // ...and critically, the pre-existing crisis's devastation timer is untouched
    // (not overwritten with this crisis's own, shorter/longer devastationTurns).
    expect(next.map.tiles[hexKey(CITY_POS)].devastatedUntilTurn).toBe(preExistingDevastation);
  });
});
