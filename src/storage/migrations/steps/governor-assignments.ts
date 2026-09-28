import type { GameState } from '@/core/types';

/**
 * Schema 32 (#928) — governors added `governorAssignments` /
 * `governorAssignmentChangedTurn` to `Civilization`.
 *
 * CORRUPTION REPAIR, not a real versioning step, mirroring migration 31's
 * governance-policy precedent (itself mirroring migration 25's federalism
 * precedent) exactly: both fields are optional and absent already means "no
 * governors" everywhere they are read, so this is a no-op for every save the
 * game itself wrote. It exists purely to scrub a malformed hand-edited value
 * (a non-true `governorAssignments` value, or a non-integer/negative
 * changed-turn) rather than let it silently corrupt the lock-turn arithmetic
 * or the capacity/load calculation. No assignment event or pressure-row
 * mutation fires on load. A stale assignment naming a city this civ no
 * longer owns is deliberately NOT scrubbed here — every reader already
 * filters to `state.cities[id]?.owner === civId` (see governance-capacity.ts
 * and faction-system.ts), so it is already inert and self-heals without a
 * migration needing to know about capture/raze at all.
 */
export function repairGovernorAssignmentFields(state: GameState): GameState {
  let changedAny = false;
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => {
    let assignments: typeof civ.governorAssignments;
    if (civ.governorAssignments !== undefined) {
      const cleaned = Object.fromEntries(
        Object.entries(civ.governorAssignments).filter(([, assigned]) => assigned === true),
      );
      assignments = Object.keys(cleaned).length > 0 ? (cleaned as typeof civ.governorAssignments) : undefined;
    } else {
      assignments = undefined;
    }

    let changedTurns: typeof civ.governorAssignmentChangedTurn;
    if (civ.governorAssignmentChangedTurn !== undefined) {
      const cleaned = Object.fromEntries(
        Object.entries(civ.governorAssignmentChangedTurn).filter(
          ([, turn]) => Number.isInteger(turn) && (turn as number) >= 0,
        ),
      );
      changedTurns = Object.keys(cleaned).length > 0 ? (cleaned as typeof civ.governorAssignmentChangedTurn) : undefined;
    } else {
      changedTurns = undefined;
    }

    if (assignments === civ.governorAssignments && changedTurns === civ.governorAssignmentChangedTurn) {
      return [civId, civ];
    }
    changedAny = true;
    return [civId, { ...civ, governorAssignments: assignments, governorAssignmentChangedTurn: changedTurns }];
  }));

  return changedAny ? { ...state, civilizations } : state;
}
