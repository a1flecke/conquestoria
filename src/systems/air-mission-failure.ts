import { AIR_MISSION_DENIAL_MESSAGES, type AirMissionDenialReason } from './air-readiness';

/**
 * Why an air mission or air-base command was refused (#1223). Closed string unions plus an exhaustive copy map:
 * a typo is a compile error, a new reason cannot ship without player copy, and no caller compares free strings.
 *
 * Two unions because two executor families fail differently, and the compiler should know which reasons each can
 * produce: a recon/patrol/rebase/intercept/basing command can never report `out-of-range`, and a strike can never
 * report `invalid-destination`. `AirMissionFailureReason` is their union and is the key of the copy map.
 *
 * Readiness reasons (#884) are composed in, not restated: `AirMissionDenialReason` and its copy stay owned by
 * `air-readiness.ts`, and this module re-uses that copy verbatim.
 *
 * Every reason is about the acting player's own aircraft or about geometry. None names an interceptor, an air
 * defence, an enemy base or readiness, or private tech, and a strike at a hex holding something the player cannot
 * see fails with exactly the reason an empty hex does (`invalid-strike-target`) -- see the hidden-state tests.
 */

/** Why an aircraft could not be based (production completion, upgrade). Also what `canCompleteAirUnitProduction` reports. */
export type AirBaseFailureReason = 'not-based-aircraft' | 'base-missing' | 'incompatible-base' | 'base-full';

/** Basing, rebase, intercept stance, recon and patrol. */
export type AirOperationFailureReason =
  | AirBaseFailureReason
  | 'missing-unit'
  | 'already-acted'
  | 'invalid-destination'
  | 'ineligible-interceptor'
  | 'invalid-recon-target'
  | 'invalid-patrol-target';

/** Air strikes, including the readiness gate. */
export type AirStrikeFailureReason =
  | AirMissionDenialReason
  | 'ineligible-strike'
  | 'already-acted'
  | 'out-of-range'
  | 'invalid-strike-target'
  | 'missing-target';

export type AirMissionFailureReason = AirOperationFailureReason | AirStrikeFailureReason;

// A target that is gone and a target that was never legal share one explanation on purpose: telling them apart
// would tell the player whether something unseen stands there.
const STRIKE_TARGET_NOT_LEGAL = 'That target is not a legal strike target right now.';

export const AIR_MISSION_FAILURE_MESSAGES: Record<AirMissionFailureReason, string> = {
  'not-based-aircraft': 'This unit is not an aircraft that flies from an air base.',
  'base-missing': 'That air base no longer exists.',
  'incompatible-base': 'That base cannot host this kind of aircraft.',
  'base-full': 'That base has no free slot for another aircraft.',
  'missing-unit': 'That aircraft is no longer available.',
  'already-acted': 'This aircraft has already flown this turn.',
  'invalid-destination': 'That base is no longer reachable by this aircraft.',
  'ineligible-interceptor': 'This aircraft cannot take an intercept stance right now.',
  'invalid-recon-target': 'That is not a legal recon target for this aircraft right now.',
  'invalid-patrol-target': 'That is not a legal patrol center for this aircraft right now.',
  'ineligible-strike': 'This unit cannot fly a strike mission right now.',
  'out-of-range': "That target is outside this aircraft's operational range.",
  'invalid-strike-target': STRIKE_TARGET_NOT_LEGAL,
  'missing-target': STRIKE_TARGET_NOT_LEGAL,
  spent: AIR_MISSION_DENIAL_MESSAGES.spent,
  'carrier-depleted': AIR_MISSION_DENIAL_MESSAGES['carrier-depleted'],
};
