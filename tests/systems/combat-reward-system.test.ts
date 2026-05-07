import { describe, expect, it } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import {
  applyCombatOutcomeToState,
  calculateDefeatReward,
  collectCombatRewards,
  getExperienceToNextTier,
  getVeterancyCombatModifier,
  getVeterancyTier,
} from '@/systems/combat-reward-system';
import type { CombatResult, GameState } from '@/core/types';

describe('combat-reward-system', () => {
  it('maps experience to named veterancy tiers and next thresholds', () => {
    const recruit = createUnit('warrior', 'player', { q: 0, r: 0 });
    const seasoned = { ...recruit, experience: 10 };
    const veteran = { ...recruit, experience: 25 };
    const elite = { ...recruit, experience: 50 };

    expect(getVeterancyTier(recruit)).toMatchObject({ id: 'recruit', label: 'Recruit' });
    expect(getVeterancyTier(seasoned)).toMatchObject({ id: 'seasoned', label: 'Seasoned' });
    expect(getVeterancyTier(veteran)).toMatchObject({ id: 'veteran', label: 'Veteran' });
    expect(getVeterancyTier(elite)).toMatchObject({ id: 'elite', label: 'Elite' });
    expect(getExperienceToNextTier(recruit)).toBe(10);
    expect(getExperienceToNextTier(seasoned)).toBe(15);
    expect(getExperienceToNextTier(veteran)).toBe(25);
    expect(getExperienceToNextTier(elite)).toBeNull();
  });

  it('converts veterancy tiers into small combat modifiers', () => {
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 });

    expect(getVeterancyCombatModifier({ ...unit, experience: 0 })).toBe(0);
    expect(getVeterancyCombatModifier({ ...unit, experience: 10 })).toBe(0.05);
    expect(getVeterancyCombatModifier({ ...unit, experience: 25 })).toBe(0.1);
    expect(getVeterancyCombatModifier({ ...unit, experience: 50 })).toBe(0.15);
  });

  it('calculates deterministic combat spoils for the same seed', () => {
    const victor = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'winner', health: 44 };
    const defeated = { ...createUnit('warrior', 'barbarian', { q: 1, r: 0 }), id: 'fallen' };

    const first = calculateDefeatReward({ victor, defeated, seed: 64 });
    const second = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(first).toEqual(second);
    expect(first.experienceAwarded).toBeGreaterThanOrEqual(8);
    expect(first.healthRestored).toBeGreaterThan(0);
    expect(first.goldAwarded).toBeGreaterThan(0);
  });

  it('gives reduced rewards for defeating non-combat units', () => {
    const victor = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'winner', health: 60 };
    const defeated = { ...createUnit('settler', 'ai-1', { q: 1, r: 0 }), id: 'settler' };

    const reward = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(reward.experienceAwarded).toBe(3);
    expect(reward.goldAwarded).toBe(1);
    expect(reward.surprise).toBeNull();
  });

  it('collects a reward for the surviving attacker when the defender dies', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'attacker', health: 50 };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }), id: 'defender' };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 12,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const rewards = collectCombatRewards(result, attacker, defender, 64);

    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
      recipientUnitId: 'attacker',
      recipientCivId: 'player',
      defeatedUnitId: 'defender',
    });
  });

  it('collects no reward when both units die', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'attacker' };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }), id: 'defender' };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 100,
      defenderDamage: 100,
      attackerSurvived: false,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    expect(collectCombatRewards(result, attacker, defender, 64)).toEqual([]);
  });
});

function makeRewardState(): GameState {
  const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'attacker', health: 40 };
  const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }), id: 'defender', health: 1 };
  return {
    turn: 3,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} },
    units: { attacker, defender },
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#fff',
        isHuman: true,
        civType: 'rome',
        cities: [],
        units: ['attacker'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'egypt',
        cities: [],
        units: ['defender'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as GameState;
}

describe('applyCombatOutcomeToState', () => {
  it('removes the defeated unit, spends the attacker, and applies XP, healing, and gold', () => {
    const state = makeRewardState();
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 10,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.defender).toBeUndefined();
    expect(applied.state.civilizations['ai-1'].units).toEqual([]);
    expect(applied.state.units.attacker.experience).toBeGreaterThan(0);
    expect(applied.state.units.attacker.health).toBeGreaterThan(30);
    expect(applied.state.units.attacker.movementPointsLeft).toBe(0);
    expect(applied.state.units.attacker.hasMoved).toBe(true);
    expect(applied.state.civilizations.player.gold).toBeGreaterThan(0);
    expect(applied.rewards[0]?.message).toMatch(/Combat reward/);
  });

  it('does not award civilization gold to barbarian victors without a civ ledger', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, owner: 'barbarian' };
    state.civilizations.player.units = [];
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 0,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.attacker.experience).toBeGreaterThan(0);
    expect(applied.state.civilizations.player.gold).toBe(0);
  });
});
