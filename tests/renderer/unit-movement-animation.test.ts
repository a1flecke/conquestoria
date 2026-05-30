import { describe, expect, it } from 'vitest';
import type { GameMap, Unit } from '@/core/types';
import { createMovementAnimation, getMovementAnimationPosition, getMovementDurationMs, getMovingUnitIds, MOVEMENT_MS_PER_HEX, MOVEMENT_MAX_MS } from '@/renderer/unit-movement-animation';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const map = { width: 6, height: 4, wrapsHorizontally: true, tiles: {}, rivers: [] } as GameMap;

function unit(id: string): Unit {
  return { ...createUnit('warrior', 'player', { q: 0, r: 1 }, mkC()), id };
}

describe('unit-movement-animation', () => {
  describe('getMovementDurationMs', () => {
    it('uses 220 ms per step for a single-hex move', () => {
      expect(getMovementDurationMs(1)).toBe(MOVEMENT_MS_PER_HEX);
    });

    it('scales linearly up to the cap', () => {
      expect(getMovementDurationMs(2)).toBe(MOVEMENT_MS_PER_HEX * 2);
      expect(getMovementDurationMs(3)).toBe(MOVEMENT_MS_PER_HEX * 3);
    });

    it('caps at MOVEMENT_MAX_MS for long paths', () => {
      expect(getMovementDurationMs(100)).toBe(MOVEMENT_MAX_MS);
    });

    it('exports named constants so callers can reason about timing', () => {
      expect(MOVEMENT_MS_PER_HEX).toBe(220);
      expect(MOVEMENT_MAX_MS).toBe(800);
    });
  });

  describe('createMovementAnimation (path-based)', () => {
    it('accepts a path array and derives from/to from its endpoints', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 1, r: 1 }], map);
      expect(anim.from).toEqual({ q: 0, r: 1 });
      expect(anim.to).toEqual({ q: 1, r: 1 });
    });

    it('stores the full path', () => {
      const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
      const anim = createMovementAnimation(unit('u1'), path, map);
      expect(anim.path).toEqual(path);
      expect(anim.renderPath).toHaveLength(3);
    });

    it('uses a short wrapped route across the horizontal edge', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 5, r: 1 }], map);
      expect(anim.renderPath[0].q).toBe(0);
      expect(anim.renderPath[1].q).toBe(-1); // wraps westward (shorter route on width-6 map)
    });

    it('wraps each step relative to the previous render position for multi-step paths', () => {
      // On a width-6 map, going 0→5→4 should wrap consistently
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 0 }, { q: 5, r: 0 }, { q: 4, r: 0 }], map);
      // First step wraps to -1 (westward)
      expect(anim.renderPath[1].q).toBe(-1);
      // Second step continues in the same direction
      expect(anim.renderPath[2].q).toBe(-2);
    });

    it('sets duration using 220 ms per step', () => {
      const oneStep = createMovementAnimation(unit('u1'), [{ q: 0, r: 0 }, { q: 1, r: 0 }], map);
      expect(oneStep.duration).toBe(220);

      const threeStep = createMovementAnimation(unit('u1'), [
        { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 },
      ], map);
      expect(threeStep.duration).toBe(660);
    });
  });

  describe('getMovementAnimationPosition', () => {
    it('starts at the first path coordinate at progress 0', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 2, r: 1 }], map);
      const frame = getMovementAnimationPosition(anim, 0);
      expect(frame.coord.q).toBeCloseTo(0);
    });

    it('reaches the final path coordinate at progress 1', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 2, r: 1 }], map);
      const frame = getMovementAnimationPosition(anim, 1);
      expect(frame.coord.q).toBeCloseTo(2);
    });

    it('applies ease-in-out so mid-segment position is at 0.5 eased fraction', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 1, r: 1 }], map);
      const halfway = getMovementAnimationPosition(anim, 0.5);
      // ease-in-out(0.5) = 0.5 exactly
      expect(halfway.coord.q).toBeCloseTo(0.5);
    });

    it('is slower at start and end than in the middle (ease-in-out shape)', () => {
      // Use a non-wrapping map so coords aren't adjusted
      const bigMap = { width: 100, height: 100, wrapsHorizontally: false, tiles: {}, rivers: [] } as GameMap;
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 0 }, { q: 10, r: 0 }], bigMap);
      const at10 = getMovementAnimationPosition(anim, 0.1).coord.q;
      const at40 = getMovementAnimationPosition(anim, 0.4).coord.q;
      const at60 = getMovementAnimationPosition(anim, 0.6).coord.q;
      const at90 = getMovementAnimationPosition(anim, 0.9).coord.q;
      // Middle spans (40→60) cover more distance than edge spans (0→10 and 90→100)
      const midSpan = at60 - at40;
      const startSpan = at10 - 0;
      const endSpan = 10 - at90;
      expect(midSpan).toBeGreaterThan(startSpan);
      expect(midSpan).toBeGreaterThan(endSpan);
    });

    it('alternates move-a / move-b motion states throughout', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 1, r: 1 }], map);
      const motions = [0, 0.2, 0.4, 0.6, 0.8].map(p => getMovementAnimationPosition(anim, p).motion);
      expect(motions).toContain('move-a');
      expect(motions).toContain('move-b');
    });

    it('for a 3-step path, mid-path at progress 0.5 is near the second waypoint', () => {
      const anim = createMovementAnimation(unit('u1'), [
        { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
      ], map);
      // Progress 0.5 = end of step 1 (half the 2-step path)
      const midFrame = getMovementAnimationPosition(anim, 0.5);
      expect(midFrame.coord.q).toBeCloseTo(1, 0);
    });
  });

  describe('getMovingUnitIds', () => {
    it('tracks moving unit ids for stationary renderer hiding', () => {
      const anim = createMovementAnimation(unit('u1'), [{ q: 0, r: 1 }, { q: 1, r: 1 }], map);
      expect(getMovingUnitIds([anim])).toEqual(new Set(['u1']));
    });
  });
});
