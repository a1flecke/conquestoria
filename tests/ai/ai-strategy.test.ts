import { describe, it, expect } from 'vitest';
import { chooseTech, chooseProduction, evaluateExpansionTarget } from '@/ai/ai-strategy';
import type { PersonalityTraits, Tech } from '@/core/types';

describe('ai-strategy', () => {
  const aggressive: PersonalityTraits = {
    traits: ['aggressive'],
    warLikelihood: 0.8,
    diplomacyFocus: 0.2,
    expansionDrive: 0.6,
  };

  describe('chooseTech', () => {
    it('returns highest weighted tech from available list', () => {
      const techs: Tech[] = [
        { id: 'mil1', name: 'Swords', track: 'military', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
        { id: 'sci1', name: 'Writing', track: 'science', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
      ];
      const chosen = chooseTech(aggressive, techs);
      expect(chosen.id).toBe('mil1');
    });

    it('returns first tech if no personality preference', () => {
      const neutral: PersonalityTraits = {
        traits: [],
        warLikelihood: 0.5,
        diplomacyFocus: 0.5,
        expansionDrive: 0.5,
      };
      const techs: Tech[] = [
        { id: 't1', name: 'A', track: 'science', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
      ];
      expect(chooseTech(neutral, techs).id).toBe('t1');
    });
  });

  describe('chooseProduction', () => {
    it('picks warrior when under threat and aggressive', () => {
      const result = chooseProduction(aggressive, ['warrior', 'granary', 'settler'], true, 1);
      expect(result).toBe('warrior');
    });

    it('picks settler when not threatened and high expansion drive', () => {
      const expansionist: PersonalityTraits = {
        traits: ['expansionist'],
        warLikelihood: 0.3,
        diplomacyFocus: 0.3,
        expansionDrive: 0.9,
      };
      const result = chooseProduction(expansionist, ['warrior', 'granary', 'settler'], false, 1);
      expect(result).toBe('settler');
    });
  });

  describe('evaluateExpansionTarget', () => {
    it('scores positions higher with more land tiles nearby', () => {
      const score = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 4, plains: 2, ocean: 0 },
      );
      expect(score).toBeGreaterThan(0);
    });

    it('penalizes positions with lots of ocean', () => {
      const landScore = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 5, plains: 1, ocean: 0 },
      );
      const oceanScore = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 1, plains: 0, ocean: 5 },
      );
      expect(landScore).toBeGreaterThan(oceanScore);
    });
  });
});
