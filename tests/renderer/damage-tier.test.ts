import { describe, it, expect, vi } from 'vitest';

// Mock heavy renderer deps so the test can import buildUnitEntities without a canvas
vi.mock('@/renderer/hex-renderer', () => ({ drawHexMap: vi.fn(), drawRivers: vi.fn(), drawMinorCivTerritory: vi.fn(), drawHexHighlight: vi.fn() }));
vi.mock('@/renderer/fog-renderer', () => ({ drawFogOfWar: vi.fn() }));
vi.mock('@/renderer/city-renderer', () => ({ drawCities: vi.fn() }));
vi.mock('@/renderer/unit-renderer', () => ({ drawUnits: vi.fn(), drawUnitGlyph: vi.fn() }));
vi.mock('@/renderer/sprite-overlay', () => ({ SpriteOverlay: class { sync = vi.fn(); getActiveIds = () => new Set() } }));

import { buildUnitEntities } from '@/renderer/render-loop';
import type { GameState, Unit } from '@/core/types';

function makeState(units: Partial<Unit>[]): GameState {
  const unitsRecord: Record<string, Unit> = {};
  for (const u of units) {
    const unit = {
      id: u.id ?? 'u1',
      type: u.type ?? 'warrior',
      owner: u.owner ?? 'player',
      position: u.position ?? { q: 0, r: 0 },
      movementPointsLeft: 2,
      health: u.health ?? 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
      ...u,
    } as Unit;
    unitsRecord[unit.id] = unit;
  }
  return {
    units: unitsRecord,
    civilizations: {
      player: { id: 'player', civType: 'rome', color: '#e00', visibility: { tiles: {}, exploredTiles: {} }, diplomacy: { relationships: {}, atWarWith: [], activeTreaties: [] }, cities: [], gold: 0, culture: 0, science: 0, techState: { completed: [], inProgress: null }, spyCooldowns: {}, researchedTechs: [] },
    },
    currentPlayer: 'player',
  } as unknown as GameState;
}

const visMap = { tiles: { '0,0': 'visible' as const }, exploredTiles: {} };

describe('damage tier computation in buildUnitEntities', () => {
  it('warrior at 100 HP → damage tier 0', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 100 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(0);
  });

  it('warrior at 76 HP → damage tier 0 (boundary)', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 76 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(0);
  });

  it('warrior at 75 HP → damage tier 1', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 75 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(1);
  });

  it('warrior at 51 HP → damage tier 1 (boundary)', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 51 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(1);
  });

  it('warrior at 50 HP → damage tier 2', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 50 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(2);
  });

  it('warrior at 26 HP → damage tier 2 (boundary)', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 26 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(2);
  });

  it('warrior at 25 HP → damage tier 3 (near death)', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 25 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(3);
  });

  it('warrior at 1 HP → damage tier 3', () => {
    const state = makeState([{ id: 'u1', type: 'warrior', owner: 'player', health: 1 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(3);
  });

  it('worker (strength 0) at 1 HP → damage tier 0 (non-combat units never show damage)', () => {
    const state = makeState([{ id: 'u1', type: 'worker', owner: 'player', health: 1 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(0);
  });

  it('settler (strength 0) at 25 HP → damage tier 0', () => {
    const state = makeState([{ id: 'u1', type: 'settler', owner: 'player', health: 25 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(0);
  });

  it('beast_boar at 30 HP → damage tier 2', () => {
    // Beast units have strength > 0, so they progress through all 4 tiers
    const state = makeState([{ id: 'beast1', type: 'beast_boar', owner: 'beasts', health: 30 }]);
    // beasts owner has no civ entry — that is intentional
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(2);
  });

  it('beast_boar at 100 HP → damage tier 0', () => {
    const state = makeState([{ id: 'beast1', type: 'beast_boar', owner: 'beasts', health: 100 }]);
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
    expect(entities[0]?.damage).toBe(0);
  });
});
