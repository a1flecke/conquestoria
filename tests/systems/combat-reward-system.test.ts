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
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import type { CombatResult, GameState } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('combat-reward-system', () => {
  it('maps experience to named veterancy tiers and next thresholds', () => {
    const recruit = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
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
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());

    expect(getVeterancyCombatModifier({ ...unit, experience: 0 })).toBe(0);
    expect(getVeterancyCombatModifier({ ...unit, experience: 10 })).toBe(0.05);
    expect(getVeterancyCombatModifier({ ...unit, experience: 25 })).toBe(0.1);
    expect(getVeterancyCombatModifier({ ...unit, experience: 50 })).toBe(0.15);
  });

  it('calculates deterministic combat spoils for the same seed', () => {
    const victor = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'winner', health: 44 };
    const defeated = { ...createUnit('warrior', 'barbarian', { q: 1, r: 0 }, mkC()), id: 'fallen' };

    const first = calculateDefeatReward({ victor, defeated, seed: 64 });
    const second = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(first).toEqual(second);
    expect(first.experienceAwarded).toBeGreaterThanOrEqual(8);
    expect(first.healthRestored).toBeGreaterThan(0);
    expect(first.goldAwarded).toBeGreaterThan(0);
  });

  it('gives reduced rewards for defeating non-combat units', () => {
    const victor = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'winner', health: 60 };
    const defeated = { ...createUnit('settler', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'settler' };

    const reward = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(reward.experienceAwarded).toBe(3);
    expect(reward.goldAwarded).toBe(1);
    expect(reward.surprise).toBeNull();
  });

  it('does not report gold rewards for victors without a gold ledger', () => {
    const victor = { ...createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC()), id: 'winner', health: 60 };
    const defeated = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'fallen' };

    const reward = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(reward.goldAwarded).toBe(0);
  });

  it('does not report ordinary civilization gold for pirate victors', () => {
    const victor = { ...createUnit('warrior', 'pirate-7', { q: 0, r: 0 }, mkC()), id: 'winner', health: 60 };
    const defeated = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'fallen' };

    const reward = calculateDefeatReward({ victor, defeated, seed: 64 });

    expect(reward.experienceAwarded).toBeGreaterThan(0);
    expect(reward.goldAwarded).toBe(0);
  });

  it('collects a reward for the surviving attacker when the defender dies', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker', health: 50 };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender' };
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

  it('collects a reward for the surviving defender when the attacker dies', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker' };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender', health: 50 };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 100,
      defenderDamage: 12,
      attackerSurvived: false,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const rewards = collectCombatRewards(result, attacker, defender, 64);

    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
      recipientUnitId: 'defender',
      recipientCivId: 'ai-1',
      defeatedUnitId: 'attacker',
    });
  });

  it('collects no reward when both units die', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker' };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender' };
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
  const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker', health: 40 };
  const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender', health: 1 };
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
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

describe('applyCombatOutcomeToState', () => {
  it.each([
    ['player', 'ai-1'],
    ['ai-1', 'player'],
  ])('records a %s attack in the defending major civilization history', (attackerOwner, defenderOwner) => {
    const state = makeRewardState();
    state.units.attacker.owner = attackerOwner;
    state.units.defender.owner = defenderOwner;
    state.civilizations.player.units = attackerOwner === 'player' ? ['attacker'] : ['defender'];
    state.civilizations['ai-1'].units = attackerOwner === 'ai-1' ? ['attacker'] : ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 5,
      defenderDamage: 5,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.civilizations[defenderOwner].diplomacy.events).toContainEqual({
      type: 'military_attacked',
      turn: state.turn,
      otherCiv: attackerOwner,
      weight: 1,
    });
  });

  it('does not create major-civilization attack history for world actors', () => {
    const state = makeRewardState();
    state.units.attacker.owner = 'barbarian';
    state.civilizations.player.units = [];
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 5,
      defenderDamage: 5,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.civilizations['ai-1'].diplomacy.events)
      .not.toContainEqual(expect.objectContaining({ type: 'military_attacked' }));
  });

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

  it('records an attributed hostile defeat at the combat mutation source', () => {
    const state = makeRewardState();
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
      diplomacy: { ...state.civilizations.player.diplomacy, relationships: { player: 0 } },
      activeQuests: {
        player: {
          id: 'quest-defeat', type: 'defeat_units', description: 'Defeat one enemy',
          target: { type: 'defeat_units', count: 1, nearPosition: { q: 1, r: 0 }, radius: 3 },
          reward: { relationshipBonus: 10 }, progress: 0, status: 'active',
          turnIssued: state.turn, expiresOnTurn: state.turn + 20,
        },
      },
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 10, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.questTransitions.some(transition => transition.type === 'completed')).toBe(true);
    expect(applied.state.minorCivs['mc-sparta'].activeQuests.player).toBeUndefined();
  });

  it('restores victory health from the survivor post-combat health', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, health: 100 };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 20,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.rewards[0]?.healthRestored).toBe(8);
    expect(applied.state.units.attacker.health).toBe(88);
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

  it('surviving attacker has hasActed set to true after combat', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker', health: 80 };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender', health: 80 };

    const minimalState = {
      units: { attacker, defender },
      civilizations: {
        player: { units: ['attacker'] },
        'ai-1': { units: ['defender'] },
      },
    } as unknown as import('@/core/types').GameState;

    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 10,
      defenderDamage: 20,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(minimalState, result, 42);
    const updatedAttacker = applied.state.units['attacker'];
    expect(updatedAttacker?.hasActed).toBe(true);
    expect(updatedAttacker?.movementPointsLeft).toBe(0);
  });

  it('surviving attacker who is destroyed does not appear in the updated unit map', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker', health: 10 };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender', health: 80 };

    const minimalState = {
      units: { attacker, defender },
      civilizations: {
        player: { units: ['attacker'] },
        'ai-1': { units: ['defender'] },
      },
    } as unknown as import('@/core/types').GameState;

    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 100,
      defenderDamage: 5,
      attackerSurvived: false,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(minimalState, result, 42);
    expect(applied.state.units['attacker']).toBeUndefined();
    expect(applied.attackerDefeated).toBe(true);
  });

  it('removes loaded cargo when a Transport is destroyed in combat', () => {
    const state = makeRewardState();
    const transport = {
      ...createUnit('transport', 'ai-1', { q: 1, r: 0 }, mkC()),
      id: 'transport',
      cargoUnitIds: ['cargo'],
    };
    const cargo = {
      ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()),
      id: 'cargo',
      transportId: 'transport',
    };
    state.units = {
      attacker: state.units.attacker,
      transport,
      cargo,
    };
    state.civilizations['ai-1'].units = ['transport', 'cargo'];
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'transport',
      attackerDamage: 0,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.transport).toBeUndefined();
    expect(applied.state.units.cargo).toBeUndefined();
    expect(applied.state.civilizations['ai-1'].units).toEqual([]);
  });

  it('breaks tribute as soon as its payer attacks that pirate faction', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, owner: 'pirate-1' };
    state.civilizations['ai-1'].units = [];
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding',
      maritimeStage: 3, notoriety: 2, shipIds: ['defender'],
      headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 3 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: { player: { paidRound: 1, protectedUntilRound: 30 } },
      demandByCiv: {}, contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
    } satisfies PirateFactionState;
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 5, defenderDamage: 5,
      attackerSurvived: true, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.pirates!.factions['pirate-1'].tributeByCiv.player).toBeUndefined();
  });

  it('destroys a deep-sea faction once when its flagship sinks and awards the headquarters bounty', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, owner: 'pirate-1', type: 'pirate_frigate' };
    state.civilizations['ai-1'].units = [];
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding',
      maritimeStage: 3, notoriety: 2, shipIds: ['defender'],
      headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: 'defender', relocation: { planned: null, lastRelocatedRound: null } },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    } satisfies PirateFactionState;
    const beforeGold = state.civilizations.player.gold;
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 5, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.pirates!.factions['pirate-1']).toBeUndefined();
    expect(applied.state.pirates!.history.filter(entry => entry.kind === 'destroyed')).toHaveLength(1);
    expect(applied.pirateEvents.filter(event => event.type === 'faction-destroyed')).toHaveLength(1);
    expect(applied.state.civilizations.player.gold).toBeGreaterThan(beforeGold + 39);
  });

  it('does not grant ordinary combat rewards to a pirate victor', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, owner: 'pirate-1', type: 'pirate_galley', health: 40 };
    state.civilizations.player.units = [];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 10, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.rewards).toEqual([]);
    expect(applied.state.units.attacker.experience).toBe(0);
    expect(applied.state.units.attacker.health).toBe(30);
  });
});
