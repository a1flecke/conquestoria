import type { GameMap, HexCoord, Unit } from '@/core/types';
import type { UnitMotionState } from '@/renderer/unit-visual-resolver';

export interface UnitMovementAnimation {
  unit: Unit;
  from: HexCoord;
  to: HexCoord;
  renderFrom: HexCoord;
  renderTo: HexCoord;
  duration: number;
}

export interface UnitMovementFrame {
  coord: HexCoord;
  motion: UnitMotionState;
}

export function getMovementDurationMs(path: HexCoord[]): number {
  const steps = Math.max(1, path.length - 1);
  return Math.min(600, 250 + Math.max(0, steps - 1) * 120);
}

function wrappedRenderDestination(from: HexCoord, to: HexCoord, map: GameMap): HexCoord {
  if (!map.wrapsHorizontally) return to;
  const directDelta = to.q - from.q;
  const westDelta = to.q - map.width - from.q;
  const eastDelta = to.q + map.width - from.q;
  const bestDelta = [directDelta, westDelta, eastDelta].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  return { q: from.q + bestDelta, r: to.r };
}

export function createMovementAnimation(unit: Unit, from: HexCoord, to: HexCoord, map: GameMap): UnitMovementAnimation {
  return {
    unit,
    from,
    to,
    renderFrom: from,
    renderTo: wrappedRenderDestination(from, to, map),
    duration: getMovementDurationMs([from, to]),
  };
}

export function getMovementAnimationPosition(animation: UnitMovementAnimation, progress: number): UnitMovementFrame {
  const clamped = Math.max(0, Math.min(1, progress));
  return {
    coord: {
      q: animation.renderFrom.q + (animation.renderTo.q - animation.renderFrom.q) * clamped,
      r: animation.renderFrom.r + (animation.renderTo.r - animation.renderFrom.r) * clamped,
    },
    motion: Math.floor(clamped * 6) % 2 === 0 ? 'move-a' : 'move-b',
  };
}

export function getMovingUnitIds(animations: UnitMovementAnimation[]): Set<string> {
  return new Set(animations.map(animation => animation.unit.id));
}
