import { describe, expect, it } from 'vitest';
import { getDominationThreats } from '@/systems/domination-presentation';
import type { DominationKnowledge } from '@/systems/domination-types';

function knowledge(overrides: Partial<DominationKnowledge> = {}): DominationKnowledge {
  return {
    observerId: 'player',
    turn: 10,
    ownRole: 'vassal',
    ownOverlordId: 'rome',
    ownDirectVassalIds: [],
    ownEarnedDefeatIds: [],
    knownCivIds: ['egypt', 'persia', 'player', 'rome'],
    unconfirmedKnownCivIds: ['persia'],
    reports: [{
      contenderId: 'rome',
      observedTurn: 5,
      contenderRole: 'independent',
      directVassalIds: ['egypt', 'player'],
      defeatedCivIds: [],
    }],
    knownActorFacts: [
      { civId: 'player', civName: 'Player', disposition: 'vassal', overlordId: 'rome', observedTurn: 10, evidence: 'own' },
      { civId: 'rome', civName: 'Rome', disposition: 'independent', overlordId: null, observedTurn: 5, evidence: 'report' },
      { civId: 'egypt', civName: 'Egypt', disposition: 'vassal', overlordId: 'rome', observedTurn: 5, evidence: 'report' },
      { civId: 'persia', civName: 'Persia', disposition: 'unknown', overlordId: null, observedTurn: null, evidence: 'unconfirmed' },
    ],
    ...overrides,
  };
}

describe('Domination warning inference', () => {
  it('warns only when recent earned evidence shows a contender secured two rivals with one unresolved', () => {
    expect(getDominationThreats(knowledge())).toEqual([
      expect.objectContaining({ contenderId: 'rome', securedRivalIds: ['egypt', 'player'], unresolvedRivalIds: ['persia'] }),
    ]);
  });

  it('does not hide an unresolved rival by deriving the denominator only from secured facts', () => {
    const state = knowledge({
      knownCivIds: ['egypt', 'persia', 'player', 'rome', 'sumer'],
      unconfirmedKnownCivIds: ['persia', 'sumer'],
      knownActorFacts: [
        ...knowledge().knownActorFacts,
        { civId: 'sumer', civName: 'Sumer', disposition: 'unknown', overlordId: null, observedTurn: null, evidence: 'unconfirmed' },
      ],
    });

    expect(getDominationThreats(state)).toEqual([]);
  });

  it.each([
    ['old report', { turn: 11 }],
    ['future report', { reports: [{ ...knowledge().reports[0], observedTurn: 11 }] }],
    ['provisional contender', { reports: [{ ...knowledge().reports[0], contenderRole: 'provisional' }] }],
    ['vassal contender', { reports: [{ ...knowledge().reports[0], contenderRole: 'vassal' }] }],
  ] as const)('does not warn from a %s', (_label, overrides) => {
    expect(getDominationThreats(knowledge(overrides as Partial<DominationKnowledge>))).toEqual([]);
  });
});
