import { describe, it, expect } from 'vitest';
import {
  assignGovernor, removeGovernor, moveGovernor, isCityGoverned,
  canToggleGovernor, getGovernorLockedUntilTurn, GOVERNOR_REASSIGNMENT_LOCK_TURNS, GOVERNOR_UNREST_RELIEF,
} from '@/systems/governor-system';
import { getGovernanceLoad, GOVERNOR_LOAD_COST } from '@/systems/governance-capacity';
import { getUnrestPressureBreakdown } from '@/systems/faction-system';
import { makeGovernanceTestState } from './helpers/governance-fixture';

describe('#928 governor system', () => {
  it('assigns a governor to an owned city and adds its relief row', () => {
    const state = makeGovernanceTestState();
    expect(isCityGoverned(state, 'city-1')).toBe(false);
    const result = assignGovernor(state, 'player', 'city-1');
    expect(result.success).toBe(true);
    expect(isCityGoverned(result.state, 'city-1')).toBe(true);
    expect(getUnrestPressureBreakdown('city-1', result.state)).toContainEqual({ label: 'Governor', amount: -GOVERNOR_UNREST_RELIEF });
  });

  it('rejects assigning to a city the civ does not own', () => {
    const state = makeGovernanceTestState();
    const result = assignGovernor(state, 'ghost-civ', 'city-1');
    expect(result.success).toBe(false);
  });

  it('rejects assigning to an already-governed city', () => {
    const state = makeGovernanceTestState();
    const first = assignGovernor(state, 'player', 'city-1');
    expect(first.success).toBe(true);
    const second = assignGovernor(first.state, 'player', 'city-1');
    expect(second.success).toBe(false);
    expect(second.message).toMatch(/already/i);
  });

  it('rejects removing an ungoverned city', () => {
    const state = makeGovernanceTestState();
    const result = removeGovernor(state, 'player', 'city-1');
    expect(result.success).toBe(false);
  });

  it('removing a governor clears its relief row', () => {
    const state = makeGovernanceTestState();
    const assigned = assignGovernor(state, 'player', 'city-1');
    const unlocked = { ...assigned.state, turn: getGovernorLockedUntilTurn(assigned.state, 'player', 'city-1') };
    const removed = removeGovernor(unlocked, 'player', 'city-1');
    expect(removed.success).toBe(true);
    expect(isCityGoverned(removed.state, 'city-1')).toBe(false);
    expect(getUnrestPressureBreakdown('city-1', removed.state)).not.toContainEqual({ label: 'Governor', amount: -GOVERNOR_UNREST_RELIEF });
  });

  it('consumes GOVERNOR_LOAD_COST governance load once assigned', () => {
    const state = makeGovernanceTestState();
    const assigned = assignGovernor(state, 'player', 'city-1');
    const load = getGovernanceLoad(assigned.state, 'player');
    expect(load.byGovernor['city-1']).toBe(GOVERNOR_LOAD_COST);
    expect(load.total).toBe(GOVERNOR_LOAD_COST);
  });

  it('rejects assignment that would exceed governance capacity', () => {
    // 1 city, capacity 3 (base only). Two governors would need 4 load > 3.
    const state = makeGovernanceTestState({ cityCount: 2 });
    const first = assignGovernor(state, 'player', 'city-1');
    expect(first.success).toBe(true);
    const second = assignGovernor(first.state, 'player', 'city-2');
    expect(second.success).toBe(false);
    expect(second.message).toMatch(/capacity/i);
  });

  it('locks a city for GOVERNOR_REASSIGNMENT_LOCK_TURNS turns after assign, blocking an immediate removal', () => {
    const state = makeGovernanceTestState();
    const assigned = assignGovernor(state, 'player', 'city-1');
    expect(canToggleGovernor(assigned.state, 'player', 'city-1')).toBe(false);
    const removeAttempt = removeGovernor(assigned.state, 'player', 'city-1');
    expect(removeAttempt.success).toBe(false);

    const lockedUntil = getGovernorLockedUntilTurn(assigned.state, 'player', 'city-1');
    expect(lockedUntil).toBe(assigned.state.turn + GOVERNOR_REASSIGNMENT_LOCK_TURNS);
    const unlocked = { ...assigned.state, turn: lockedUntil };
    expect(canToggleGovernor(unlocked, 'player', 'city-1')).toBe(true);
    expect(removeGovernor(unlocked, 'player', 'city-1').success).toBe(true);
  });

  it('locks the target city too, independent of the source city\'s own lock', () => {
    const state = makeGovernanceTestState({ cityCount: 3 });
    const assigned = assignGovernor(state, 'player', 'city-1');
    const lockedUntil = getGovernorLockedUntilTurn(assigned.state, 'player', 'city-1');
    const afterLock = { ...assigned.state, turn: lockedUntil };
    // city-2 was never touched, so it is not locked even though city-1 was.
    expect(canToggleGovernor(afterLock, 'player', 'city-2')).toBe(true);
  });

  describe('moveGovernor', () => {
    it('moves a governor from one owned city to another', () => {
      const state = makeGovernanceTestState({ cityCount: 2 });
      const assigned = assignGovernor(state, 'player', 'city-1');
      const lockedUntil = getGovernorLockedUntilTurn(assigned.state, 'player', 'city-1');
      const unlocked = { ...assigned.state, turn: lockedUntil };
      const moved = moveGovernor(unlocked, 'player', 'city-1', 'city-2');
      expect(moved.success).toBe(true);
      expect(isCityGoverned(moved.state, 'city-1')).toBe(false);
      expect(isCityGoverned(moved.state, 'city-2')).toBe(true);
    });

    it('rolls back to the original state if the source city is still locked', () => {
      const state = makeGovernanceTestState({ cityCount: 2 });
      const assigned = assignGovernor(state, 'player', 'city-1');
      // still locked immediately after assigning
      const moved = moveGovernor(assigned.state, 'player', 'city-1', 'city-2');
      expect(moved.success).toBe(false);
      expect(moved.state).toBe(assigned.state);
      expect(isCityGoverned(moved.state, 'city-1')).toBe(true);
    });

    it('rolls back to the original state (not a bare removal) if the destination cannot accept it', () => {
      // 3 cities -> capacity 4 (base 3 + floor(3/3)=1 posture bonus), enough
      // for two governors (2 each). Assign both city-1 and city-2, unlock
      // both, then try to move city-1's governor into city-2 -- which
      // already has one, so the assign half must fail and the remove half
      // must be rolled back rather than leaving city-1 ungoverned for free.
      const state = makeGovernanceTestState({ cityCount: 3 });
      const assignedOne = assignGovernor(state, 'player', 'city-1');
      const unlockedOne = { ...assignedOne.state, turn: getGovernorLockedUntilTurn(assignedOne.state, 'player', 'city-1') };
      const assignedTwo = assignGovernor(unlockedOne, 'player', 'city-2');
      expect(assignedTwo.success).toBe(true);
      const bothUnlocked = { ...assignedTwo.state, turn: getGovernorLockedUntilTurn(assignedTwo.state, 'player', 'city-2') };

      const moved = moveGovernor(bothUnlocked, 'player', 'city-1', 'city-2');
      expect(moved.success).toBe(false);
      expect(moved.state).toBe(bothUnlocked);
      expect(isCityGoverned(moved.state, 'city-1')).toBe(true);
      expect(isCityGoverned(moved.state, 'city-2')).toBe(true);
    });
  });

  describe('capture self-healing (#928)', () => {
    it('a stale assignment for a city the civ no longer owns contributes no load and no relief row', () => {
      const state = makeGovernanceTestState({ cityCount: 1, civOverrides: { governorAssignments: { 'city-1': true } } });
      // Simulate capture: city-1 now belongs to someone else, but the former
      // owner's civ record still lists the stale assignment.
      const captured = { ...state, cities: { ...state.cities, 'city-1': { ...state.cities['city-1']!, owner: 'someone-else' } } };
      const load = getGovernanceLoad(captured, 'player');
      expect(load.byGovernor['city-1']).toBeUndefined();
      expect(load.total).toBe(0);
      // The relief row is scoped to city.owner's civ record, so the former
      // owner's stale entry never resolves for the captor either.
      expect(getUnrestPressureBreakdown('city-1', captured)).not.toContainEqual({ label: 'Governor', amount: -GOVERNOR_UNREST_RELIEF });
    });
  });
});
