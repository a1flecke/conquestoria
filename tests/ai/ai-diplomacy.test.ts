import { describe, it, expect } from 'vitest';
import { OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP, applyAiCityStateWar, applyAiMinorCivPeace, evaluateDiplomacy, evaluateMinorCivDiplomacy, evaluateVassalage, evaluateEmbargoResponse, evaluateLeagueResponse } from '@/ai/ai-diplomacy';
import { civilizationEraFromNumber } from '@/systems/era-types';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent-posture';
import type { PersonalityTraits, MinorCivState, DiplomacyState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { hexKey, mapDistance } from '@/systems/hex-utils';
import type { GameState } from '@/core/types';
import type { MilitaryStrengthEstimate } from '@/systems/diplomatic-strength';

const NEUTRAL_POSTURE = NATIONAL_INTENT_POSTURE.develop;

function strength(midpoint: number): MilitaryStrengthEstimate {
  return {
    exactVisible: midpoint,
    remembered: 0,
    uncertaintyLower: midpoint,
    uncertaintyUpper: midpoint,
    midpoint,
    observedUnitCount: 1,
    hasUsableObservation: true,
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

function makeMC(id: string, _archetype: string, rel: number): MinorCivState {
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
      civilizationEraFromNumber(1),
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(12),
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
      civilizationEraFromNumber(12),
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
      civilizationEraFromNumber(12),
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
      civilizationEraFromNumber(12),
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
      civilizationEraFromNumber(12),
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

  describe('#988 goal-aware peace-seeking', () => {
    // At war, decent relationship, no military disadvantage -- the legacy
    // `relationship > -20` heuristic alone would already seek peace here, so
    // every case below deliberately sits in that same "would legacy-seek-peace"
    // zone to prove the goal actually changes the outcome.
    const atWarNoDisadvantage = makeDiplomacy({ relationships: { player: 0 }, atWarWith: ['player'] });

    it('keeps fighting while an active goal exists and the AI is not losing', () => {
      const decisions = evaluateDiplomacy(
        aggressivePersonality, atWarNoDisadvantage, [], civilizationEraFromNumber(4),
        { player: strength(100) }, strength(100), 20,
        { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
        0, false, false, NEUTRAL_POSTURE,
        { player: 'active' },
      );
      expect(decisions.find(d => d.action === 'request_peace')).toBeUndefined();
    });

    it('seeks peace once the declared goal is satisfied', () => {
      const decisions = evaluateDiplomacy(
        aggressivePersonality, atWarNoDisadvantage, [], civilizationEraFromNumber(4),
        { player: strength(100) }, strength(100), 20,
        { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
        0, false, false, NEUTRAL_POSTURE,
        { player: 'satisfied' },
      );
      expect(decisions.find(d => d.action === 'request_peace')).toBeDefined();
    });

    it('seeks peace once the declared goal is exceeded', () => {
      const decisions = evaluateDiplomacy(
        aggressivePersonality, atWarNoDisadvantage, [], civilizationEraFromNumber(4),
        { player: strength(100) }, strength(100), 20,
        { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
        0, false, false, NEUTRAL_POSTURE,
        { player: 'exceeded' },
      );
      expect(decisions.find(d => d.action === 'request_peace')).toBeDefined();
    });

    it('still seeks peace with an active goal when outmatched', () => {
      const decisions = evaluateDiplomacy(
        aggressivePersonality, atWarNoDisadvantage, [], civilizationEraFromNumber(4),
        { player: strength(200) }, strength(100), 20,
        { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
        0, false, false, NEUTRAL_POSTURE,
        { player: 'active' },
      );
      expect(decisions.find(d => d.action === 'request_peace')).toBeDefined();
    });

    it('preserves the legacy relationship-only heuristic when no goal is declared', () => {
      const decisions = evaluateDiplomacy(
        aggressivePersonality, atWarNoDisadvantage, [], civilizationEraFromNumber(4),
        { player: strength(100) }, strength(100), 20,
        { player: { hasMet: true, hasBorderPressure: false, targetHasKnownStrategicCapability: false } },
        0, false, false, NEUTRAL_POSTURE,
      );
      expect(decisions.find(d => d.action === 'request_peace')).toBeDefined();
    });
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
      civilizationEraFromNumber(4),
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
      civilizationEraFromNumber(4),
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
      diplomacy, civilizationEraFromNumber(4), strength(80), 1, 1, otherStrengths, NATIONAL_INTENT_POSTURE.develop,
    );
    const recoverResult = evaluateVassalage(
      diplomacy, civilizationEraFromNumber(4), strength(80), 1, 1, otherStrengths, NATIONAL_INTENT_POSTURE.recover,
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

describe('#870 AI values Open Borders now that it is real passage', () => {
  function decide(opts: {
    relationship?: number;
    sharesKnownBorder?: boolean | undefined;
    hasMet?: boolean;
    treaties?: DiplomacyState['treaties'];
    atWar?: boolean;
  } = {}) {
    return evaluateDiplomacy(
      diplomaticPersonality,
      makeDiplomacy({
        relationships: { player: opts.relationship ?? 30 },
        treaties: opts.treaties ?? [],
        atWarWith: opts.atWar ? ['player'] : [],
      }),
      [],
      civilizationEraFromNumber(4),
      { player: strength(40) },
      strength(40),
      20,
      { player: { hasMet: opts.hasMet ?? true, hasBorderPressure: false, targetHasKnownStrategicCapability: false, sharesKnownBorder: opts.sharesKnownBorder } },
      0,
      false,
      false,
      NEUTRAL_POSTURE,
    );
  }
  const proposesOpenBorders = (decisions: ReturnType<typeof decide>) =>
    decisions.some(decision => decision.action === 'open_borders' && decision.targetCiv === 'player');

  it('proposes Open Borders to a friendly civ whose border it can see', () => {
    expect(proposesOpenBorders(decide({ relationship: 30, sharesKnownBorder: true }))).toBe(true);
  });

  it('does not propose without a visible shared border (the treaty has nothing to do there)', () => {
    expect(proposesOpenBorders(decide({ sharesKnownBorder: false }))).toBe(false);
    expect(proposesOpenBorders(decide({ sharesKnownBorder: undefined }))).toBe(false);
  });

  it('stays above the target\'s own consent floor: no proposal at or below the minimum relationship', () => {
    expect(proposesOpenBorders(decide({ relationship: OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP, sharesKnownBorder: true }))).toBe(false);
    expect(proposesOpenBorders(decide({ relationship: OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP + 1, sharesKnownBorder: true }))).toBe(true);
    expect(OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP).toBeGreaterThan(20); // evaluateTreatyConsent's open_borders floor
  });

  it('never proposes what it already has, at war, to an unmet civ, or on top of an alliance proposal', () => {
    const already = [{ type: 'open_borders' as const, civA: 'ai_civ', civB: 'player', turnsRemaining: -1 }];
    expect(proposesOpenBorders(decide({ sharesKnownBorder: true, treaties: already }))).toBe(false);
    expect(proposesOpenBorders(decide({ sharesKnownBorder: true, atWar: true }))).toBe(false);
    expect(proposesOpenBorders(decide({ sharesKnownBorder: true, hasMet: false }))).toBe(false);
    const withAlliance = decide({ relationship: 80, sharesKnownBorder: true });
    expect(withAlliance.some(decision => decision.action === 'alliance')).toBe(true);
    expect(proposesOpenBorders(withAlliance)).toBe(false);
  });
});

// Only the player could ever end a war with a city-state. An AI drawn into one (a coalition declaring on it)
// stayed at war for the rest of the game, which also kept the coalition alive forever.
describe('applyAiMinorCivPeace', () => {
  function atWarWithCityState(seed: string) {
    const state = createNewGame(undefined, seed, 'small');
    const minorCivId = Object.keys(state.minorCivs).find(id => !state.minorCivs[id].isDestroyed)!;
    return { state: setMinorCivWarState(state, 'ai-1', minorCivId, true).state, minorCivId };
  }

  it('makes peace with a city-state it is not trying to conquer', () => {
    const { state, minorCivId } = atWarWithCityState('ai-minor-peace');

    const next = applyAiMinorCivPeace(state, 'ai-1', new Set(), new EventBus());

    expect(isMinorCivAtWar(next, 'ai-1', minorCivId)).toBe(false);
  });

  it('keeps a war its current plan is fighting', () => {
    const { state, minorCivId } = atWarWithCityState('ai-minor-keep-war');

    const next = applyAiMinorCivPeace(state, 'ai-1', new Set([minorCivId]), new EventBus());

    expect(isMinorCivAtWar(next, 'ai-1', minorCivId)).toBe(true);
  });

  it('leaves a vassal at war: its overlord controls war and peace', () => {
    const { state, minorCivId } = atWarWithCityState('ai-minor-vassal');
    state.civilizations['ai-1'].diplomacy.vassalage.overlord = 'player';

    const next = applyAiMinorCivPeace(state, 'ai-1', new Set(), new EventBus());

    expect(isMinorCivAtWar(next, 'ai-1', minorCivId)).toBe(true);
  });
});

// The AI never declared war on a city-state, so it almost never conquered one. Whether it now does depends on
// its personality and posture: only a warlike civ, or one bent on domination, goes after a weak, nearby
// city-state it has discovered, and never while it is fighting another major civilization.
describe('applyAiCityStateWar', () => {
  const WARLIKE: PersonalityTraits = { traits: ['aggressive'], warLikelihood: 0.85, expansionDrive: 0.6, diplomacyFocus: 0.2 };
  const PEACEFUL: PersonalityTraits = { traits: ['diplomatic'], warLikelihood: 0.2, expansionDrive: 0.3, diplomacyFocus: 0.8 };
  const EXPAND = NATIONAL_INTENT_POSTURE.expand;

  function conquestFixture(seed: string): { state: GameState; minorCivId: string } {
    const state = createNewGame(undefined, seed, 'small');
    const minorCivId = Object.keys(state.minorCivs).sort().find(id => !state.minorCivs[id].isDestroyed)!;
    const target = state.cities[state.minorCivs[minorCivId].cityId];
    const site = Object.values(state.map.tiles)
      .filter(tile => tile.terrain !== 'ocean' && tile.terrain !== 'coast' && mapDistance(state.map, tile.coord, target.position) === 5)
      .sort((a, b) => hexKey(a.coord).localeCompare(hexKey(b.coord)))[0];
    const civ = state.civilizations['ai-1'];
    const city = foundCity('ai-1', site.coord, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities = [city.id];
    for (let i = 0; i < 4; i++) {
      const unit = createUnit('warrior', 'ai-1', site.coord, state.idCounters);
      state.units[unit.id] = unit;
      civ.units.push(unit.id);
    }
    civ.techState.completed = getEraAdvancementTechs(1).map(tech => tech.id).concat(getEraAdvancementTechs(2).map(tech => tech.id));
    civ.visibility.tiles[hexKey(target.position)] = 'fog';
    civ.diplomacy.atWarWith = [];
    return { state, minorCivId };
  }

  it('a warlike civ declares war on a weak, nearby, discovered city-state', () => {
    const { state, minorCivId } = conquestFixture('cs-war-warlike');
    const next = applyAiCityStateWar(state, 'ai-1', WARLIKE, EXPAND, new EventBus());
    expect(isMinorCivAtWar(next, 'ai-1', minorCivId)).toBe(true);
  });

  it('a peaceful civ does not, in the same position', () => {
    const { state, minorCivId } = conquestFixture('cs-war-peaceful');
    const next = applyAiCityStateWar(state, 'ai-1', PEACEFUL, EXPAND, new EventBus());
    expect(isMinorCivAtWar(next, 'ai-1', minorCivId)).toBe(false);
  });

  it('a middling civ goes to war only when its posture is set on domination', () => {
    const middling: PersonalityTraits = { traits: [], warLikelihood: 0.55, expansionDrive: 0.5, diplomacyFocus: 0.5 };
    const developing = conquestFixture('cs-war-develop');
    expect(isMinorCivAtWar(applyAiCityStateWar(developing.state, 'ai-1', middling, NATIONAL_INTENT_POSTURE.develop, new EventBus()), 'ai-1', developing.minorCivId)).toBe(false);
    const dominating = conquestFixture('cs-war-dominate');
    expect(isMinorCivAtWar(applyAiCityStateWar(dominating.state, 'ai-1', middling, NATIONAL_INTENT_POSTURE.dominate, new EventBus()), 'ai-1', dominating.minorCivId)).toBe(true);
  });

  it('never targets a city-state it has not discovered', () => {
    const { state, minorCivId } = conquestFixture('cs-war-undiscovered');
    state.civilizations['ai-1'].visibility.tiles = {};
    expect(isMinorCivAtWar(applyAiCityStateWar(state, 'ai-1', WARLIKE, EXPAND, new EventBus()), 'ai-1', minorCivId)).toBe(false);
  });

  it('does not open a second front while at war with a major civilization', () => {
    const { state, minorCivId } = conquestFixture('cs-war-two-fronts');
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    expect(isMinorCivAtWar(applyAiCityStateWar(state, 'ai-1', WARLIKE, EXPAND, new EventBus()), 'ai-1', minorCivId)).toBe(false);
  });

  it('spares a city-state it is allied with, and waits for an army', () => {
    const allied = conquestFixture('cs-war-allied');
    allied.state.minorCivs[allied.minorCivId].chainStatusByCiv['ai-1'] = { chainId: 'chain', status: 'allied', statusTurn: 1, earnedTurn: 1 };
    expect(isMinorCivAtWar(applyAiCityStateWar(allied.state, 'ai-1', WARLIKE, EXPAND, new EventBus()), 'ai-1', allied.minorCivId)).toBe(false);
    const unarmed = conquestFixture('cs-war-unarmed');
    unarmed.state.civilizations['ai-1'].units = unarmed.state.civilizations['ai-1'].units.slice(0, 2);
    expect(isMinorCivAtWar(applyAiCityStateWar(unarmed.state, 'ai-1', WARLIKE, EXPAND, new EventBus()), 'ai-1', unarmed.minorCivId)).toBe(false);
  });

  it('keeps a war it would declare, and makes peace once it would not', () => {
    const { state, minorCivId } = conquestFixture('cs-war-keep');
    const atWar = applyAiCityStateWar(state, 'ai-1', WARLIKE, EXPAND, new EventBus());

    const kept = applyAiMinorCivPeace(atWar, 'ai-1', new Set(), new EventBus(), WARLIKE, EXPAND);
    expect(isMinorCivAtWar(kept, 'ai-1', minorCivId)).toBe(true);

    const ended = applyAiMinorCivPeace(atWar, 'ai-1', new Set(), new EventBus(), PEACEFUL, EXPAND);
    expect(isMinorCivAtWar(ended, 'ai-1', minorCivId)).toBe(false);
  });
});
