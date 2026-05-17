import { describe, expect, it } from 'vitest';
import type { GameMap, Unit } from '@/core/types';
import { createMovementAnimation, getMovementAnimationPosition, getMovementDurationMs, getMovingUnitIds } from '@/renderer/unit-movement-animation';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const map = { width: 6, height: 4, wrapsHorizontally: true, tiles: {}, rivers: [] } as GameMap;

function unit(id: string): Unit {
  return { ...createUnit('warrior', 'player', { q: 0, r: 1 }, mkC()), id };
}

describe('unit-movement-animation', () => {
  it('uses a short wrapped route across the horizontal edge', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 5, r: 1 }, map);

    expect(animation.renderFrom.q).toBe(0);
    expect(animation.renderTo.q).toBe(-1);
  });

  it('clamps normal movement duration to a responsive range', () => {
    expect(getMovementDurationMs([{ q: 0, r: 0 }, { q: 1, r: 0 }])).toBe(250);
    expect(getMovementDurationMs([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }])).toBeLessThanOrEqual(600);
  });

  it('interpolates position and alternates moving frames', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 1, r: 1 }, map);
    const halfway = getMovementAnimationPosition(animation, 0.5);

    expect(halfway.coord.q).toBeCloseTo(0.5);
    expect(halfway.motion).toBe('move-b');
  });

  it('tracks moving unit ids for stationary renderer hiding', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 1, r: 1 }, map);

    expect(getMovingUnitIds([animation])).toEqual(new Set(['u1']));
  });
});
