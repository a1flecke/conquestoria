import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { declareMajorWar, proposeTreatyAgreement } from '@/systems/diplomacy-system';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { isWarStalemated, WAR_STALEMATE_ROUNDS } from '@/systems/war-history-system';
import { evaluatePeaceConsent } from '@/ai/ai-treaty-consent';
import { evaluateDiplomacy } from '@/ai/ai-diplomacy';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent-posture';
import { makeWarHistoryFixture } from './helpers/war-history-fixture';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

/**
 * #1693: before the stalemate rule nothing ended a war that had stopped producing captures. An AI holding a war
 * goal kept it while the goal was unmet, and peace (proposing and accepting) needed relations above -20, which a war
 * drives down and never restores: one long-horizon war ran 148 rounds with no capture and no peace.
 */
function aiWar() {
  let state = makeWarHistoryFixture();
  for (const id of ['attacker', 'defender']) state.civilizations[id].isHuman = false;
  state = declareMajorWar(state, 'attacker', 'defender');
  for (const [a, b] of [['attacker', 'defender'], ['defender', 'attacker']]) {
    state.civilizations[a].diplomacy.relationships[b] = -50;
  }
  return state;
}

describe('war stalemate (#1693)', () => {
  it('counts a war stalemated only after WAR_STALEMATE_ROUNDS with no city changing hands', () => {
    const state = aiWar();
    state.turn += WAR_STALEMATE_ROUNDS - 1;
    expect(isWarStalemated(state, 'attacker', 'defender')).toBe(false);
    state.turn += 1;
    expect(isWarStalemated(state, 'attacker', 'defender')).toBe(true);
    expect(isWarStalemated(state, 'defender', 'attacker')).toBe(true);
    expect(isWarStalemated(state, 'attacker', 'bystander')).toBe(false);
  });

  it('a captured city restarts the count', () => {
    let state = aiWar();
    state.turn += WAR_STALEMATE_ROUNDS;
    const cityId = state.civilizations.defender.cities[1]!;
    state = resolveMajorCityCapture(state, cityId, 'attacker', 'occupy', state.turn).state;
    expect(isWarStalemated(state, 'attacker', 'defender')).toBe(false);
  });

  it('peace consent accepts a stalemated war whatever the relationship, and only then', () => {
    const base = { kind: 'peace' as const, relationship: -60, diplomacyFocus: 0.5, targetHasKnownStrategicCapability: false, actorHasKnownStrategicCapability: false };
    expect(evaluatePeaceConsent(base).accepted).toBe(false);
    expect(evaluatePeaceConsent({ ...base, warStalemated: true }).accepted).toBe(true);
  });

  it('two AIs end a stalemated war through the real proposal path, and not before it is one', () => {
    const fresh = aiWar();
    const notYet = proposeTreatyAgreement(fresh, 'attacker', 'defender', 'peace', new EventBus());
    expect(notYet.civilizations.attacker.diplomacy.atWarWith).toContain('defender');

    const stale = aiWar();
    stale.turn += WAR_STALEMATE_ROUNDS;
    const ended = proposeTreatyAgreement(stale, 'attacker', 'defender', 'peace', new EventBus());
    expect(ended.civilizations.attacker.diplomacy.atWarWith).not.toContain('defender');
    expect(ended.civilizations.defender.diplomacy.atWarWith).not.toContain('attacker');
  });

  it('an AI holding an unmet war goal sues for peace once the war is stalemated', () => {
    const strength = { midpoint: 50 } as never;
    const decide = (warStalemated: boolean) => evaluateDiplomacy(
      { traits: ['aggressive'], warLikelihood: 0.8, diplomacyFocus: 0.3, expansionDrive: 0.5 },
      { ...aiWar().civilizations.attacker.diplomacy, warGoals: { defender: { kind: 'conquer_city', opponentCivId: 'defender', targetCityId: 'x', declaredTurn: 1, citiesCapturedFromOpponent: 0, overreachPenaltyApplied: false } } } as never,
      [], resolveCivilizationEra([]), { defender: strength }, strength, 60,
      { defender: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false, warStalemated } },
      0, false, false, NATIONAL_INTENT_POSTURE.develop, { defender: 'active' },
    ).filter(decision => decision.action === 'request_peace');
    expect(decide(false)).toEqual([]);
    expect(decide(true)).toEqual([{ action: 'request_peace', targetCiv: 'defender' }]);
  });
});
