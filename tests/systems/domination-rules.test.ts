import { describe, expect, it } from 'vitest';
import {
  evaluateDominationFacts,
  type DominationActorFact,
} from '@/systems/domination-rules';

const independent = (civId: string): DominationActorFact => ({
  civId,
  disposition: 'independent',
  overlordId: null,
});

describe('evaluateDominationFacts', () => {
  it('requires every non-provisional rival to be eliminated or directly subordinate', () => {
    const facts: DominationActorFact[] = [
      independent('a'),
      independent('b'),
      { civId: 'c', disposition: 'vassal', overlordId: 'a' },
    ];

    expect(evaluateDominationFacts(facts, 'a', true).conditionMet).toBe(false);

    facts[1] = { civId: 'b', disposition: 'eliminated', overlordId: null };
    const result = evaluateDominationFacts(facts, 'a', true);

    expect(result.conditionMet).toBe(true);
    expect(result.securedRivalCount).toBe(2);
    expect(result.eliminatedRivalIds).toEqual(['b']);
    expect(result.directVassalIds).toEqual(['c']);
    expect(result.unresolvedRivalIds).toEqual([]);
  });

  it('does not treat another sovereign vassal relationship as credit for the contender', () => {
    const result = evaluateDominationFacts([
      independent('a'),
      { civId: 'b', disposition: 'vassal', overlordId: 'c' },
      independent('c'),
    ], 'a', true);

    expect(result.conditionMet).toBe(false);
    expect(result.unresolvedRivalIds).toEqual(['b', 'c']);
    expect(result.independentRivalIds).toEqual(['c']);
  });

  it('excludes provisional secessions from obligations without making them eligible winners', () => {
    const facts: DominationActorFact[] = [
      independent('a'),
      { civId: 'b', disposition: 'provisional', overlordId: null },
    ];

    expect(evaluateDominationFacts(facts, 'a', true).conditionMet).toBe(true);
    expect(evaluateDominationFacts(facts, 'b', true)).toMatchObject({
      eligible: false,
      ineligibleReason: 'provisional',
      conditionMet: false,
    });
  });

  it('requires a competitive campaign and an eligible independent contender', () => {
    const facts: DominationActorFact[] = [
      independent('a'),
      { civId: 'b', disposition: 'eliminated', overlordId: null },
    ];

    expect(evaluateDominationFacts(facts, 'a', false)).toMatchObject({
      eligible: false,
      ineligibleReason: 'noncompetitive',
      conditionMet: false,
    });
    expect(evaluateDominationFacts(facts, 'b', true)).toMatchObject({
      eligible: false,
      ineligibleReason: 'not-living-major',
      conditionMet: false,
    });
  });

  it('deduplicates actor IDs before counting secured rivals', () => {
    const result = evaluateDominationFacts([
      independent('a'),
      { civId: 'b', disposition: 'eliminated', overlordId: null },
      { civId: 'b', disposition: 'eliminated', overlordId: null },
    ], 'a', true);

    expect(result.rivalCount).toBe(1);
    expect(result.securedRivalCount).toBe(1);
    expect(result.eliminatedRivalIds).toEqual(['b']);
  });
});
