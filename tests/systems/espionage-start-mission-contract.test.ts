import { describe, it, expect } from 'vitest';
import type { EspionageCivState, Spy, SpyMissionType } from '@/core/types';
import {
  createEspionageCivState,
  getMissionStartDenial,
  missionRequiresPlacedSpy,
  START_MISSION_FAILURE_MESSAGES,
  startMission,
} from '@/systems/espionage-system';
import type { StartMissionFailureReason } from '@/systems/espionage-system';

// #1222: startMission is a typed command, not a function that throws on stale state.

function makeSpy(id: string, overrides: Partial<Spy> = {}): Spy {
  return {
    id, owner: 'player', name: `Agent ${id}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
}

function withSpy(spy: Spy): EspionageCivState {
  const base = createEspionageCivState();
  return { ...base, spies: { ...base.spies, [spy.id]: spy } };
}

const STATIONED = { status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1' } as const;

describe('startMission typed contract (#1222)', () => {
  it('returns ok:true with the started mission for a legal command (previous semantics preserved)', () => {
    const state = withSpy(makeSpy('spy-1', STATIONED));

    const result = startMission(state, 'spy-1', 'gather_intel');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const spy = result.state.spies['spy-1'];
    expect(spy.status).toBe('on_mission');
    expect(spy.currentMission).toMatchObject({
      type: 'gather_intel', turnsRemaining: 3, turnsTotal: 3,
      targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
    });
  });

  it('refuses a missing spy with a typed reason and leaves state unchanged', () => {
    const state = withSpy(makeSpy('spy-1', STATIONED));

    const result = startMission(state, 'spy-gone', 'gather_intel');

    expect(result).toEqual({ ok: false, state, reason: 'spy-not-found' });
    expect(result.state).toBe(state);
  });

  it('refuses a placed-spy mission for a spy that is not stationed', () => {
    const state = withSpy(makeSpy('spy-1', { status: 'idle', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1' }));

    const result = startMission(state, 'spy-1', 'gather_intel');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('spy-not-stationed');
    expect(result.state).toBe(state);
  });

  it('refuses a remote mission for a spy that is already busy', () => {
    const state = withSpy(makeSpy('spy-1', { status: 'on_mission', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1' }));

    const result = startMission(state, 'spy-1', 'cyber_attack', undefined, 'ai-egypt', 'city-egypt-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('spy-unavailable');
    expect(result.state).toBe(state);
  });

  it('refuses a mission with no target civ or city', () => {
    const state = withSpy(makeSpy('spy-1'));

    const noTarget = startMission(state, 'spy-1', 'cyber_attack');
    const civOnly = startMission(state, 'spy-1', 'cyber_attack', undefined, 'ai-egypt');

    for (const result of [noTarget, civOnly]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('target-missing');
      expect(result.state).toBe(state);
    }
  });

  it('still starts a remote mission from an idle spy when a target is supplied', () => {
    const state = withSpy(makeSpy('spy-1'));

    const result = startMission(state, 'spy-1', 'cyber_attack', undefined, 'ai-egypt', 'city-egypt-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.spies['spy-1'].currentMission?.targetCityId).toBe('city-egypt-1');
  });

  it('gives every failure reason non-empty player copy', () => {
    const reasons = Object.keys(START_MISSION_FAILURE_MESSAGES) as StartMissionFailureReason[];
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(START_MISSION_FAILURE_MESSAGES[reason].trim().length).toBeGreaterThan(0);
    }
  });

  it('covers every reason the resolver can actually produce', () => {
    const produced = new Set<StartMissionFailureReason>();
    const cases: Array<[EspionageCivState, string, SpyMissionType, string?, string?]> = [
      [withSpy(makeSpy('spy-1', STATIONED)), 'nobody', 'gather_intel'],
      [withSpy(makeSpy('spy-1')), 'spy-1', 'gather_intel'],
      [withSpy(makeSpy('spy-1', { status: 'captured' })), 'spy-1', 'signals_intercept', 'ai-egypt', 'city-egypt-1'],
      [withSpy(makeSpy('spy-1')), 'spy-1', 'signals_intercept'],
    ];
    for (const [state, spyId, mission, civ, city] of cases) {
      const reason = getMissionStartDenial(state, spyId, mission, civ, city);
      if (reason) produced.add(reason);
    }
    expect([...produced].sort()).toEqual(Object.keys(START_MISSION_FAILURE_MESSAGES).sort());
  });

  describe('getMissionStartDenial is the one eligibility source', () => {
    it('agrees with startMission for every mission type and spy status', () => {
      const statuses: Spy['status'][] = ['idle', 'stationed', 'embedded', 'on_mission', 'captured', 'cooldown'];
      const missions: SpyMissionType[] = ['gather_intel', 'scout_area', 'cyber_attack', 'signals_intercept', 'steal_tech'];
      for (const status of statuses) {
        for (const mission of missions) {
          const state = withSpy(makeSpy('spy-1', { status, targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1' }));
          const denial = getMissionStartDenial(state, 'spy-1', mission);
          const result = startMission(state, 'spy-1', mission);
          expect(result.ok, `${status}/${mission}`).toBe(denial === null);
          if (!result.ok) expect(result.reason, `${status}/${mission}`).toBe(denial);
        }
      }
    });

    it('lets the panel ask about a remote mission whose target is still to be chosen', () => {
      const state = withSpy(makeSpy('spy-1'));

      expect(getMissionStartDenial(state, 'spy-1', 'cyber_attack')).toBe('target-missing');
      expect(getMissionStartDenial(state, 'spy-1', 'cyber_attack', undefined, undefined, { targetToBeChosen: true }))
        .toBeNull();
    });

    it('still demands a placed-spy mission target when the caller does not defer it', () => {
      const state = withSpy(makeSpy('spy-1', { status: 'stationed' }));

      expect(missionRequiresPlacedSpy('gather_intel')).toBe(true);
      expect(getMissionStartDenial(state, 'spy-1', 'gather_intel')).toBe('target-missing');
    });
  });
});
