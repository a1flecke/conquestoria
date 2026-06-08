import { describe, it, expect } from 'vitest';
import { buildUnitEntities, buildBuildingEntities, CIVTYPE_TO_FACTION, civTypeToFaction } from '@/renderer/render-loop';
import type { GameState, Unit, VisibilityMap, City } from '@/core/types';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

function makeVisMap(coords: Array<{ q: number; r: number }>, status: 'visible' | 'fog' | 'unexplored'): VisibilityMap {
  const tiles: Record<string, typeof status> = {};
  for (const c of coords) tiles[`${c.q},${c.r}`] = status;
  return { tiles } as VisibilityMap;
}

function makeState(units: Unit[], visMap: VisibilityMap = { tiles: {} }): GameState {
  return {
    currentPlayer: 'player1',
    units: Object.fromEntries(units.map(u => [u.id, u])),
    cities: {},
    civilizations: {
      // Use real CivDefinition ids so faction-mapping tests exercise the real code path
      'player1': { id: 'player1', color: '#b53026', civType: 'rome',    visibility: visMap } as any,
      'player2': { id: 'player2', color: '#1d4a8c', civType: 'england', visibility: { tiles: {} as Record<string, any> } } as any,
      'player3': { id: 'player3', color: '#888888', civType: 'unknown_faction', visibility: { tiles: {} as Record<string, any> } } as any,
    },
    espionage: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false } as any,
    minorCivs: {},
  } as unknown as GameState;
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'c1', name: 'Rome', owner: 'player1',
    position: { q: 0, r: 0 },
    buildings: [],
    productionQueue: [],
    population: 1, food: 0, production: 0, gold: 0, science: 0,
    ...overrides,
  } as unknown as City;
}

function makeStateWithCities(cities: City[]): GameState {
  return {
    currentPlayer: 'player1',
    units: {},
    cities: Object.fromEntries(cities.map(c => [c.id, c])),
    civilizations: {
      'player1': { id: 'player1', color: '#b53026', civType: 'rome', visibility: { tiles: {} } } as any,
    },
    espionage: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false } as any,
    minorCivs: {},
  } as unknown as GameState;
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return { id: 'u1', type: 'warrior', position: { q: 2, r: 3 }, owner: 'player1', ...overrides } as Unit;
}

describe('buildUnitEntities', () => {
  it('includes units in visible hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).toContain('u1');
  });

  it('excludes units in fog hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'fog'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('excludes units in unexplored hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'unexplored'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('excludes moving units (movement animation gate)', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(['u1']));
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('maps civType to faction', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player1' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities[0]?.faction).toBe('imperials');
  });

  it('uses owner faction not viewer faction', () => {
    // player2 is visible to player1, owns the unit
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player2' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    // player2 civType = 'england' → maps to 'vikings' via CIVTYPE_TO_FACTION
    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.faction).toBe('vikings');
  });

  it('falls back to imperials for unknown civType', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player3' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.faction).toBe('imperials');
  });

  it('returns kind=unit and correct subtype', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, type: 'archer' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities[0]?.kind).toBe('unit');
    expect(entities[0]?.subtype).toBe('archer');
  });
});

// ── civTypeToFaction ───────────────────────────────────────────────────────────

describe('civTypeToFaction', () => {
  it('maps rome to imperials', () => expect(civTypeToFaction('rome')).toBe('imperials'));
  it('maps egypt to pharaohs', () => expect(civTypeToFaction('egypt')).toBe('pharaohs'));
  it('maps greece to hellenes', () => expect(civTypeToFaction('greece')).toBe('hellenes'));
  it('maps england to vikings', () => expect(civTypeToFaction('england')).toBe('vikings'));
  it('maps mongolia to khanate', () => expect(civTypeToFaction('mongolia')).toBe('khanate'));
  it('maps japan to shogunate', () => expect(civTypeToFaction('japan')).toBe('shogunate'));
  it('falls back to imperials for an unrecognized civType', () => expect(civTypeToFaction('__unknown_civ__')).toBe('imperials'));

  it('every CivDefinition.id has an explicit entry in CIVTYPE_TO_FACTION (no silent fallback for real civs)', () => {
    const missing = CIV_DEFINITIONS.filter(d => !(d.id in CIVTYPE_TO_FACTION));
    expect(missing.map(d => d.id)).toEqual([]);
  });
});

// ── buildBuildingEntities ─────────────────────────────────────────────────────

describe('buildBuildingEntities', () => {
  const allVisible: VisibilityMap = { tiles: { '0,0': 'visible' } } as any;

  it('emits exactly 1 entity per city that has buildings', () => {
    const city = makeCity({ buildings: ['granary', 'barracks', 'library'] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities.filter(e => e.id.startsWith('c1:')).length).toBe(1);
  });

  it('picks the last completed building', () => {
    const city = makeCity({ buildings: ['granary', 'barracks'] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities[0]?.subtype).toBe('barracks');
  });

  it('emits 0 entities for a city with no buildings', () => {
    const city = makeCity({ buildings: [] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities.filter(e => e.id.startsWith('c1:')).length).toBe(0);
  });

  it('emits 1 entity per city when multiple cities each have buildings', () => {
    const c1 = makeCity({ id: 'c1', buildings: ['granary'], position: { q: 0, r: 0 } });
    const c2 = makeCity({ id: 'c2', buildings: ['barracks'], position: { q: 0, r: 0 } });
    const state = makeStateWithCities([c1, c2]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities.length).toBe(2);
  });

  it('skips cities not visible to viewer', () => {
    const city = makeCity({ buildings: ['granary'], position: { q: 5, r: 5 } });
    const state = makeStateWithCities([city]);
    const fogMap: VisibilityMap = { tiles: { '5,5': 'fog' } } as any;
    const entities = buildBuildingEntities(state, fogMap);
    expect(entities.length).toBe(0);
  });

  it('uses civTypeToFaction for city owner (rome → imperials)', () => {
    const city = makeCity({ buildings: ['granary'] });
    const state = makeStateWithCities([city]); // player1 has civType 'rome'
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities[0]?.faction).toBe('imperials');
  });
});
