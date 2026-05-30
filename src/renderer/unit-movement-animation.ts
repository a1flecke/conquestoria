import type { GameMap, HexCoord, Unit } from '@/core/types';
import type { UnitMotionState } from '@/renderer/unit-visual-resolver';

export const MOVEMENT_MS_PER_HEX = 220;
export const MOVEMENT_MAX_MS = 800;

export interface UnitMovementAnimation {
  unit: Unit;
  path: HexCoord[];
  renderPath: HexCoord[];
  from: HexCoord;
  to: HexCoord;
  duration: number;
}

export interface UnitMovementFrame {
  coord: HexCoord;
  motion: UnitMotionState;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function getMovementDurationMs(stepCount: number): number {
  return Math.min(MOVEMENT_MAX_MS, stepCount * MOVEMENT_MS_PER_HEX);
}

function wrappedRenderStep(from: HexCoord, to: HexCoord, map: GameMap): HexCoord {
  if (!map.wrapsHorizontally) return to;
  const directDelta = to.q - from.q;
  const westDelta = to.q - map.width - from.q;
  const eastDelta = to.q + map.width - from.q;
  const bestDelta = [directDelta, westDelta, eastDelta].sort((a, b) => Math.abs(a) - Math.abs(b))[0]!;
  return { q: from.q + bestDelta, r: to.r };
}

export function createMovementAnimation(unit: Unit, path: HexCoord[], map: GameMap): UnitMovementAnimation {
  if (path.length < 2) {
    const coord = path[0] ?? unit.position;
    return { unit, path: [coord], renderPath: [coord], from: coord, to: coord, duration: 0 };
  }
  const renderPath: HexCoord[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    renderPath.push(wrappedRenderStep(renderPath[i - 1]!, path[i]!, map));
  }
  const steps = path.length - 1;
  return {
    unit,
    path,
    renderPath,
    from: path[0]!,
    to: path[path.length - 1]!,
    duration: getMovementDurationMs(steps),
  };
}

export function getMovementAnimationPosition(animation: UnitMovementAnimation, progress: number): UnitMovementFrame {
  const clamped = Math.max(0, Math.min(1, progress));
  const steps = Math.max(1, animation.renderPath.length - 1);

  // Map overall progress to a step index + intra-step fraction
  const rawStepProgress = clamped * steps;
  const stepIndex = Math.min(steps - 1, Math.floor(rawStepProgress));
  const stepFraction = rawStepProgress - stepIndex;

  // Ease-in-out applied per segment so each hex traversal feels weighted
  const segEased = easeInOut(stepFraction);

  const segFrom = animation.renderPath[stepIndex]!;
  const segTo = animation.renderPath[stepIndex + 1]!;

  return {
    coord: {
      q: segFrom.q + (segTo.q - segFrom.q) * segEased,
      r: segFrom.r + (segTo.r - segFrom.r) * segEased,
    },
    motion: Math.floor(rawStepProgress * 6) % 2 === 0 ? 'move-a' : 'move-b',
  };
}

export function getMovingUnitIds(animations: UnitMovementAnimation[]): Set<string> {
  return new Set(animations.map(animation => animation.unit.id));
}
