import { describe, it, expect } from 'vitest';
import { createUnit, getMovementRange, resetUnitTurn, UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { GameMap } from '@/core/types';

function plainsMap(radius = 5): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r },
        terrain: 'plains',
        owner: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
      } as any;
    }
  }
  return { width: 2 * radius + 1, height: 2 * radius + 1, tiles, wrapsHorizontally: false } as GameMap;
}

describe('plains movement (#85)', () => {
  it('warrior with 2 movement reaches exactly 2 plains rings (18 hexes)', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 });
    expect(warrior.movementPointsLeft).toBe(2);
    const range = getMovementRange(warrior, plainsMap(), {}, {});
    // 2-ring hex disc minus origin = 6 + 12 = 18
    expect(range.length).toBe(18);
  });

  it('non-Viking civ bonus (auto_roads) does NOT grant movement bonus', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, { type: 'auto_roads' });
    expect(warrior.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(warrior.movementBonus).toBeUndefined();
  });

  it('resetUnitTurn does not accumulate movement bonus across resets', () => {
    let warrior = createUnit('warrior', 'p1', { q: 0, r: 0 });
    warrior = resetUnitTurn(warrior);
    warrior = resetUnitTurn(warrior);
    expect(warrior.movementPointsLeft).toBe(2);
  });

  it('Viking warrior with naval_raiding reaches 3 rings (36 hexes)', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, {
      type: 'naval_raiding',
      movementBonus: 1,
      coastalVisionBonus: 1,
    });
    expect(warrior.movementPointsLeft).toBe(3);
    const range = getMovementRange(warrior, plainsMap(), {}, {});
    // 3-ring hex disc = 6 + 12 + 18 = 36
    expect(range.length).toBe(36);
  });

  it('scout has 3 movement by default (not affected by non-Viking bonuses)', () => {
    const scout = createUnit('scout', 'p1', { q: 0, r: 0 }, { type: 'auto_roads' });
    expect(scout.movementPointsLeft).toBe(UNIT_DEFINITIONS.scout.movementPoints);
  });
});
