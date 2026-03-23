import { describe, it, expect } from 'vitest';
import {
  weightTechChoice,
  weightProductionChoice,
  shouldDeclareWar,
} from '@/ai/ai-personality';
import type { PersonalityTraits, Tech } from '@/core/types';

describe('ai-personality', () => {
  const aggressive: PersonalityTraits = {
    traits: ['aggressive'],
    warLikelihood: 0.8,
    diplomacyFocus: 0.2,
    expansionDrive: 0.6,
  };

  const diplomatic: PersonalityTraits = {
    traits: ['diplomatic'],
    warLikelihood: 0.15,
    diplomacyFocus: 0.9,
    expansionDrive: 0.4,
  };

  describe('weightTechChoice', () => {
    it('aggressive personality prefers military techs', () => {
      const milTech = { id: 't1', track: 'military' } as Tech;
      const sciTech = { id: 't2', track: 'science' } as Tech;
      const milWeight = weightTechChoice(aggressive, milTech);
      const sciWeight = weightTechChoice(aggressive, sciTech);
      expect(milWeight).toBeGreaterThan(sciWeight);
    });

    it('diplomatic personality prefers civics techs', () => {
      const civTech = { id: 't1', track: 'civics' } as Tech;
      const milTech = { id: 't2', track: 'military' } as Tech;
      const civWeight = weightTechChoice(diplomatic, civTech);
      const milWeight = weightTechChoice(diplomatic, milTech);
      expect(civWeight).toBeGreaterThan(milWeight);
    });
  });

  describe('weightProductionChoice', () => {
    it('aggressive personality gives higher weight to military units', () => {
      const milWeight = weightProductionChoice(aggressive, 'warrior', false);
      const civWeight = weightProductionChoice(aggressive, 'granary', false);
      expect(milWeight).toBeGreaterThan(civWeight);
    });

    it('weights settler higher when expansionDrive is high', () => {
      const settlerWeight = weightProductionChoice(aggressive, 'settler', false);
      const settlerWeightDip = weightProductionChoice(diplomatic, 'settler', false);
      expect(settlerWeight).toBeGreaterThan(settlerWeightDip);
    });

    it('weights military higher when under threat', () => {
      const normalWeight = weightProductionChoice(diplomatic, 'warrior', false);
      const threatWeight = weightProductionChoice(diplomatic, 'warrior', true);
      expect(threatWeight).toBeGreaterThan(normalWeight);
    });
  });

  describe('shouldDeclareWar', () => {
    it('aggressive civ with military advantage declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.5)).toBe(true);
    });

    it('diplomatic civ avoids war even with advantage', () => {
      expect(shouldDeclareWar(diplomatic, 10, 1.5)).toBe(false);
    });

    it('no one declares war with positive relationship above 30', () => {
      expect(shouldDeclareWar(aggressive, 40, 2.0)).toBe(false);
    });
  });
});
