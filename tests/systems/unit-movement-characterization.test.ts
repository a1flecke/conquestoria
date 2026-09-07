/**
 * #1010 SAFETY NET — a table-driven golden over the entire movement surface of
 * `unit-system.ts`, committed BEFORE the movement decomposition moves any code
 * (mirrors `07fb7d15 test(storage): land the #1023 safety net before any code
 * moves`).
 *
 * Every import is from the `@/systems/unit-system` barrel, so these assertions
 * are invariant to which module the code physically lives in. If any of these
 * changes during the decomposition, a verbatim move became a behaviour change.
 */
import { describe, it, expect } from 'vitest';
import {
  createUnit,
  getMovementCost,
  getMovementCostForUnit,
  getMovementCostForUnitInContext,
  getMovementStepCost,
  getMovementStepCostFor,
  movementStepCostParamsForType,
  canHullEnterOcean,
  getMovementRange,
  getMovementRangeDetails,
  getMovementBlockerReason,
  getBlockingMapEntityAt,
  getBlockingMapEntityKeys,
  isBlockingCityFor,
  findPath,
  findPathToCity,
  BLOCKING_MAP_ENTITY_MESSAGES,
  UNIT_DEFINITIONS,
} from '@/systems/unit-system';
import type { GameMap, GameState, HexCoord, HexTile, TerrainType, Unit, UnitType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createEmptyPirateState } from '@/core/pirate-state';
import { explainerState } from './helpers/movement-explainer-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

type TileSpec = { terrain?: TerrainType; hasRoad?: boolean; owner?: string | null };

function buildMap(
  specs: Record<string, TileSpec>,
  opts: { rivers?: GameMap['rivers']; wraps?: boolean } = {},
): GameMap {
  const tiles: GameMap['tiles'] = {};
  let maxQ = 0;
  let maxR = 0;
  for (const [key, spec] of Object.entries(specs)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    maxQ = Math.max(maxQ, q);
    maxR = Math.max(maxR, r);
    tiles[hexKey({ q, r })] = {
      coord: { q, r },
      terrain: spec.terrain ?? 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      owner: spec.owner ?? null,
      improvementTurnsLeft: 0,
      hasRiver: false,
      hasRoad: spec.hasRoad ?? false,
      wonder: null,
    };
  }
  return {
    width: maxQ + 1,
    height: maxR + 1,
    wrapsHorizontally: opts.wraps ?? false,
    tiles,
    rivers: opts.rivers ?? [],
  };
}

function keys(path: HexCoord[] | null): string[] | null {
  return path ? path.map(hexKey) : null;
}

// ── getMovementCost — the raw terrain table ──────────────────────────────────
describe('#1010 golden — getMovementCost(terrain)', () => {
  it.each([
    ['grassland', 1], ['plains', 1], ['desert', 1], ['tundra', 1],
    ['forest', 2], ['hills', 2], ['snow', 2], ['jungle', 2], ['swamp', 2], ['volcanic', 2],
    ['mountain', 4], ['ocean', Infinity], ['coast', Infinity], ['nonsense', Infinity],
  ] as const)('%s → %s', (terrain, cost) => {
    expect(getMovementCost(terrain)).toBe(cost);
  });
});

// ── getMovementCostForUnit(terrain, domain, overrides?) ──────────────────────
describe('#1010 golden — getMovementCostForUnit', () => {
  it('air ignores terrain (always 1)', () => {
    expect(getMovementCostForUnit('mountain', 'air')).toBe(1);
    expect(getMovementCostForUnit('ocean', 'air')).toBe(1);
  });
  it('naval: 1 on water, Infinity on land', () => {
    expect(getMovementCostForUnit('ocean', 'naval')).toBe(1);
    expect(getMovementCostForUnit('coast', 'naval')).toBe(1);
    expect(getMovementCostForUnit('grassland', 'naval')).toBe(Infinity);
  });
  it('land honours terrainCostOverrides', () => {
    expect(getMovementCostForUnit('mountain', 'land')).toBe(4);
    expect(getMovementCostForUnit('mountain', 'land', { mountain: 1 })).toBe(1);
    expect(getMovementCostForUnit('hills', 'land', { hills: 1 })).toBe(1);
  });
});

// ── canHullEnterOcean ───────────────────────────────────────────────────────
describe('#1010 golden — canHullEnterOcean', () => {
  it.each([
    ['galley', false], ['trireme', true], ['naval_trader', true], ['warrior', false],
  ] as [UnitType, boolean][])('%s → %s', (type, expected) => {
    expect(canHullEnterOcean(type)).toBe(expected);
  });
});

// ── getMovementStepCost / getMovementStepCostFor — the canonical model ───────
describe('#1010 golden — getMovementStepCost matrix', () => {
  const map = buildMap({
    '0,0': { terrain: 'grassland' },
    '1,0': { terrain: 'grassland', hasRoad: true },
    '2,0': { terrain: 'forest' },
    '3,0': { terrain: 'forest', hasRoad: true },
    '4,0': { terrain: 'mountain' },
    '5,0': { terrain: 'grassland', owner: 'player' },
    '0,1': { terrain: 'ocean' },
    '1,1': { terrain: 'coast' },
  }, { rivers: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }] });

  const step = (type: UnitType, from: HexCoord, to: HexCoord, techs: string[] = [], owner = 'player') => {
    const u = createUnit(type, owner, from, mkC());
    return getMovementStepCost(u, map, from, to, { completedTechs: techs });
  };

  it('flat grassland = 1; road on flat = 1; road on forest = 1; forest = 2; mountain = 4', () => {
    // (1,0) has a road AND a river edge from (0,0); isolate the road by stepping from (2,0).
    expect(step('warrior', { q: 2, r: 0 }, { q: 3, r: 0 })).toBe(1); // forest+road
    expect(step('warrior', { q: 3, r: 0 }, { q: 2, r: 0 })).toBe(2); // forest, no road
    expect(step('warrior', { q: 3, r: 0 }, { q: 4, r: 0 })).toBe(4); // mountain
    expect(step('warrior', { q: 5, r: 0 }, { q: 4, r: 0 })).toBe(4); // mountain
  });
  it('unbridged river adds +1; bridge-building removes it', () => {
    expect(step('warrior', { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(2); // road 1 + river 1
    expect(step('warrior', { q: 0, r: 0 }, { q: 1, r: 0 }, ['bridge-building'])).toBe(1);
  });
  it('military-logistics / railway-expansion halve road steps to 0.5 (no stack)', () => {
    expect(step('warrior', { q: 2, r: 0 }, { q: 3, r: 0 }, ['military-logistics'])).toBe(0.5);
    expect(step('warrior', { q: 2, r: 0 }, { q: 3, r: 0 }, ['railway-expansion'])).toBe(0.5);
    expect(step('warrior', { q: 2, r: 0 }, { q: 3, r: 0 }, ['military-logistics', 'railway-expansion'])).toBe(0.5);
  });
  it('gps-navigation flattens own-territory terrain to 1', () => {
    expect(step('warrior', { q: 4, r: 0 }, { q: 5, r: 0 }, ['gps-navigation'])).toBe(1); // own grassland anyway
    // A mountain owned by the mover, with gps-navigation:
    const ownedMtn = buildMap({ '0,0': {}, '1,0': { terrain: 'mountain', owner: 'player' } });
    const u = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    expect(getMovementStepCost(u, ownedMtn, { q: 0, r: 0 }, { q: 1, r: 0 }, { completedTechs: ['gps-navigation'] })).toBe(1);
    expect(getMovementStepCost(u, ownedMtn, { q: 0, r: 0 }, { q: 1, r: 0 }, { completedTechs: [] })).toBe(4);
  });
  it('terrainCostOverrides (expedition: hills/mountain = 1)', () => {
    expect(step('expedition', { q: 3, r: 0 }, { q: 4, r: 0 })).toBe(1); // mountain override
  });
  it('naval: coast/ocean = 1, land = Infinity; ocean gated by hull', () => {
    expect(step('galley', { q: 1, r: 1 }, { q: 0, r: 1 })).toBe(Infinity); // coastal hull into ocean
    expect(step('trireme', { q: 1, r: 1 }, { q: 0, r: 1 })).toBe(1); // ocean hull into ocean
    expect(step('galley', { q: 0, r: 1 }, { q: 1, r: 1 })).toBe(1); // into coast
    expect(step('galley', { q: 1, r: 1 }, { q: 2, r: 0 })).toBe(Infinity); // onto land
  });
  it('air ignores everything (1)', () => {
    expect(step('biplane', { q: 4, r: 0 }, { q: 3, r: 0 })).toBe(1);
    expect(step('biplane', { q: 1, r: 1 }, { q: 0, r: 1 })).toBe(1);
  });

  it('getMovementStepCostFor(params, …) equals getMovementStepCost(unit, …) for the same inputs', () => {
    for (const type of ['warrior', 'expedition', 'galley', 'trireme', 'biplane'] as UnitType[]) {
      for (const techs of [[], ['military-logistics'], ['bridge-building'], ['gps-navigation']]) {
        const u = createUnit(type, 'player', { q: 2, r: 0 }, mkC());
        const params = movementStepCostParamsForType(type, UNIT_DEFINITIONS[type].domain ?? 'land', {
          completedTechs: techs, owner: 'player',
        });
        for (const [from, to] of [
          [{ q: 2, r: 0 }, { q: 3, r: 0 }], [{ q: 0, r: 0 }, { q: 1, r: 0 }], [{ q: 4, r: 0 }, { q: 5, r: 0 }],
        ] as [HexCoord, HexCoord][]) {
          expect(getMovementStepCostFor(params, map, from, to))
            .toBe(getMovementStepCost(u, map, from, to, { completedTechs: techs }));
        }
      }
    }
  });
});

// ── getMovementCostForUnitInContext ─────────────────────────────────────────
describe('#1010 golden — getMovementCostForUnitInContext', () => {
  it('mirrors the per-domain rules', () => {
    const warrior = createUnit('warrior', 'p', { q: 0, r: 0 }, mkC());
    expect(getMovementCostForUnitInContext(warrior, 'forest')).toBe(2);
    expect(getMovementCostForUnitInContext(warrior, 'ocean')).toBe(Infinity);
    const galley = createUnit('galley', 'p', { q: 0, r: 0 }, mkC());
    expect(getMovementCostForUnitInContext(galley, 'ocean')).toBe(Infinity);
    expect(getMovementCostForUnitInContext(galley, 'coast')).toBe(1);
    const trireme = createUnit('trireme', 'p', { q: 0, r: 0 }, mkC());
    expect(getMovementCostForUnitInContext(trireme, 'ocean')).toBe(1);
    const expedition = createUnit('expedition', 'p', { q: 0, r: 0 }, mkC());
    expect(getMovementCostForUnitInContext(expedition, 'mountain')).toBe(1);
  });
});

// ── findPath / findPathToCity — exact routes ────────────────────────────────
describe('#1010 golden — findPath exact routes', () => {
  it('road detour: longer in hexes, cheaper in movement points', () => {
    const map = buildMap({
      '0,0': {}, '1,0': { terrain: 'hills' }, '2,0': { terrain: 'hills' }, '3,0': {},
      '0,1': { terrain: 'hills', hasRoad: true }, '1,1': { terrain: 'hills', hasRoad: true }, '2,1': { terrain: 'hills', hasRoad: true },
    });
    const w = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    expect(keys(findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: w })))
      .toEqual(['0,0', '0,1', '1,1', '2,1', '3,0']);
  });
  it('river detour: avoids two unbridged crossings; bridge-building takes the short way', () => {
    const map = buildMap(
      { '0,0': {}, '1,0': {}, '2,0': {}, '0,1': {}, '1,1': {} },
      { rivers: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }, { from: { q: 1, r: 0 }, to: { q: 2, r: 0 } }] },
    );
    const w = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    expect(keys(findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'land', { unit: w })))
      .toEqual(['0,0', '0,1', '1,1', '2,0']);
    expect(keys(findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 'land', { unit: w, completedTechs: ['bridge-building'] })))
      .toEqual(['0,0', '1,0', '2,0']);
  });
  it('wraparound picks the shorter side deterministically', () => {
    const map = buildMap(Object.fromEntries(
      Array.from({ length: 18 }, (_, i) => [`${i % 6},${Math.floor(i / 6)}`, {}]),
    ), { wraps: true });
    const w = createUnit('warrior', 'player', { q: 0, r: 1 }, mkC());
    const a = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { unit: w });
    const b = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { unit: w });
    expect(a).toEqual(b);
    expect(a?.length).toBe(4);
  });
  it('returns null for an unreachable tile', () => {
    const map = buildMap({ '0,0': {}, '1,0': { terrain: 'ocean' } });
    expect(findPath({ q: 0, r: 0 }, { q: 1, r: 0 }, map, 'land')).toBeNull();
  });
  it('findPathToCity land delegates to findPath; unit context is threaded', () => {
    const map = buildMap({
      '0,0': {}, '1,0': { terrain: 'hills' }, '2,0': { terrain: 'hills' }, '3,0': {},
      '0,1': { terrain: 'hills', hasRoad: true }, '1,1': { terrain: 'hills', hasRoad: true }, '2,1': { terrain: 'hills', hasRoad: true },
    });
    const w = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    expect(keys(findPathToCity({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', { unit: w })))
      .toEqual(['0,0', '0,1', '1,1', '2,1', '3,0']);
  });
});

// ── movement range + blockers — full GameState ──────────────────────────────
function fixtureState(): { state: GameState; moverId: string } {
  const map = buildMap({
    '0,0': {}, '1,0': {}, '2,0': {}, '3,0': {}, '4,0': {},
    '0,1': {}, '1,1': {}, '2,1': {}, '3,1': {}, '4,1': {},
    '0,2': {}, '1,2': {}, '2,2': {}, '3,2': {}, '4,2': {},
  });
  const counters = mkC();
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, counters);
  mover.movementPointsLeft = 3;
  const hostile = createUnit('warrior', 'civ-b', { q: 2, r: 2 }, counters);
  const state = {
    turn: 1, era: 1, gameId: 'char', currentPlayer: 'civ-a',
    gameOver: false, winner: null, map,
    units: { [mover.id]: mover, [hostile.id]: hostile },
    cities: {
      'city-b': { id: 'city-b', name: 'B', owner: 'civ-b', position: { q: 4, r: 0 } },
    },
    barbarianCamps: { 'camp-1': { id: 'camp-1', position: { q: 0, r: 2 } } },
    pirates: createEmptyPirateState(),
    civilizations: {
      'civ-a': { id: 'civ-a', units: [mover.id], techState: { completed: [] }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-a') },
      'civ-b': { id: 'civ-b', units: [hostile.id], techState: { completed: [] }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-b') },
    },
  } as unknown as GameState;
  return { state, moverId: mover.id };
}

describe('#1010 golden — blockers', () => {
  it('isBlockingCityFor: foreign unallied city blocks; own city does not', () => {
    const { state } = fixtureState();
    const mover = state.units[Object.keys(state.units)[0]!]!;
    expect(isBlockingCityFor(state, mover, state.cities['city-b']!)).toBe(true);
  });
  it('getBlockingMapEntityAt: foreign city / barbarian camp; empty tile → null', () => {
    const { state, moverId } = fixtureState();
    const mover = state.units[moverId]!;
    expect(getBlockingMapEntityAt(state, mover, { q: 4, r: 0 })).toEqual({ reason: 'foreign-city', entityId: 'city-b' });
    expect(getBlockingMapEntityAt(state, mover, { q: 0, r: 2 })).toEqual({ reason: 'barbarian-camp', entityId: 'camp-1' });
    expect(getBlockingMapEntityAt(state, mover, { q: 1, r: 1 })).toBeNull();
  });
  it('getBlockingMapEntityKeys agrees with the per-coord form', () => {
    const { state, moverId } = fixtureState();
    const mover = state.units[moverId]!;
    const set = getBlockingMapEntityKeys(state, mover);
    for (const key of Object.keys(state.map.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      expect(set.has(key)).toBe(getBlockingMapEntityAt(state, mover, { q, r }) !== null);
    }
  });
  it('BLOCKING_MAP_ENTITY_MESSAGES copy is stable', () => {
    expect(BLOCKING_MAP_ENTITY_MESSAGES).toEqual({
      'foreign-city': 'Move adjacent, then use the city assault action.',
      'barbarian-camp': 'Move adjacent, then attack to destroy the camp.',
      'pirate-enclave': 'This pirate stronghold can only be destroyed by a warship attacking from an adjacent sea tile.',
    });
  });
});

describe('#1010 golden — getMovementRange / getMovementRangeDetails', () => {
  it('reachable set excludes blocked entity tiles that are not directly adjacent', () => {
    const { state, moverId } = fixtureState();
    const details = getMovementRangeDetails(state, moverId);
    const reach = new Set(details.reachable.map(hexKey));
    // 3 MP over flat grassland: (3,0) reachable, (4,0) is a foreign city 4 away → excluded.
    expect(reach.has('3,0')).toBe(true);
    expect(reach.has('4,0')).toBe(false);
    // barbarian camp at (0,2) is 2 away → not directly adjacent from start → excluded.
    expect(reach.has('0,2')).toBe(false);
  });
  it('getMovementRange (decomposed-inputs form) matches on the same fixture', () => {
    const { state, moverId } = fixtureState();
    const mover = state.units[moverId]!;
    const unitPositions: Record<string, string> = {};
    const unitOwners: Record<string, string> = {};
    for (const u of Object.values(state.units)) { unitPositions[hexKey(u.position)] = u.id; unitOwners[u.id] = u.owner; }
    const blockingKeys = getBlockingMapEntityKeys(state, mover);
    const range = getMovementRange(mover, state.map, unitPositions, unitOwners, new Set(['civ-b']), { completedTechs: [] }, blockingKeys);
    const reach = new Set(range.map(hexKey));
    expect(reach.has('3,0')).toBe(true);
    expect(reach.has('4,0')).toBe(false);
  });
});

// ── getMovementBlockerReason — every code + message (#1025 MR4: derives from the resolver) ──
describe('#1010 golden — getMovementBlockerReason', () => {
  const map = buildMap({
    '0,0': {}, '1,0': {}, '2,0': { terrain: 'mountain' }, '3,0': {},
    '0,1': { terrain: 'ocean' },
  });
  const at = (type: UnitType, to: HexCoord, opts: { visibilityState?: 'unexplored' | 'fog' | 'visible' } = {}, mp = 2) => {
    const u = createUnit(type, 'player', { q: 0, r: 0 }, mkC());
    u.movementPointsLeft = mp;
    return getMovementBlockerReason(explainerState(u, map), u.id, to, opts);
  };
  it('null for a legal move', () => {
    expect(at('warrior', { q: 1, r: 0 })).toBeNull();
  });
  it('impassable-water for a land unit into ocean', () => {
    expect(at('warrior', { q: 0, r: 1 })?.code).toBe('impassable-water');
  });
  it('insufficient-movement past a mountain', () => {
    expect(at('warrior', { q: 3, r: 0 })?.code).toBe('insufficient-movement');
  });
  it('redacts a rejection to the scouting message when the destination is unexplored', () => {
    // #1025 MR4: redaction applies to a REJECTION. (0,1) is ocean → impassable-water → redacted.
    expect(at('warrior', { q: 0, r: 1 }, { visibilityState: 'unexplored' }))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });
  it('a foreign city on the destination reports foreign-city + shared copy', () => {
    const u = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    const state = explainerState(u, map);
    state.cities = { 'foreign-1': { id: 'foreign-1', name: 'X', owner: 'enemy', position: { q: 1, r: 0 } } as never };
    expect(getMovementBlockerReason(state, u.id, { q: 1, r: 0 }))
      .toEqual({ code: 'foreign-city', message: BLOCKING_MAP_ENTITY_MESSAGES['foreign-city'] });
  });
});
