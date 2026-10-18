import type { ResourceType } from './resources';

/**
 * Persisted commerce state (#1499 MR02, `src/core/types/commerce.ts`).
 *
 * Declared in this leaf rather than the `src/core/types.ts` compatibility barrel, which is
 * shrink-only (#1361).
 *
 * Both lists are plain data:
 * - `resourceExportGrants` are directional seller→buyer grants of one strategic resource. MR02 adds
 *   only the data model and its writers/queries; the player controls ship with cargo purchases in
 *   MR12, so nothing here is advertised in the UI yet.
 * - `routeAllowances` are the recorded route-only transition allowances for trade assignments that
 *   predate the permission model. Each covers exactly one route id and expires at a recorded turn
 *   boundary; it authorizes neither a new assignment nor a resource purchase.
 */
export interface CommerceResourceExportGrant {
  /** The civilization that may export the resource. */
  grantorCivId: string;
  /** The civilization allowed to receive it. */
  granteeCivId: string;
  resource: ResourceType;
}

export interface CommerceRouteAllowance {
  /** The single route this allowance covers. A different route id is never covered. */
  routeId: string;
  /** The route owner the allowance was recorded for (hot-seat safe). */
  civId: string;
  grantedOnTurn: number;
  /** The allowance stops granting commerce once `state.turn >= expiresOnTurn`. */
  expiresOnTurn: number;
}

export interface CommercePermissionsState {
  resourceExportGrants: CommerceResourceExportGrant[];
  routeAllowances: CommerceRouteAllowance[];
}
