import { describe, it, expect } from 'vitest';
import { placeVillages, visitVillage, rollVillageOutcome } from '@/systems/village-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import type { GameState } from '@/core/types';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `village-test-${size}`);
}

function makeGameState(): GameState {
  return createNewGame(undefined, 'village-game-test');
}

describe('placeVillages', () => {
  it('places up to 8 villages on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'small', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(8);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 12 villages on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const villages = placeVillages(map, starts, 'medium', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(12);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 20 villages on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 4);
    const villages = placeVillages(map, starts, 'large', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(20);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('enforces distance from start positions (min 4)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const villages = placeVillages(map, starts, 'medium', 'village-dist-test');
    for (const v of Object.values(villages)) {
      for (const sp of starts) {
        expect(hexDistance(v.position, sp)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('enforces distance between villages (min 3)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'medium', 'village-inter-test');
    const positions = Object.values(villages).map(v => v.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(hexDistance(positions[i], positions[j])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('does not place villages on wonder tiles', () => {
    const map = makeMap('medium');
    const hillTile = Object.values(map.tiles).find(t => t.terrain === 'hills')!;
    hillTile.wonder = 'crystal_caverns';

    const starts = findStartPositions(map, 2);
    const villages = placeVillages(map, starts, 'medium', 'village-wonder-test');
    for (const v of Object.values(villages)) {
      const tile = map.tiles[hexKey(v.position)];
      expect(tile.wonder).toBeNull();
    }
  });
});

describe('visitVillage', () => {
  it('removes village from state on visit', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };

    visitVillage(state, 'v1', unit, () => 0.1);
    expect(state.tribalVillages['v1']).toBeUndefined();
  });

  it('gold outcome adds gold to civ', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const goldBefore = state.civilizations.player.gold;

    visitVillage(state, 'v1', unit, () => 0.1); // 0.1 < 0.25 = gold
    expect(state.civilizations.player.gold).toBeGreaterThan(goldBefore);
  });

  it('illness outcome reduces unit HP (min 1)', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    unit.health = 30;

    visitVillage(state, 'v1', unit, () => 0.96); // 0.96 > 0.95 = illness
    expect(unit.health).toBeLessThan(30);
    expect(unit.health).toBeGreaterThanOrEqual(1);
  });

  it('free unit outcome spawns unit at village position', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const unitCountBefore = Object.keys(state.units).length;

    visitVillage(state, 'v1', unit, () => 0.65); // 0.65 = free_unit
    expect(Object.keys(state.units).length).toBeGreaterThan(unitCountBefore);
  });
});

describe('rollVillageOutcome', () => {
  it('returns gold for rng < 0.25', () => {
    expect(rollVillageOutcome(0.1)).toBe('gold');
  });

  it('returns food for rng 0.25-0.45', () => {
    expect(rollVillageOutcome(0.3)).toBe('food');
  });

  it('returns science for rng 0.45-0.60', () => {
    expect(rollVillageOutcome(0.5)).toBe('science');
  });

  it('returns free_unit for rng 0.60-0.75', () => {
    expect(rollVillageOutcome(0.65)).toBe('free_unit');
  });

  it('returns free_tech for rng 0.75-0.85', () => {
    expect(rollVillageOutcome(0.8)).toBe('free_tech');
  });

  it('returns ambush for rng 0.85-0.95', () => {
    expect(rollVillageOutcome(0.9)).toBe('ambush');
  });

  it('returns illness for rng >= 0.95', () => {
    expect(rollVillageOutcome(0.96)).toBe('illness');
  });
});
