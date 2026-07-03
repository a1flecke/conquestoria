import { describe, it, expect } from 'vitest';
import { processAITurn } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

function makeBeastState(overrides: {
  aiUnitType?: string;
  aiUnitHealth?: number;
  beastType?: string;
  beastHealth?: number;
  contestsBeasts?: boolean;
} = {}): GameState {
  const {
    aiUnitType = 'warrior',
    aiUnitHealth = 100,
    beastType = 'beast_boar',
    beastHealth = 100,
    contestsBeasts,
  } = overrides;

  return {
    turn: 5,
    era: 1,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'forest',    elevation: 'lowland', resource: null, improvement: 'none', owner: null,   improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {
      'ai-warrior': {
        id: 'ai-warrior', type: aiUnitType as any, owner: 'ai-1',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: aiUnitHealth,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
      'beast-1': {
        id: 'beast-1', type: beastType as any, owner: 'beasts',
        position: { q: 1, r: 0 }, movementPointsLeft: 0, health: beastHealth,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    },
    cities: {
      'city-ai': {
        id: 'city-ai', name: 'Rome', owner: 'ai-1', position: { q: 0, r: 0 },
        population: 3, food: 0, foodNeeded: 10, buildings: [],
        productionQueue: [], productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }], workedTiles: [], focus: 'balanced',
        maturity: 'outpost', grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1', name: 'Rome', color: '#900', isHuman: false, civType: 'rome',
        cities: ['city-ai'], units: ['ai-warrior'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 } },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false,
      musicVolume: 0, sfxVolume: 0, tutorialEnabled: false,
      advisorsEnabled: {} as any, councilTalkLevel: 'normal',
      ...(contestsBeasts !== undefined ? { aiContestsBeasts: contestsBeasts } : {}),
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

describe('AI vs beasts', () => {
  it('never attacks a beast when aiContestsBeasts is false (default)', () => {
    const state = makeBeastState({ aiUnitType: 'warrior', beastType: 'beast_boar' });
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', p => combatEvents.push(p));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
    expect(state.units['beast-1']).toBeDefined();
  });

  it('keeps beasts out of the feature-enabled strategic path by default', () => {
    const state = makeBeastState({
      aiUnitType: 'swordsman',
      beastType: 'beast_boar',
      beastHealth: 20,
    });
    state.civilizations['ai-1'].visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
    };
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', payload => combatEvents.push(payload));

    const result = processAITurn(state, 'ai-1', bus, {
      purposefulAIEnabled: true,
    });

    expect(combatEvents).toHaveLength(0);
    expect(result.units['beast-1']).toBeDefined();
    expect(
      Object.values(
        result.opponentAI?.majorCivs['ai-1']?.defensePlansByCityId ?? {},
      ),
    ).toHaveLength(0);
  });

  it('attacks an adjacent beast when enabled AND local strength advantage >= 1.5x', () => {
    // swordsman (str 25, health 100) vs badly wounded boar (str 18, health 20)
    // myStrength = 25; beastStrength = 18 * 0.2 = 3.6; 25 >= 3.6 * 1.5 → attack
    const state = makeBeastState({
      aiUnitType: 'swordsman', aiUnitHealth: 100,
      beastType: 'beast_boar', beastHealth: 20,
      contestsBeasts: true,
    });
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', p => combatEvents.push(p));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(1);
  });

  it('does not attack when enabled but the beast is too strong (< 1.5x advantage)', () => {
    // warrior (str 10) vs full-health basilisk (str 30)
    // myStrength = 10; beastStrength = 30; 10 < 30 * 1.5 = 45 → skip
    const state = makeBeastState({
      aiUnitType: 'warrior', aiUnitHealth: 100,
      beastType: 'beast_basilisk', beastHealth: 100,
      contestsBeasts: true,
    });
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', p => combatEvents.push(p));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
  });
});
