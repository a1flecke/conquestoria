import type { GameState, HexCoord, Unit } from '@/core/types';
import { getVisibility } from './fog-of-war';
import { hexKey } from './hex-utils';
import { getZoneOfControlAt } from './zone-of-control-system';
import { isUnitConcealedFrom } from './concealment';
import { resolveUnitMoveIntent, type MovementRejection } from './unit-movement-validation';
import type { MovementBlockerReason } from './unit-movement-queries';

/**
 * The player-facing "why can't I move there?" answer (#1025 MR4, made path-aware by #1002).
 *
 * This is the **viewer-scoped projection** of `resolveUnitMoveIntent`, which is deliberately
 * omniscient. It owns NO legality of its own: resolve → (if refused) re-resolve the SAME
 * canonical resolver over the viewer's knowledge → explain only from that.
 *
 * It lives in its own module rather than `unit-movement-queries.ts` because it depends on
 * `unit-movement-validation.ts`, whose transitive deps (`unit-occupancy` →
 * `air-operations-system` → the `unit-system` barrel) would form an import cycle if this were
 * re-exported through that barrel. The `src/input` call sites and its tests import it from
 * here directly.
 */

const TOO_FAR: MovementBlockerReason = { code: 'unexplored', message: 'Too far away to spot.' };

/**
 * #1002: the canonical resolver refused (or would stop) the move for a reason the viewer
 * cannot see — an unseen unit, a concealed unit, or an unseen Zone-of-Control source. The
 * refusal itself is unavoidable (legality is canonical); *what* and *where* are not revealed.
 */
export const HIDDEN_OBSTACLE: MovementBlockerReason = {
  code: 'hidden-obstacle',
  message: 'Something out of sight is in the way.',
};

/**
 * The world as the viewer knows it, for EXPLANATION ONLY — never for legality, execution or AI.
 *
 * - Foreign units survive only on a tile the viewer currently sees, and only when not concealed
 *   from the viewer (`isUnitConcealedFrom`). Units are never remembered in fog.
 * - Cities, barbarian camps and pirate-enclave anchors survive on any **explored** tile — the
 *   same "discovered once explored" rule `hasDiscoveredCity` uses — so a remembered structure in
 *   fog stays explained, and one on an unexplored tile never is.
 * - Terrain is left untouched: fog/unexplored terrain is not re-derived (see the `unreachable`
 *   residue documented in `.claude/rules/movement-actions.md`).
 *
 * Re-running the canonical resolver over this projection keeps ONE legality implementation;
 * this function only decides which facts the viewer is entitled to.
 */
export function projectMovementKnowledgeForViewer(state: GameState, viewerId: string): GameState {
  const visibility = state.civilizations[viewerId]?.visibility;
  const visibilityAt = (coord: HexCoord) => (visibility ? getVisibility(visibility, coord) : 'unexplored');
  const explored = (coord: HexCoord) => visibilityAt(coord) !== 'unexplored';

  const units: GameState['units'] = {};
  for (const [id, unit] of Object.entries(state.units)) {
    if (
      unit.owner === viewerId
      || (visibilityAt(unit.position) === 'visible' && !isUnitConcealedFrom(state, unit, viewerId))
    ) {
      units[id] = unit;
    }
  }

  const cities: GameState['cities'] = {};
  for (const [id, city] of Object.entries(state.cities)) {
    if (city.owner === viewerId || explored(city.position)) cities[id] = city;
  }

  const barbarianCamps: GameState['barbarianCamps'] = {};
  for (const [id, camp] of Object.entries(state.barbarianCamps ?? {})) {
    if (explored(camp.position)) barbarianCamps[id] = camp;
  }

  let pirates = state.pirates;
  if (pirates?.factions) {
    const factions: typeof pirates.factions = {};
    for (const [id, faction] of Object.entries(pirates.factions)) {
      if (faction.headquarters.kind !== 'coastal-enclave' || explored(faction.headquarters.position)) {
        factions[id] = faction;
      }
    }
    pirates = { ...pirates, factions };
  }

  return { ...state, units, cities, barbarianCamps, ...(pirates ? { pirates } : {}) };
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

const ZONE_OF_CONTROL: MovementBlockerReason = {
  code: 'zone-of-control',
  message: 'An enemy nearby would stop your unit before it reaches that tile.',
};

function stopsShortOfDestination(state: GameState, unit: Unit, path: HexCoord[], destination: HexCoord): boolean {
  const stop = findZoneOfControlStop(state, unit, path);
  return stop !== null && hexKey(stop) !== hexKey(destination);
}

/**
 * The ONE viewer-scoping rule for movement explanations (#1025 MR4, path-aware since #1002).
 *
 * Given that the canonical resolver refused the move (`rejection`) or would stop it short
 * (`rejection === 'zone-of-control'`), answer using only facts `viewerId` has earned:
 *
 * 1. destination unexplored → "Too far away to spot." (unchanged from #1025 MR4);
 * 2. otherwise re-resolve over `projectMovementKnowledgeForViewer`:
 *    - still refused → that viewer-knowable reason (it can only name facts the viewer has);
 *    - legal as far as the viewer knows, but stopped by a ZoC source the viewer can see →
 *      the ZoC copy;
 *    - legal as far as the viewer knows, and nothing visible explains it → `HIDDEN_OBSTACLE`.
 *
 * Every player-facing movement refusal — the tap explainer AND the executor-failure toast —
 * must pass through here. Never show `MovementRejection.message` directly.
 */
export function presentMovementRejectionForViewer(
  state: GameState,
  unitId: string,
  to: HexCoord,
  viewerId: string,
): MovementBlockerReason | null {
  const unit = state.units[unitId];
  if (!unit) return null;
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility || getVisibility(visibility, to) === 'unexplored') return TOO_FAR;

  const known = projectMovementKnowledgeForViewer(state, viewerId);
  const knownResolution = resolveUnitMoveIntent(known, unitId, to, { actor: 'player', civId: unit.owner });
  if (!knownResolution.ok) {
    if (knownResolution.reason === 'missing-unit') return null;
    return { code: knownResolution.reason, message: knownResolution.message };
  }
  const { path, to: destination } = knownResolution.command;
  if (stopsShortOfDestination(known, unit, path, destination)) return ZONE_OF_CONTROL;
  return HIDDEN_OBSTACLE;
}

/**
 * Why can this unit not move to `to` — the viewer-scoped answer, or `null` when the move is
 * legal and uninterrupted.
 *
 * Owner-scoped, never viewer-scoped, for legality: `civId` is always `unit.owner`, so hot-seat
 * viewing cannot change what a unit may do. The explanation is scoped to the same owner (the only
 * player who can order this unit), reading that civ's own visibility — callers cannot pass a
 * partial or foreign visibility.
 */
export function getMovementBlockerReason(
  state: GameState,
  unitId: string,
  to: HexCoord,
): MovementBlockerReason | null {
  const unit = state.units[unitId];
  if (!unit) return null;

  const resolution = resolveUnitMoveIntent(state, unitId, to, {
    actor: 'player',
    civId: unit.owner,
  });

  if (!resolution.ok) {
    if (resolution.reason === 'missing-unit') return null;
    return presentMovementRejectionForViewer(state, unitId, to, unit.owner);
  }

  if (stopsShortOfDestination(state, unit, resolution.command.path, resolution.command.to)) {
    return presentMovementRejectionForViewer(state, unitId, to, unit.owner);
  }

  return null;
}

/**
 * The executor-failure counterpart (#1002 sibling fix): a move that reached the executor and was
 * refused. Explains it exactly like the tap preview; never echoes the raw resolver message.
 */
export function explainMovementFailureForViewer(
  state: GameState,
  unitId: string,
  failure: Pick<MovementRejection, 'to'>,
): string {
  const unit = state.units[unitId];
  if (!unit) return HIDDEN_OBSTACLE.message;
  return (presentMovementRejectionForViewer(state, unitId, failure.to, unit.owner) ?? HIDDEN_OBSTACLE).message;
}
