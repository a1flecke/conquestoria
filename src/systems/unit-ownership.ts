import type { GameState, Unit } from '@/core/types';

/**
 * Canonical owned-unit resolution (#1020).
 *
 * `unit.owner` is authoritative for ownership. Unit rosters — a major civ's
 * `civ.units` and a minor civ's `minorCiv.units` — are denormalized indexes.
 * They remain legitimate for owner-local iteration and lifecycle bookkeeping,
 * and `assertUnitRosters` (`tests/helpers/save-state-invariants.ts`) proves they
 * stay in sync; but a caller asking the semantic question "which live units does
 * owner X actually own?" must resolve it from `state.units`, because a roster
 * can be stale (missing an entry), carry a ghost id, or list a unit now owned by
 * someone else.
 *
 * Works for every owner kind — the seven `classifyOwner` kinds plus rosterless
 * world actors (`barbarian`, `pirate`, `beasts`, `rebels`, `crisis-force`) —
 * without requiring the owner to have a civilization record or a roster. No fake
 * civ or roster is manufactured for rosterless owners; the query simply scans
 * authoritative owner state.
 */
export function getOwnedUnits(
  state: { readonly units: GameState['units'] },
  ownerId: string,
): readonly Unit[] {
  return Object.values(state.units ?? {}).filter(unit => unit.owner === ownerId);
}

/**
 * Count of live units owned by `ownerId`. Equivalent to
 * `getOwnedUnits(...).length` but avoids allocating an intermediate array.
 * Ignores rosters entirely, so it cannot be inflated by a ghost or duplicate
 * roster entry.
 */
export function getOwnedUnitCount(
  state: { readonly units: GameState['units'] },
  ownerId: string,
): number {
  let count = 0;
  for (const unit of Object.values(state.units ?? {})) {
    if (unit.owner === ownerId) count += 1;
  }
  return count;
}

/**
 * Owned units that are not currently loaded as a naval transport's cargo.
 *
 * A loaded cargo unit is still alive and still owned (and still in its owner's
 * roster), so it appears in `getOwnedUnits`, but it does not occupy the map
 * independently and must not be treated as a separate map presence. Promoting
 * the former private `getCivUnits` in `unit-movement-system.ts` into this named
 * concept.
 *
 * Air-basing is a *separate* map-presence distinction (`unit.airBase`); it is
 * deliberately not folded into "free-standing" — see `isUnitAwaitingOrders` and
 * `isBasedAirUnit` for that question.
 */
export function getFreeStandingOwnedUnits(
  state: { readonly units: GameState['units'] },
  ownerId: string,
): readonly Unit[] {
  return getOwnedUnits(state, ownerId).filter(unit => !unit.transportId);
}
