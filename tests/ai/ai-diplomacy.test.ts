import { describe, it, expect } from 'vitest';
import { evaluateDiplomacy, evaluateMinorCivDiplomacy, evaluateVassalage, evaluateEmbargoResponse, evaluateLeagueResponse } from '@/ai/ai-diplomacy';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent';
import type { PersonalityTraits, GameState, MinorCivState, DiplomacyState } from '@/core/types';
import type { MilitaryStrengthEstimate } from '@/ai/ai-strength';

const NEUTRAL_POSTURE = NATIONAL_INTENT_POSTURE.develop;

function strength(midpoint: number): MilitaryStrengthEstimate {
  return {
    exactVisible: midpoint,
    remembered: 0,
    uncertaintyLower: midpoint,
    uncertaintyUpper: midpoint,
    midpoint,
  };
}

function makeDiplomacy(overrides: Partial<DiplomacyState> = {}): DiplomacyState {
  return {
    relationships: {},
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
    ...overrides,
  };
}

function makeMC(id: string, archetype: string, rel: number): MinorCivState {
  return {
    id,
    definitionId: id,
    cityId: `city-${id}`,
    units: [],
    diplomacy: makeDiplomacy({ relationships: { ai_civ: rel } }),
    activeQuests: {},
    chainStatusByCiv: {},
    questCooldownUntilByCiv: {},
    lastNotifiedStatusByCiv: {},
    isDestroyed: false,
    garrisonCooldown: 0,
    lastEraUpgrade: 0,
  };
}

const diplomaticPersonality: PersonalityTraits = {
  traits: ['diplomatic'],
  warLikelihood: 0.2,
  expansionDrive: 0.3,
  diplomacyFocus: 0.8,
};

const aggressivePersonality: PersonalityTraits = {
  traits: ['aggressive'],
  warLikelihood: 0.9,
  expansionDrive: 0.6,
  diplomacyFocus: 0.2,
};

describe('evaluateMinorCivDiplomacy', () => {
  it('diplomatic AI gifts gold to low-relationship minor civs', () => {
    const mc = makeMC('mc-test', 'mercantile', 10);
    const decisions = evaluateMinorCivDiplomacy(
      diplomaticPersonality,
      { 'mc-test': mc },
      'ai_civ',
      100,
      NEUTRAL_POSTURE,
    );
    const giftDecision = decisions.find(d => d.mcId === 'mc-test' && d.action === 'gift_gold');
    expect(giftDecision).toBeDefined();
  });

  it('aggressive AI does not gift gold', () => {
    const mc = makeMC('mc-test', 'militaristic', 10);
    const decisions = evaluateMinorCivDiplomacy(
      aggressivePersonality,
      { 'mc-test': mc },
      'ai_civ',
      100,
      NEUTRAL_POSTURE,
    );
    const giftDecision = decisions.find(d => d.action === 'gift_gold');
    expect(giftDecision).toBeUndefined();
  });

  it('skips destroyed minor civs', () => {
    const mc = makeMC('mc-test', 'cultural', 20);
    mc.isDestroyed = true;
    const decisions = evaluateMinorCivDiplomacy(
      diplomaticPersonality,
      { 'mc-test': mc },
      'ai_civ',
      100,
      NEUTRAL_POSTURE,
    );
    expect(decisions).toHaveLength(0);
  });

  it('does not gift when gold is too low', () => {
    const mc = makeMC('mc-test', 'cultural', 10);
    const decisions = evaluateMinorCivDiplomacy(
      diplomaticPersonality,
      { 'mc-test': mc },
      'ai_civ',
      10,
      NEUTRAL_POSTURE,
    );
    const giftDecision = decisions.find(d => d.action === 'gift_gold');
    expect(giftDecision).toBeUndefined();
  });
});

describe('evaluateDiplomacy', () => {
  it('does not declare war on turn 1 against an unmet or low-pressure rival', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      1,
      { player: strength(10) },
      strength(100),
      1,
      { player: { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );

    expect(decisions.find(d => d.action === 'declare_war')).toBeUndefined();
  });

  it('treats a missing perception context as unmet', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -100 } }),
      [],
      4,
      { player: strength(10) },
      strength(100),
      20,
      {},
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );

    expect(decisions.find(decision => decision.action === 'declare_war')).toBeUndefined();
  });

  it('does not sign treaties with an unmet civilization', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 80 } }),
      [],
      4,
      { player: strength(40) },
      strength(40),
      20,
      { player: { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );

    expect(decisions).toEqual([]);
  });

  it('compares both civilizations through the same midpoint contract', () => {
    const decisions = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(120) },
      strength(40),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );

    expect(decisions.find(decision => decision.action === 'declare_war')).toBeUndefined();
  });

  it('known strategic capability on the target suppresses a war that would otherwise trigger (#545 MR5)', () => {
    // #1087: self strength raised from the pre-#1087 100 to 120 -- NEUTRAL_POSTURE is now
    // NATIONAL_INTENT_POSTURE.develop, whose warDeclarationBias (-0.1) raises the ordinary
    // threshold from 0.8 to 0.9, so the original 100-vs-105 advantage (0.952, warScore
    // 0.857) no longer clears it. 120-vs-105 (advantage 1.143, warScore 1.029) clears the
    // 0.9 no-caution bar but not the 1.05 with-caution bar, preserving this test's actual
    // intent (MR5's caution mechanic) under the new required posture parameter.
    const noCaution = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(105) },
      strength(120),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );
    expect(noCaution.find(d => d.action === 'declare_war')).toBeDefined();

    const withCaution = evaluateDiplomacy(
      aggressivePersonality,
      makeDiplomacy({ relationships: { player: -60 } }),
      [],
      4,
      { player: strength(105) },
      strength(120),
      20,
      { player: { hasMet: true, hasBorderPressure: true, targetHasKnownStrategicCapability: true } },
      0.15,
      false,
      false,
      NEUTRAL_POSTURE,
    );
    expect(withCaution.find(d => d.action === 'declare_war')).toBeUndefined();
  });

  it('proposes arms_control_pact when both capability checks and the relationship/diplomacyFocus bar are met (#545 MR6)', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality, // diplomacyFocus: 0.8, well above the 0.4 bar
      makeDiplomacy({ relationships: { player: 10 } }), // above the >0 bar
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,  // hasArmsControlTreaty
      true,  // actorHasKnownCapability
      NEUTRAL_POSTURE,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeDefined();
  });

  it('omits arms_control_pact when the actor itself has no known capability, even if everything else qualifies', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,
      false, // actorHasKnownCapability
      NEUTRAL_POSTURE,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('omits arms_control_pact when the actor does not know the target has capability, even if everything else qualifies', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      true,
      true,
      NEUTRAL_POSTURE,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('play-styles invariant: a civ with no known capability is never proposed an arms-control pact, regardless of relationship (#545 MR6)', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 90 } }), // maximally friendly
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      true,
      true,
      NEUTRAL_POSTURE,
    );
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeUndefined();
  });

  it('arms_control_pact can coexist with an alliance decision for the same target in the same call', () => {
    const decisions = evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({ relationships: { player: 60 } }), // clears alliance's own >50 bar too
      [],
      12,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: true } },
      0,
      true,
      true,
      NEUTRAL_POSTURE,
    );
    expect(decisions.find(d => d.action === 'alliance')).toBeDefined();
    expect(decisions.find(d => d.action === 'arms_control_pact')).toBeDefined();
  });
});

// #1087 recovery-competence invariant: a civ in `recover` national intent must never be
// diplomatically *less* capable than the same civ in `develop` -- recover's posture biases
// are deliberately at least as favorable on every reconciled diplomatic surface.
describe('#1087 recovery-competence — recover posture is never worse than develop', () => {
  it('non_aggression_pact opens under recover posture at a diplomacyFocus where develop refuses', () => {
    const cautious: PersonalityTraits = {
      traits: [], warLikelihood: 0.5, diplomacyFocus: 0.28, expansionDrive: 0.5,
    };
    const developDecisions = evaluateDiplomacy(
      cautious,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      4,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NATIONAL_INTENT_POSTURE.develop,
    );
    const recoverDecisions = evaluateDiplomacy(
      cautious,
      makeDiplomacy({ relationships: { player: 10 } }),
      [],
      4,
      { player: strength(50) },
      strength(50),
      20,
      { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
      0,
      false,
      false,
      NATIONAL_INTENT_POSTURE.recover,
    );
    expect(developDecisions.find(d => d.action === 'non_aggression_pact')).toBeUndefined();
    expect(recoverDecisions.find(d => d.action === 'non_aggression_pact')).toBeDefined();
  });

  it('evaluateVassalage offers vassalage under recover posture at a strength ratio where develop refuses', () => {
    // canOfferVassalage requires peakCities >= 2 and a decline below half of peak cities or
    // military -- peakCities=4, currentCities=1 satisfies "citiesBelow" so the eligibility
    // gate passes independently of the strength-ratio comparison under test below.
    const diplomacy = makeDiplomacy({
      vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 4, peakMilitary: 0 },
    });
    const otherStrengths = { rival: strength(150) };
    // self=80, other=150 -> ratio 0.533: above develop's unbiased 0.4 threshold (refuses)
    // but below recover's 0.4+0.25=0.65 threshold (offers).
    const developResult = evaluateVassalage(
      diplomacy, 4, strength(80), 1, 1, otherStrengths, NATIONAL_INTENT_POSTURE.develop,
    );
    const recoverResult = evaluateVassalage(
      diplomacy, 4, strength(80), 1, 1, otherStrengths, NATIONAL_INTENT_POSTURE.recover,
    );
    expect(developResult).toBeNull();
    expect(recoverResult).not.toBeNull();
  });
});

// #1087: evaluateEmbargoResponse and evaluateLeagueResponse had zero test coverage before
// this issue (grepped across tests/ -- no direct caller existed). Adding coverage here both
// proves the posture wiring and pins the sign each function needs: embargo and league have
// OPPOSITE relationships between "diplomatic openness" and threshold direction in the
// pre-existing trait table (diplomatic trait: threshold 30/hardest for embargo, but 5/easiest
// for league), so a single naive same-sign bias formula is wrong for one of them -- caught in
// this issue's own mandatory review pass, see the inline comment on evaluateEmbargoResponse.
describe('#1087 evaluateEmbargoResponse / evaluateLeagueResponse — posture bias direction', () => {
  const neutral: PersonalityTraits = {
    traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
  };

  it('a more diplomatically open posture (develop) is LESS likely to join a punitive embargo than a less open posture (dominate), for the same personality and relationships', () => {
    // neutral baseThreshold=20; develop threshold=20+0.1*20=22 (20 does not clear it);
    // dominate threshold=20+(-0.15*20)=17 (20 clears it).
    const relationships = { proposer: 20, target: 0 }; // gap of 20
    const developJoins = evaluateEmbargoResponse(neutral, relationships, 'proposer', 'target', NATIONAL_INTENT_POSTURE.develop);
    const dominateJoins = evaluateEmbargoResponse(neutral, relationships, 'proposer', 'target', NATIONAL_INTENT_POSTURE.dominate);
    expect(developJoins).toBe(false);
    expect(dominateJoins).toBe(true);
  });

  it('a more diplomatically open posture (develop) is MORE likely to join a defensive league than a less open posture (dominate), for the same personality and relationships', () => {
    const relationships = { ally: 10 }; // avgRel = 10
    const developJoins = evaluateLeagueResponse(neutral, relationships, ['ally'], NATIONAL_INTENT_POSTURE.develop);
    const dominateJoins = evaluateLeagueResponse(neutral, relationships, ['ally'], NATIONAL_INTENT_POSTURE.dominate);
    expect(developJoins).toBe(true);
    expect(dominateJoins).toBe(false);
  });
});
