import { describe, it, expect } from 'vitest';
import type { City, Civilization, GameState, HexCoord, HexTile } from '@/core/types';
import { resolveStrategicStrike } from '@/systems/strategic-strike-system';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

const ACTOR_CITY_POS: HexCoord = { q: -10, r: -10 };
const TARGET_POS: HexCoord = { q: 0, r: 0 };

const AT_PEACE = {
  relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
  vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
};
const attackerAtWar = { ...AT_PEACE, atWarWith: ['defender'] };
const defenderAtWar = { ...AT_PEACE, atWarWith: ['attacker'] };

function makeTile(coord: HexCoord, owner: string | null, overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, ...overrides,
  };
}

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'attacker', name: 'Attacker', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 1000, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: AT_PEACE,
    ...overrides,
  } as Civilization;
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'target', name: 'Target', owner: 'defender', position: TARGET_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
    ...overrides,
  } as City;
}

// Owns every tile within radius 4 of the target city (so the blast-radius-3
// boundary test has both included and excluded tiles to check) plus the attacker's
// own silo-city tile far away. p1 (attacker) can see the target (visibility fixture
// below) and is at war with the defender; the defender is undefended (no garrison
// unit) unless a test overrides `units`.
function makeStrikeState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  for (const coord of hexesInRange(TARGET_POS, 4)) {
    tiles[hexKey(coord)] = makeTile(coord, 'defender');
  }
  tiles[hexKey(ACTOR_CITY_POS)] = makeTile(ACTOR_CITY_POS, 'attacker');

  return {
    turn: 50, era: 10, currentPlayer: 'attacker', gameOver: false, winner: null,
    map: { width: 60, height: 60, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: ['missile_silo'] } as any,
      target: makeCity(),
    },
    civilizations: {
      attacker: makeCiv({
        id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
        visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
      }),
      defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
    },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [],
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 1, nextCityId: 1, nextRouteId: 1 },
    ...overrides,
  } as GameState;
}

describe('resolveStrategicStrike (#545 MR3 §7)', () => {
  it('legal strike against an undefended city: floors HP to 1, applies sack-equivalent gold loss, spends one warhead', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('damaged');
    expect(result.cityResult.newHp).toBe(1);
    expect(result.state.cities.target.hp).toBe(1);
    // gold loss is applied by this resolver, not by cityResult.goldLost (see plan header).
    expect(result.cityResult.goldLost).toBe(0);
    expect(result.goldLost).toBe(150); // 1000 * 0.15
    expect(result.state.civilizations.defender.gold).toBe(850);
    expect(result.state.civilizations.attacker.strategicArsenal).toBe(0);
  });

  it('a garrisoned defender fully blocks HP damage and gold loss (unchanged hasGarrison gate)', () => {
    const state = makeStrikeState({
      units: { garrison: { id: 'garrison', type: 'warrior', owner: 'defender', position: TARGET_POS } as any },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('blocked');
    expect(result.state.cities.target.hp).toBeUndefined(); // untouched -- applyCitySiegeOutcome is a no-op on 'blocked'
    expect(result.goldLost).toBe(0);
    expect(result.state.civilizations.defender.gold).toBe(1000);
    // Arsenal is still spent -- the launch happened; a garrison blocking damage
    // doesn't un-launch the warhead.
    expect(result.state.civilizations.attacker.strategicArsenal).toBe(0);
  });

  it('never destroys the city, even at an era past the normal destruction threshold', () => {
    // Defender has exactly one city ('target') and era 12 is well past every
    // difficulty's citySiegeDestructionEra -- both conditions that would normally
    // reach resolveCitySiegeDamage's 'destroyed' branch. preventDestruction: true
    // intercepts before that branch is ever reached, regardless.
    const state = makeStrikeState({ era: 12 });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).not.toBe('destroyed');
    expect(result.state.cities.target).toBeDefined();
    expect(result.state.cities.target.hp).toBe(1);
  });

  it('rejects an illegal strike (no-arsenal) without touching state, reusing the MR2 legality resolver', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 0, diplomacy: attackerAtWar, visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'no-arsenal' });
  });

  it('rejects an illegal strike (not-at-war) — the hot-seat-accident guardrail', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: AT_PEACE, visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'not-at-war' });
  });

  it('rejects an unknown target city', () => {
    const result = resolveStrategicStrike(makeStrikeState(), 'attacker', 'nobody');
    expect(result).toEqual({ ok: false, reason: 'unknown-target-city' });
  });

  it('rejects with target-not-discovered when the target city has not been explored', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        attacker: makeCiv({ id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar, visibility: { tiles: {}, lastSeen: {} } }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'target-not-discovered' });
  });

  it('rejects with no-eligible-platform when arsenal/war/discovery are satisfied but no platform is in range', () => {
    const state = makeStrikeState({
      cities: {
        // no silo/sub anywhere -- 'silo' city has no capability-granting building
        silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: [] } as any,
        target: makeCity(),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    expect(result).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });

  it('does not mutate the input state on a successful strike', () => {
    const state = makeStrikeState();
    resolveStrategicStrike(state, 'attacker', 'target');
    expect(state.cities.target.hp).toBeUndefined();
    expect(state.civilizations.defender.gold).toBe(1000);
    expect(state.civilizations.attacker.strategicArsenal).toBe(1);
  });

  it('is deterministic -- identical input produces an identical result', () => {
    const state = makeStrikeState();
    const first = resolveStrategicStrike(state, 'attacker', 'target');
    const second = resolveStrategicStrike(state, 'attacker', 'target');
    expect(first).toEqual(second);
  });
});

describe('resolveStrategicStrike fallout (#545 MR3 §8)', () => {
  it('devastates the defender\'s owned tiles within blast radius 3, using standard devastationTurns (14)', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);

    const withinRadius3 = hexesInRange(TARGET_POS, 3).map(hexKey);
    expect(result.devastatedTileKeys.sort()).toEqual(withinRadius3.sort());
    for (const key of withinRadius3) {
      expect(result.state.map.tiles[key].devastatedUntilTurn).toBe(state.turn + 14);
    }
  });

  it('does not devastate tiles beyond blast radius 3 (boundary check)', () => {
    const state = makeStrikeState();
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);

    const beyondRadius3 = hexesInRange(TARGET_POS, 4)
      .map(hexKey)
      .filter(key => !hexesInRange(TARGET_POS, 3).map(hexKey).includes(key));
    expect(beyondRadius3.length).toBeGreaterThan(0);
    for (const key of beyondRadius3) {
      expect(result.state.map.tiles[key].devastatedUntilTurn).toBeUndefined();
    }
  });

  it('never devastates a tile owned by another civ or unowned land, even within blast radius', () => {
    const enemyTilePos = hexesInRange(TARGET_POS, 2)[0]!;
    const state = makeStrikeState({
      map: {
        width: 60, height: 60, wrapsHorizontally: false, rivers: [],
        tiles: (() => {
          const base = makeStrikeState().map.tiles;
          const key = hexKey(enemyTilePos);
          return { ...base, [key]: { ...base[key]!, owner: 'someone-else' } };
        })(),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.devastatedTileKeys).not.toContain(hexKey(enemyTilePos));
    expect(result.state.map.tiles[hexKey(enemyTilePos)].devastatedUntilTurn).toBeUndefined();
  });

  it('applies fallout unconditionally on a legal strike, even when a garrison blocks HP/gold effects', () => {
    const state = makeStrikeState({
      units: { garrison: { id: 'garrison', type: 'warrior', owner: 'defender', position: TARGET_POS } as any },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.cityResult.outcome).toBe('blocked');
    expect(result.devastatedTileKeys.length).toBeGreaterThan(0);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBe(state.turn + 14);
  });

  it('resolves devastation turns from the defending civ\'s own challenge, not the attacker\'s', () => {
    const state = makeStrikeState({
      civilizations: {
        ...makeStrikeState().civilizations,
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar, isHuman: true, challenge: 'veteran' as any }),
      },
    });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBe(state.turn + 18); // veteran
  });

  it('devastates nothing when the defending civ owns no tile in blast radius (mirrors crisis-system.ts\'s identical epicenter-ownership edge case)', () => {
    const base = makeStrikeState();
    const tiles = Object.fromEntries(
      Object.entries(base.map.tiles).map(([key, tile]) => [key, tile.owner === 'defender' ? { ...tile, owner: null } : tile]),
    );
    const state = makeStrikeState({ map: { ...base.map, tiles } });
    const result = resolveStrategicStrike(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.devastatedTileKeys).toEqual([]);
    expect(result.state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBeUndefined();
  });

  it('does not mutate the input state\'s map tiles on a successful strike', () => {
    const state = makeStrikeState();
    resolveStrategicStrike(state, 'attacker', 'target');
    expect(state.map.tiles[hexKey(TARGET_POS)].devastatedUntilTurn).toBeUndefined();
  });
});
