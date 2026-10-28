/**
 * Commercial passage permissions (#1499 MR02).
 *
 * The single authority for "may this civilization run commerce into that one's endpoints and
 * territory?". Commercial passage is deliberately separate from military movement: a trade
 * agreement grants commerce and never `open_borders`.
 *
 * Permission is **derived** from canonical owners rather than mirrored into a second record, so war,
 * embargo, elimination and explicit revocation update it by construction:
 *   - the agreement itself is the `trade_agreement` treaty (`diplomacy-treaties.ts`),
 *   - war is `diplomacy-queries`/`minor-civ-diplomacy`,
 *   - embargoes are `state.embargoes` (`diplomacy-embargoes.ts`),
 *   - elimination is "the partner holds no territory" (`city-capture-system`).
 *
 * Minor civilizations do **not** use a major-civian treaty: they keep their own contact/relationship
 * model through the explicit adapter branch below, so minor-civ trade quests are never locked behind
 * a treaty action minors cannot sign.
 */
import type { GameState } from '@/core/types';
import type {
  CommercePermissionsState,
  CommerceResourceExportGrant,
  CommerceResourcePolicy,
  CommerceRouteAllowance,
} from '@/core/types/commerce';
import {
  RESOURCE_BACKED_GOODS,
  findTradeGood,
  type TradeGoodDefinition,
} from './trade-good-definitions';
import type { ResourceType } from '@/core/types/resources';
import { hasTreatyBetween, isAtWar } from '@/systems/diplomacy-queries';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';

/** Why commercial passage was refused. Copy names no civilization. */
export type CommercePassageDenialReason =
  | 'no-commercial-agreement'
  | 'at-war'
  | 'embargoed'
  | 'partner-eliminated'
  | 'minor-civ-unavailable';

export const COMMERCE_PASSAGE_DENIAL_MESSAGES: Record<CommercePassageDenialReason, string> = {
  'no-commercial-agreement': 'Requires a trade agreement with that civilization.',
  'at-war': 'Cannot trade with a civilization you are at war with.',
  'embargoed': 'An embargo blocks trade with that civilization.',
  'partner-eliminated': 'That civilization no longer holds territory.',
  'minor-civ-unavailable': 'That city-state is not open to trade right now.',
};

export type CommercePassageDecision =
  | { allowed: true }
  | { allowed: false; reason: CommercePassageDenialReason };

export function createCommercePermissionsState(): CommercePermissionsState {
  return { resourceExportGrants: [], routeAllowances: [] };
}

function permissionsOf(state: GameState): CommercePermissionsState {
  return state.commercePermissions ?? createCommercePermissionsState();
}

// --- Good-keyed seller policies (#1508 MR11) ---

export function getCommerceResourcePolicies(state: GameState, civId: string): CommerceResourcePolicy[] {
  return (permissionsOf(state).resourcePolicies ?? []).filter(policy => policy.civId === civId);
}

export function getCommerceResourcePolicy(
  state: GameState,
  civId: string,
  goodId: string,
): CommerceResourcePolicy | undefined {
  return (permissionsOf(state).resourcePolicies ?? [])
    .find(policy => policy.civId === civId && policy.goodId === goodId);
}

/**
 * Replaces one seller's good-keyed policy. The protected reserve and tariff are validated here so
 * every later quote can trust the persisted numbers; an unknown good is a programming error, not a
 * silently ignored offer.
 */
export function setCommerceResourcePolicy(
  state: GameState,
  policy: CommerceResourcePolicy,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): GameState {
  if (!findTradeGood(policy.goodId, definitions)) {
    throw new Error(`Unknown trade good "${policy.goodId}" for a market policy.`);
  }
  if (!Number.isSafeInteger(policy.protectedReserve) || policy.protectedReserve < 0) {
    throw new Error('A protected reserve must be a nonnegative safe integer.');
  }
  const tariff = policy.tariffPerUnit ?? 0;
  if (!Number.isSafeInteger(tariff) || tariff < 0) {
    throw new Error('A tariff must be a nonnegative safe integer.');
  }
  if (tariff > 0 && !policy.tariffRecipientCivId) {
    throw new Error('A positive tariff needs a named recipient.');
  }
  if (policy.tariffRecipientCivId && !state.civilizations[policy.tariffRecipientCivId]) {
    throw new Error(`Unknown tariff recipient "${policy.tariffRecipientCivId}".`);
  }
  const serviceAllotments = policy.serviceAllotments ?? 0;
  if (!Number.isSafeInteger(serviceAllotments) || serviceAllotments < 0) {
    throw new Error('A service allotment must be a nonnegative safe integer.');
  }
  const partners = [...new Set(policy.partnerCivIds)]
    .filter(partner => partner !== policy.civId)
    .sort();
  const normalized: CommerceResourcePolicy = {
    civId: policy.civId,
    goodId: policy.goodId,
    protectedReserve: policy.protectedReserve,
    partnerCivIds: partners,
    ...(tariff > 0 ? { tariffPerUnit: tariff } : {}),
    ...(policy.tariffRecipientCivId ? { tariffRecipientCivId: policy.tariffRecipientCivId } : {}),
    ...(serviceAllotments > 0 ? { serviceAllotments } : {}),
  };
  const permissions = permissionsOf(state);
  const remaining = (permissions.resourcePolicies ?? [])
    .filter(candidate => !(candidate.civId === policy.civId && candidate.goodId === policy.goodId));
  return {
    ...state,
    commercePermissions: {
      ...permissions,
      resourcePolicies: [...remaining, normalized],
    },
  };
}

/** True while `civId` still holds at least one city; a civ with none has been eliminated. */
function holdsTerritory(state: GameState, civId: string): boolean {
  return Object.values(state.cities).some(city => city.owner === civId);
}

function isEmbargoedBetween(state: GameState, civA: string, civB: string): boolean {
  return (state.embargoes ?? []).some(embargo =>
    (embargo.targetCivId === civB && embargo.participants.includes(civA))
    || (embargo.targetCivId === civA && embargo.participants.includes(civB)),
  );
}

/**
 * May `fromCivId` run commerce — a trade route and its endpoints/transit — into `toCivId`?
 *
 * A signed `trade_agreement` between the two major civilizations is the commercial permission.
 * `open_borders` is a military arrangement and confers nothing here.
 */
export function getCommercialPassagePermission(
  state: GameState,
  fromCivId: string,
  toCivId: string,
): CommercePassageDecision {
  if (fromCivId === toCivId) return { allowed: true };

  // --- Minor-civilization adapter: their own contact/relationship model, never a major-civ treaty.
  const minor = state.minorCivs?.[toCivId];
  if (minor) {
    if (isMinorCivAtWar(state, fromCivId, toCivId)) return { allowed: false, reason: 'at-war' };
    const minorRelationship = minor.diplomacy.relationships[fromCivId] ?? 0;
    if (minorRelationship < 0) return { allowed: false, reason: 'minor-civ-unavailable' };
    return { allowed: true };
  }

  // --- Major civilizations.
  if (!holdsTerritory(state, toCivId)) return { allowed: false, reason: 'partner-eliminated' };

  const fromDiplomacy = state.civilizations[fromCivId]?.diplomacy;
  const toDiplomacy = state.civilizations[toCivId]?.diplomacy;
  if (
    (fromDiplomacy && isAtWar(fromDiplomacy, toCivId))
    || (toDiplomacy && isAtWar(toDiplomacy, fromCivId))
  ) {
    return { allowed: false, reason: 'at-war' };
  }

  if (isEmbargoedBetween(state, fromCivId, toCivId)) return { allowed: false, reason: 'embargoed' };

  if (!hasTreatyBetween(state, fromCivId, toCivId, 'trade_agreement')) {
    return { allowed: false, reason: 'no-commercial-agreement' };
  }

  return { allowed: true };
}

// --- Directional strategic-resource export grants (data model; controls ship in MR12) ---

export function getResourceExportGrants(state: GameState, grantorCivId: string): CommerceResourceExportGrant[] {
  return permissionsOf(state).resourceExportGrants.filter(grant => grant.grantorCivId === grantorCivId);
}

export function hasResourceExportGrant(
  state: GameState,
  grantorCivId: string,
  granteeCivId: string,
  resource: ResourceType,
): boolean {
  return permissionsOf(state).resourceExportGrants.some(grant =>
    grant.grantorCivId === grantorCivId
    && grant.granteeCivId === granteeCivId
    && grant.resource === resource,
  );
}

/**
 * Authorizes one directional grant of `resource` from `grantorCivId` to `granteeCivId`.
 * Strategic exports default closed; there is no UI for this in MR02.
 */
export function grantResourceExport(
  state: GameState,
  grantorCivId: string,
  granteeCivId: string,
  resource: ResourceType,
): GameState {
  if (grantorCivId === granteeCivId) return state;
  if (hasResourceExportGrant(state, grantorCivId, granteeCivId, resource)) return state;
  const permissions = permissionsOf(state);
  return {
    ...state,
    commercePermissions: {
      ...permissions,
      resourceExportGrants: [...permissions.resourceExportGrants, { grantorCivId, granteeCivId, resource }],
    },
  };
}

export function revokeResourceExport(
  state: GameState,
  grantorCivId: string,
  granteeCivId: string,
  resource: ResourceType,
): GameState {
  const permissions = permissionsOf(state);
  const remaining = permissions.resourceExportGrants.filter(grant =>
    !(grant.grantorCivId === grantorCivId && grant.granteeCivId === granteeCivId && grant.resource === resource));
  if (remaining.length === permissions.resourceExportGrants.length) return state;
  return { ...state, commercePermissions: { ...permissions, resourceExportGrants: remaining } };
}

// --- Legacy route-only transition allowances ---

/**
 * Records the one-time allowance that lets an assignment created before permissions existed finish
 * its current round trip. `routeTurns` is the route's committed journey length, so the allowance
 * covers exactly the trip it was already on.
 */
export function recordRouteOnlyAllowance(
  state: GameState,
  routeId: string,
  civId: string,
  routeTurns: number,
): GameState {
  const permissions = permissionsOf(state);
  if (permissions.routeAllowances.some(allowance => allowance.routeId === routeId)) return state;
  const allowance: CommerceRouteAllowance = {
    routeId,
    civId,
    grantedOnTurn: state.turn,
    expiresOnTurn: state.turn + Math.max(1, routeTurns),
  };
  return {
    ...state,
    commercePermissions: { ...permissions, routeAllowances: [...permissions.routeAllowances, allowance] },
  };
}

export function hasRouteOnlyAllowance(state: GameState, routeId: string, civId: string): boolean {
  return permissionsOf(state).routeAllowances.some(allowance =>
    allowance.routeId === routeId && allowance.civId === civId && state.turn < allowance.expiresOnTurn);
}

/** Drops every allowance whose recorded boundary has passed. */
export function pruneExpiredRouteAllowances(state: GameState): GameState {
  const permissions = state.commercePermissions;
  if (!permissions || permissions.routeAllowances.length === 0) return state;
  const kept = permissions.routeAllowances.filter(allowance => state.turn < allowance.expiresOnTurn);
  if (kept.length === permissions.routeAllowances.length) return state;
  return { ...state, commercePermissions: { ...permissions, routeAllowances: kept } };
}
