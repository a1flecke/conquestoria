import type { GameState, HexCoord, Unit, VisibilityState } from '@/core/types';
import { hexKey } from './hex-utils';
import { getZoneOfControlAt } from './zone-of-control-system';
import { resolveUnitMoveIntent } from './unit-movement-validation';
import type { MovementBlockerReason } from './unit-movement-queries';

/**
 * The player-facing "why can't I move there?" answer (#1025 MR4).
 *
 * This is the **viewer-scoped projection** of `resolveUnitMoveIntent`, which is deliberately
 * omniscient. It owns NO legality of its own: resolve → project the typed rejection → redact.
 *
 * It lives in its own module rather than `unit-movement-queries.ts` because it depends on
 * `unit-movement-validation.ts`, whose transitive deps (`unit-occupancy` →
 * `air-operations-system` → the `unit-system` barrel) would form an import cycle if this were
 * re-exported through that barrel. The two `src/input` call sites and its tests import it from
 * here directly.
 */

/**
 * The ONE viewer-scoping rule for movement rejections (#1025 MR4 / #1002).
 * When the destination is unexplored to the viewer, every reason collapses to the generic one.
 *
 * Known limitation (owned by #1002): keys off the DESTINATION only. If the destination is
 * explored but a path tile is not, the reason can still describe that unexplored tile. Making
 * redaction path-aware is out of scope here — do not widen the leak, do not silently fix it.
 */
export function redactMovementRejectionForViewer(
  reason: MovementBlockerReason,
  visibilityState: VisibilityState | undefined,
): MovementBlockerReason {
  if (visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }
  return reason;
}

/**
 * The first tile on `path` (excluding the start) whose *entry* is Zone-of-Control limited,
 * or `null`. `moveUnitWithZoneOfControl` stops a unit immediately after entering such a tile,
 * so if this is not the destination the executor will stop the unit short.
 *
 * Derived from the executor's own predicate (`getZoneOfControlAt`) rather than re-deriving the
 * rule — the same "precomputation derived from the canonical rule" pattern
 * `getBlockingMapEntityKeys` uses. `getZoneOfControlAt` reads only the mover's type/owner and
 * the destination's neighbours, never the mover's position, so passing the unmoved unit for
 * every step gives the executor's answer.
 */
export function findZoneOfControlStop(
  state: GameState,
  unit: Unit,
  path: HexCoord[],
): HexCoord | null {
  for (const step of path.slice(1)) {
    if (getZoneOfControlAt(state, unit, step).limited) return step;
  }
  return null;
}

/**
 * Why can this unit not move to `to` — the viewer-scoped answer.
 *
 * Owner-scoped, never viewer-scoped, for legality: `civId` is always `unit.owner`, so hot-seat
 * viewing cannot change what a unit may do.
 */
export function getMovementBlockerReason(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  const unit = state.units[unitId];
  if (!unit) return null;

  const resolution = resolveUnitMoveIntent(state, unitId, to, {
    actor: 'player',
    civId: unit.owner,
  });

  if (!resolution.ok) {
    if (resolution.reason === 'missing-unit') return null;
    return redactMovementRejectionForViewer(
      { code: resolution.reason, message: resolution.message },
      options.visibilityState,
    );
  }

  const stop = findZoneOfControlStop(state, unit, resolution.command.path);
  const destination = resolution.command.to;
  if (stop && hexKey(stop) !== hexKey(destination)) {
    return redactMovementRejectionForViewer(
      {
        code: 'zone-of-control',
        message: 'An enemy nearby would stop your unit before it reaches that tile.',
      },
      options.visibilityState,
    );
  }

  return null;
}
