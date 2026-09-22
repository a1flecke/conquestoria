import { describe, it, expect } from 'vitest';
import {
  weightTechChoice,
  weightProductionChoice,
  weightProductionRoles,
  shouldDeclareWar,
} from '@/ai/ai-personality';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent';
import type { PersonalityTraits, Tech } from '@/core/types';

const NEUTRAL_POSTURE = NATIONAL_INTENT_POSTURE.develop;

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
      const milWeight = weightTechChoice(aggressive, milTech, NEUTRAL_POSTURE);
      const sciWeight = weightTechChoice(aggressive, sciTech, NEUTRAL_POSTURE);
      expect(milWeight).toBeGreaterThan(sciWeight);
    });

    it('diplomatic personality prefers civics techs', () => {
      const civTech = { id: 't1', track: 'civics' } as Tech;
      const milTech = { id: 't2', track: 'military' } as Tech;
      const civWeight = weightTechChoice(diplomatic, civTech, NEUTRAL_POSTURE);
      const milWeight = weightTechChoice(diplomatic, milTech, NEUTRAL_POSTURE);
      expect(civWeight).toBeGreaterThan(milWeight);
    });

    it('#1087: a dominate posture weights military-track techs higher than a develop posture, for the identical personality', () => {
      const milTech = { id: 't1', track: 'military' } as Tech;
      const dominateWeight = weightTechChoice(diplomatic, milTech, NATIONAL_INTENT_POSTURE.dominate);
      const developWeight = weightTechChoice(diplomatic, milTech, NATIONAL_INTENT_POSTURE.develop);
      expect(dominateWeight).toBeGreaterThan(developWeight);
    });

    it('#1087: posture never affects a non-military-track tech\'s weight', () => {
      const sciTech = { id: 't2', track: 'science' } as Tech;
      const dominateWeight = weightTechChoice(diplomatic, sciTech, NATIONAL_INTENT_POSTURE.dominate);
      const developWeight = weightTechChoice(diplomatic, sciTech, NATIONAL_INTENT_POSTURE.develop);
      expect(dominateWeight).toBe(developWeight);
    });
  });

  const expansionist: PersonalityTraits = {
    traits: ['expansionist'],
    warLikelihood: 0.5,
    diplomacyFocus: 0.3,
    expansionDrive: 0.9,
  };

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

    it('aggressive personality weights warships above neutral items', () => {
      const galleyWeight = weightProductionChoice(aggressive, 'galley', false);
      const neutralWeight = weightProductionChoice(aggressive, 'granary', false);
      expect(galleyWeight).toBeGreaterThan(neutralWeight);
    });

    it('warships get less weight than land military so navy stays secondary', () => {
      const warriorWeight = weightProductionChoice(aggressive, 'warrior', false);
      const galleyWeight = weightProductionChoice(aggressive, 'galley', false);
      const triremeWeight = weightProductionChoice(aggressive, 'trireme', false);
      expect(warriorWeight).toBeGreaterThan(galleyWeight);
      expect(warriorWeight).toBeGreaterThan(triremeWeight);
    });

    it('expansionist personality weights transports above a neutral item', () => {
      const transportWeight = weightProductionChoice(expansionist, 'transport', false);
      const neutralWeight = weightProductionChoice(expansionist, 'granary', false);
      expect(transportWeight).toBeGreaterThan(neutralWeight);
    });

    it('expansionist personality weights transports higher than diplomatic personality', () => {
      const expandWeight = weightProductionChoice(expansionist, 'transport', false);
      const dipWeight = weightProductionChoice(diplomatic, 'transport', false);
      expect(expandWeight).toBeGreaterThan(dipWeight);
    });

    it('all 5 transport types receive the same naval transport weighting', () => {
      const types = ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'];
      const weights = types.map(t => weightProductionChoice(expansionist, t, false));
      for (const w of weights) {
        expect(w).toBe(weights[0]);
      }
    });
  });

  describe('shouldDeclareWar', () => {
    it('aggressive civ with military advantage declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.5, 12, true, true, false, 0, NEUTRAL_POSTURE)).toBe(true);
    });

    it('diplomatic civ avoids war even with advantage', () => {
      expect(shouldDeclareWar(diplomatic, 10, 1.5, 12, true, true, false, 0, NEUTRAL_POSTURE)).toBe(false);
    });

    it('no one declares war with positive relationship above 30', () => {
      expect(shouldDeclareWar(aggressive, 40, 2.0, 12, true, true, false, 0, NEUTRAL_POSTURE)).toBe(false);
    });

    it('does not declare war on turn 1 against an unmet rival even with advantage', () => {
      expect(shouldDeclareWar(aggressive, -60, 2.0, 1, false, false, false, 0, NEUTRAL_POSTURE)).toBe(false);
    });
  });

  describe('shouldDeclareWar — strategic deterrence caution (#545 MR5)', () => {
    // #1087: advantage raised from the pre-#1087 1.05 to 1.3 -- NEUTRAL_POSTURE is now
    // NATIONAL_INTENT_POSTURE.develop, whose warDeclarationBias (-0.1) raises the ordinary
    // threshold from 0.8 to 0.9, so 1.05's original warScore (0.84) no longer clears it.
    // 1.3 keeps this test's actual intent (MR5's caution mechanic) provable under the new
    // required posture parameter: warScore 1.04 clears the 0.9 no-caution bar but not the
    // 1.05 with-caution bar.
    it('a war that would otherwise trigger is suppressed once the target has known strategic capability', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.3, 12, true, true, false, 0, NEUTRAL_POSTURE)).toBe(true);
      expect(shouldDeclareWar(aggressive, -10, 1.3, 12, true, true, true, 0.15, NEUTRAL_POSTURE)).toBe(false);
    });

    it('a zero caution weight is a no-op even against a known-capability target', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.3, 12, true, true, true, 0, NEUTRAL_POSTURE)).toBe(true);
    });

    it('caution never grants immunity — a sufficiently motivated AI still declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 3.0, 12, true, true, true, 0.15, NEUTRAL_POSTURE)).toBe(true);
    });
  });

  describe('#1087 shouldDeclareWar — posture bias', () => {
    it('a dominate posture declares war at a war-score value a develop posture would not', () => {
      // warScore = warLikelihood(0.8) * advantage; develop threshold = 0.8 + 0 - (-0.1) = 0.9;
      // dominate threshold = 0.8 + 0 - 0.2 = 0.6. advantage=0.85 -> warScore=0.68: above dominate's
      // 0.6 bar, below develop's 0.9 bar.
      expect(shouldDeclareWar(aggressive, -10, 0.85, 12, true, true, false, 0, NATIONAL_INTENT_POSTURE.dominate)).toBe(true);
      expect(shouldDeclareWar(aggressive, -10, 0.85, 12, true, true, false, 0, NATIONAL_INTENT_POSTURE.develop)).toBe(false);
    });

    it('a recover posture is strictly more war-averse than a develop posture, for the same personality', () => {
      // warScore = 0.8 * 1.15 = 0.92; develop threshold = 0.9 (0.92 > 0.9 -> declares);
      // recover threshold = 0.8 - (-0.3) = 1.1 (0.92 < 1.1 -> does not declare).
      expect(shouldDeclareWar(aggressive, -10, 1.15, 12, true, true, false, 0, NATIONAL_INTENT_POSTURE.develop)).toBe(true);
      expect(shouldDeclareWar(aggressive, -10, 1.15, 12, true, true, false, 0, NATIONAL_INTENT_POSTURE.recover)).toBe(false);
    });
  });
});

describe('#1064 expansion weighting', () => {
  it('weights settlement higher for an expansionist than an aggressor', () => {
    // Pin the ORDERING, never an absolute number -- the constant is tuning.
    // Explicit PersonalityTraits type, not `as const` -- traits is a mutable
    // PersonalityTrait[], which a readonly `as const` tuple cannot satisfy.
    const expansionist: PersonalityTraits = {
      traits: ['expansionist'], warLikelihood: 0.3, diplomacyFocus: 0.5, expansionDrive: 0.9,
    };
    const aggressor: PersonalityTraits = {
      traits: ['aggressive'], warLikelihood: 0.9, diplomacyFocus: 0.2, expansionDrive: 0.2,
    };

    expect(weightProductionRoles(expansionist, ['settlement'], NEUTRAL_POSTURE))
      .toBeGreaterThan(weightProductionRoles(aggressor, ['settlement'], NEUTRAL_POSTURE));
  });
});

describe('#1086 national intent posture weighting', () => {
  const neutral: PersonalityTraits = {
    traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
  };

  it('an expand posture weights settlement/transport/recon higher than a develop posture', () => {
    expect(weightProductionRoles(neutral, ['settlement'], NATIONAL_INTENT_POSTURE.expand))
      .toBeGreaterThan(weightProductionRoles(neutral, ['settlement'], NATIONAL_INTENT_POSTURE.develop));
  });

  it('a dominate posture weights combat roles higher than a develop posture', () => {
    expect(weightProductionRoles(neutral, ['frontline'], NATIONAL_INTENT_POSTURE.dominate))
      .toBeGreaterThan(weightProductionRoles(neutral, ['frontline'], NATIONAL_INTENT_POSTURE.develop));
  });

  it('a recover posture weights settlement lower than every ambition posture', () => {
    const recoverScore = weightProductionRoles(neutral, ['settlement'], NATIONAL_INTENT_POSTURE.recover);
    for (const intent of ['expand', 'develop', 'dominate', 'deter'] as const) {
      expect(recoverScore).toBeLessThan(
        weightProductionRoles(neutral, ['settlement'], NATIONAL_INTENT_POSTURE[intent]),
      );
    }
  });

  it('preserves the existing personality-only ordering under a neutral (develop) posture', () => {
    // #1064's own assertion, re-proven under the now-required posture parameter, to
    // pin that posture never overrides personality's existing relative ordering.
    const expansionist: PersonalityTraits = {
      traits: ['expansionist'], warLikelihood: 0.3, diplomacyFocus: 0.5, expansionDrive: 0.9,
    };
    const aggressor: PersonalityTraits = {
      traits: ['aggressive'], warLikelihood: 0.9, diplomacyFocus: 0.2, expansionDrive: 0.2,
    };
    expect(weightProductionRoles(expansionist, ['settlement'], NATIONAL_INTENT_POSTURE.develop))
      .toBeGreaterThan(weightProductionRoles(aggressor, ['settlement'], NATIONAL_INTENT_POSTURE.develop));
  });
});
