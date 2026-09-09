import { describe, expect, it } from 'vitest';
import { evaluateDominationDoctrine } from '@/ai/ai-domination';
import type { PersonalityTraits } from '@/core/types';
import type { DominationKnowledge } from '@/systems/domination-types';

function knowledge(overrides: Partial<DominationKnowledge> = {}): DominationKnowledge {
  return {
    observerId: 'ai-1',
    turn: 10,
    ownRole: 'independent',
    ownOverlordId: null,
    ownDirectVassalIds: [],
    ownEarnedDefeatIds: [],
    knownCivIds: ['ai-1', 'ai-2', 'ai-3', 'ai-4'],
    unconfirmedKnownCivIds: [],
    reports: [],
    knownActorFacts: [],
    ...overrides,
  };
}

const aggressive: PersonalityTraits = {
  traits: ['aggressive'], warLikelihood: 0.8, diplomacyFocus: 0.2, expansionDrive: 0.7,
};

const trader: PersonalityTraits = {
  traits: ['trader'], warLikelihood: 0.2, diplomacyFocus: 0.7, expansionDrive: 0.2,
};

describe('Domination AI doctrine', () => {
  it.each([
    ['explorer', 8],
    ['standard', 14],
    ['veteran', 20],
  ] as const)('gives an aggressive independent city owner a bounded %s pursuit bonus', (challenge, bonus) => {
    expect(evaluateDominationDoctrine({
      knowledge: knowledge(),
      ownCityCount: 1,
      personality: aggressive,
      challenge,
    })).toMatchObject({
      pursuit: true,
      captureValueBonus: bonus,
      reasonCodes: ['domination-pursuit'],
    });
  });

  it('keeps ordinary scoring for a trader, a vassal, and cityless recovery', () => {
    for (const input of [
      { knowledge: knowledge(), ownCityCount: 1, personality: trader },
      { knowledge: knowledge({ ownRole: 'vassal', ownOverlordId: 'ai-2' }), ownCityCount: 1, personality: aggressive },
      { knowledge: knowledge(), ownCityCount: 0, personality: aggressive },
    ]) {
      expect(evaluateDominationDoctrine({ ...input, challenge: 'standard' })).toMatchObject({
        pursuit: false,
        captureValueBonus: 0,
        reasonCodes: [],
      });
    }
  });

  it('derives urgency only from a current earned report, never a stale one', () => {
    const report = {
      contenderId: 'ai-2', observedTurn: 10, contenderRole: 'independent' as const,
      directVassalIds: ['ai-3', 'ai-1'], defeatedCivIds: ['ai-4'],
    };
    const facts = [
      { civId: 'ai-1', civName: 'Self', disposition: 'vassal' as const, overlordId: 'ai-2', observedTurn: 10, evidence: 'own' as const },
      { civId: 'ai-2', civName: 'Threat', disposition: 'independent' as const, overlordId: null, observedTurn: 10, evidence: 'report' as const },
      { civId: 'ai-3', civName: 'Vassal', disposition: 'vassal' as const, overlordId: 'ai-2', observedTurn: 10, evidence: 'report' as const },
      { civId: 'ai-4', civName: 'Defeated', disposition: 'eliminated' as const, overlordId: null, observedTurn: 10, evidence: 'report' as const },
    ];
    const current = knowledge({
      ownRole: 'vassal', ownOverlordId: 'ai-2', reports: [report], knownActorFacts: facts,
    });

    expect(evaluateDominationDoctrine({
      knowledge: current, ownCityCount: 1, personality: trader, challenge: 'standard',
    }).threatId).toBe('ai-2');
    expect(evaluateDominationDoctrine({
      knowledge: { ...current, turn: 16 }, ownCityCount: 1, personality: trader, challenge: 'standard',
    }).threatId).toBeNull();
  });
});
