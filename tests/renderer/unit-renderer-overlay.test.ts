import { describe, it, expect } from 'vitest';
import { buildUnitEntities } from '@/renderer/render-loop';
import type { GameState, Unit, VisibilityMap } from '@/core/types';

function makeVisMap(coords: Array<{ q: number; r: number }>, status: 'visible' | 'fog' | 'unexplored'): VisibilityMap {
  const tiles: Record<string, typeof status> = {};
  for (const c of coords) tiles[`${c.q},${c.r}`] = status;
  return { tiles } as VisibilityMap;
}

function makeState(units: Unit[], visMap: VisibilityMap = { tiles: {} }): GameState {
  return {
    currentPlayer: 'player1',
    units: Object.fromEntries(units.map(u => [u.id, u])),
    civilizations: {
      'player1': { id: 'player1', color: '#b53026', civType: 'imperials', visibility: visMap } as any,
      'player2': { id: 'player2', color: '#1d4a8c', civType: 'vikings',   visibility: { tiles: {} as Record<string, any> } } as any,
      'player3': { id: 'player3', color: '#888888', civType: 'unknown_faction', visibility: { tiles: {} as Record<string, any> } } as any,
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
    // player2 civType = 'vikings' — expect that faction, not player1's 'imperials'
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
