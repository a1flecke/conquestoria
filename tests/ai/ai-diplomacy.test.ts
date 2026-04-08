import { describe, it, expect } from 'vitest';
import { evaluateDiplomacy, evaluateMinorCivDiplomacy } from '@/ai/ai-diplomacy';
import type { PersonalityTraits, GameState, MinorCivState, DiplomacyState } from '@/core/types';

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
      { player: 10 },
      100,
      1,
      { player: { hasMet: false, hasBorderPressure: false } },
    );

    expect(decisions.find(d => d.action === 'declare_war')).toBeUndefined();
  });
});
