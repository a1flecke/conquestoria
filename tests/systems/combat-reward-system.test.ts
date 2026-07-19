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
import { selectDefenderForAttack } from '@/systems/combat-system';

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
  it('destroys aircraft based on a carrier that combat removes', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'warrior', owner: 'player' };
    const carrier = { ...state.units.defender, id: 'carrier', type: 'carrier' as const, owner: 'ai-1' };
    state.units = { attacker: state.units.attacker, carrier, based: { ...carrier, id: 'based', type: 'biplane', airBase: { kind: 'carrier', unitId: 'carrier' } } };
    state.civilizations['ai-1'].units = ['carrier', 'based'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'carrier', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false, attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.based).toBeUndefined();
    expect(applied.state.civilizations['ai-1'].units).not.toContain('based');
  });

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

  it('records the killer civ on a Hunt crisis (MR3) when its beast defender is defeated', () => {
    const state = makeRewardState();
    state.units.defender.owner = 'beasts';
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'ai-1',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'defender', foeName: 'Test Beast',
      },
    };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 5,
      defenderDamage: 5,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);
    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.activeCrises!['crisis-1'].lastHuntKillerCivId).toBe('player');
  });

  it('does not attribute a hunt kill to a non-major-civ killer (e.g. a barbarian), leaving lastHuntKillerCivId unset so the target-civ fallback still applies at resolution', () => {
    const state = makeRewardState();
    state.units.attacker.owner = 'barbarian';
    state.units.defender.owner = 'beasts';
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'ai-1',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'defender', foeName: 'Test Beast',
      },
    };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 5,
      defenderDamage: 5,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);
    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.activeCrises!['crisis-1'].lastHuntKillerCivId).toBeUndefined();
  });

  it('does not record hunt-killer attribution for an ordinary (non-hunt) unit kill', () => {
    const state = makeRewardState();
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'ai-1',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'some-other-unit', foeName: 'Test Beast',
      },
    };
    const result: CombatResult = {
      attackerId: 'attacker',
      defenderId: 'defender',
      attackerDamage: 5,
      defenderDamage: 5,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);
    expect(applied.state.activeCrises!['crisis-1'].lastHuntKillerCivId).toBeUndefined();
  });

  it('records a recent aggressor in minor-civ diplomacy at the combat source', () => {
    const state = makeRewardState();
    state.units.defender.owner = 'mc-test';
    state.civilizations['ai-1'].units = [];
    state.minorCivs['mc-test'] = {
      id: 'mc-test',
      definitionId: 'sparta',
      cityId: 'minor-city',
      units: ['defender'],
      diplomacy: {
        relationships: { player: -50 },
        treaties: [],
        events: [],
        atWarWith: ['player'],
      },
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    } as never;
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

    expect(applied.state.minorCivs['mc-test'].diplomacy.events).toContainEqual({
      type: 'military_attacked',
      turn: state.turn,
      otherCiv: 'player',
      weight: 1,
    });
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

  it('destroys (never captures) a civilian defeated by a barbarian — barbarian has no civilizations[] entry (#541 second-pass review)', () => {
    // 'barbarian' is not a key in state.civilizations (classifyOwner routes it separately).
    // Before this fix, the capture branch unconditionally wrote
    // civilizations['barbarian'] = { ...undefined, units: [...] } — a malformed partial
    // civ object missing every required field (cities, techState, diplomacy, ...), which
    // crashes the first downstream code that iterates Object.values(state.civilizations)
    // assuming complete civ objects (e.g. getCrisisEligibleCivIds's civ.cities.length).
    // Barbarians raiding workers/caravans (their core raid behavior, see barbarian-system.ts)
    // makes this the single most common combat outcome in the game — this must destroy, not
    // silently corrupt state.
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, owner: 'barbarian' };
    state.units.defender = { ...state.units.defender, type: 'worker', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(false);
    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.units.defender).toBeUndefined();
    expect(applied.state.civilizations.barbarian).toBeUndefined();
  });

  it('destroys (never captures) a civilian defeated by a minor civ — minor civs track units in state.minorCivs, not state.civilizations (#541 second-pass review)', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, owner: 'mc-sparta' };
    state.units.defender = { ...state.units.defender, type: 'worker', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: ['attacker'],
      diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(false);
    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.units.defender).toBeUndefined();
    expect(applied.state.civilizations['mc-sparta']).toBeUndefined();
  });

  it('still counts a captured (not destroyed) civilian toward a defeat_units quest (#541 second-pass review)', () => {
    // eligibleHostileUnits (quest-objective-system.ts) treats any hostile unit as a valid
    // defeat_units target, civilians included. Capture sets defenderActuallyDefeated to
    // false, so without this the quest silently stops progressing whenever the player
    // captures rather than kills — a real regression the capture generalization exposed.
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'worker', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
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
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(true);
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

  it('captures an unescorted worker instead of destroying it, transferring civ.units[] both ways', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'worker', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(false);
    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units.defender.owner).toBe('player');
    expect(applied.state.units.defender.type).toBe('worker');
    expect(applied.state.civilizations.player.units).toContain('defender');
    expect(applied.state.civilizations['ai-1'].units).not.toContain('defender');
  });

  it('downgrades a captured settler to worker, keeping health/hasActed unchanged from before combat', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'settler', owner: 'ai-1', health: 77, hasActed: false };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.defender.type).toBe('worker');
    expect(applied.state.units.defender.health).toBe(77);
    expect(applied.state.units.defender.hasActed).toBe(false);
  });

  it('keeps a captured caravan as a caravan (no type downgrade beyond settler)', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'caravan', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.defender.type).toBe('caravan');
    expect(applied.defenderCaptured).toBe(true);
  });

  it('captures a losing attacker civilian too (attacker-loses side), mirroring the defender side', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'worker', owner: 'player' };
    state.civilizations.player.units = ['attacker'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 100, defenderDamage: 0,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.attackerDefeated).toBe(false);
    expect(applied.attackerCaptured).toBe(true);
    expect(applied.state.units.attacker.owner).toBe('ai-1');
  });

  it('captures an empty naval-civilian transport instead of sinking it', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'transport', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units.defender.owner).toBe('player');
  });

  it('still destroys (never captures) a naval-civilian transport that is currently carrying cargo', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'transport', owner: 'ai-1', cargoUnitIds: ['cargo-1'] };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(false);
    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.units.defender).toBeUndefined();
  });

  it('still destroys a defeated combat unit — capture only applies to civilian-class units', () => {
    const state = makeRewardState();
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.defenderCaptured).toBe(false);
    expect(applied.state.units.defender).toBeUndefined();
  });
});

describe('escort protection (civilian capture precondition)', () => {
  it("never selects an unescorted civilian's escort — the combat unit always defends the stack", () => {
    const civilian = { ...createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'civilian' };
    const escort = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'escort' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const defender = selectDefenderForAttack([civilian, escort], map);

    expect(defender?.id).toBe('escort');
  });

  it('selects the civilian only when it is alone on its tile', () => {
    const civilian = { ...createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'civilian' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const defender = selectDefenderForAttack([civilian], map);

    expect(defender?.id).toBe('civilian');
  });
});
