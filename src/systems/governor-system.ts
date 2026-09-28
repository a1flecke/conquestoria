import type { GameState } from '../core/types';
import { getGovernanceCapacity, getGovernanceLoad, GOVERNOR_LOAD_COST } from './governance-capacity';

/**
 * #928 — governors are an abstract, capped administrative slot, NOT a unit
 * and NOT a dynasty/great-person character (both explicitly out of scope per
 * this arc's own non-goals). "Capped set of assignable administrators" is
 * answered by spending #987's existing governance capacity/load resource --
 * per #928's own cross-link comment: "a governor assignment is a capacity
 * expenditure under a posture" -- rather than inventing a second, parallel
 * scarcity counter. A governor's per-city effect is a flat, attributable
 * unrest-relief row (GOVERNOR_UNREST_RELIEF), added generically inside
 * getUnrestPressureBreakdown (faction-system.ts), independent of the #927
 * ladder's own rows and formulas.
 */
export const GOVERNOR_UNREST_RELIEF = 6;

// Anti-thrash lock, both directions (assign and remove), same rationale as
// GOVERNANCE_POLICY_LOCK_TURNS and FEDERALISM_LOCK_TURNS: without it,
// reassigning a governor to whichever city is currently worst every turn
// would be a free, costless optimization -- the issue's own acceptance
// criterion is that placement is "a real decision", which requires some
// commitment cost to changing your mind.
export const GOVERNOR_REASSIGNMENT_LOCK_TURNS = 5;

export function isCityGoverned(state: GameState, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return state.civilizations[city.owner]?.governorAssignments?.[cityId] === true;
}

export function getGovernorLockedUntilTurn(state: GameState, civId: string, cityId: string): number {
  const changedTurn = state.civilizations[civId]?.governorAssignmentChangedTurn?.[cityId];
  return changedTurn === undefined ? -Infinity : changedTurn + GOVERNOR_REASSIGNMENT_LOCK_TURNS;
}

export function canToggleGovernor(state: GameState, civId: string, cityId: string): boolean {
  if (!state.civilizations[civId]) return false;
  return state.turn >= getGovernorLockedUntilTurn(state, civId, cityId);
}

export interface GovernorAssignmentResult {
  success: boolean;
  state: GameState;
  message: string;
}

export function assignGovernor(state: GameState, civId: string, cityId: string): GovernorAssignmentResult {
  const civ = state.civilizations[civId];
  if (!civ) return { success: false, state, message: 'Unknown civilization.' };
  const city = state.cities[cityId];
  if (!city || city.owner !== civId) {
    return { success: false, state, message: 'You do not own this city.' };
  }
  if (civ.governorAssignments?.[cityId] === true) {
    return { success: false, state, message: `${city.name} already has a governor.` };
  }
  if (!canToggleGovernor(state, civId, cityId)) {
    return {
      success: false, state,
      message: `${city.name} cannot receive a new governor until turn ${getGovernorLockedUntilTurn(state, civId, cityId)}.`,
    };
  }
  const capacity = getGovernanceCapacity(state, civId).total;
  const load = getGovernanceLoad(state, civId).total;
  if (load + GOVERNOR_LOAD_COST > capacity) {
    return {
      success: false, state,
      message: `Not enough governance capacity to assign a governor (needs ${GOVERNOR_LOAD_COST}, have ${Math.max(0, capacity - load)} free).`,
    };
  }
  return {
    success: true,
    message: `Governor assigned to ${city.name}.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: {
          ...civ,
          governorAssignments: { ...civ.governorAssignments, [cityId]: true },
          governorAssignmentChangedTurn: { ...civ.governorAssignmentChangedTurn, [cityId]: state.turn },
        },
      },
    },
  };
}

export function removeGovernor(state: GameState, civId: string, cityId: string): GovernorAssignmentResult {
  const civ = state.civilizations[civId];
  if (!civ) return { success: false, state, message: 'Unknown civilization.' };
  const city = state.cities[cityId];
  if (civ.governorAssignments?.[cityId] !== true) {
    return { success: false, state, message: city ? `${city.name} has no governor to remove.` : 'No governor to remove.' };
  }
  if (!canToggleGovernor(state, civId, cityId)) {
    return {
      success: false, state,
      message: `${city?.name ?? 'This city'}'s governor cannot be removed until turn ${getGovernorLockedUntilTurn(state, civId, cityId)}.`,
    };
  }
  const { [cityId]: _removed, ...remainingAssignments } = civ.governorAssignments;
  return {
    success: true,
    message: `Governor removed from ${city?.name ?? 'the city'}.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: {
          ...civ,
          governorAssignments: remainingAssignments,
          governorAssignmentChangedTurn: { ...civ.governorAssignmentChangedTurn, [cityId]: state.turn },
        },
      },
    },
  };
}

/**
 * Convenience composition, not a distinct mutation: remove then assign. Rolls
 * back to the pristine input `state` (not the post-removal intermediate) if
 * the assign half fails, so a failed move never leaks a bare, uncompensated
 * removal.
 */
export function moveGovernor(
  state: GameState,
  civId: string,
  fromCityId: string,
  toCityId: string,
): GovernorAssignmentResult {
  const removed = removeGovernor(state, civId, fromCityId);
  if (!removed.success) return removed;
  const assigned = assignGovernor(removed.state, civId, toCityId);
  if (!assigned.success) return { success: false, state, message: assigned.message };
  return assigned;
}
