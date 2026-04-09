import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getAvailableMissions, resolveMissionResult } from '@/systems/espionage-system';

function makeState(): GameState {
  return {
    turn: 12,
    era: 3,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: {
      width: 10,
      height: 10,
      tiles: {
        '2,2': {
          coord: { q: 2, r: 2 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: 'iron',
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Thebes',
        owner: 'ai-1',
        position: { q: 2, r: 2 },
        population: 4,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: ['warrior'],
        productionProgress: 20,
        ownedTiles: [{ q: 2, r: 2 }],
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 1,
        unrestTurns: 2,
        spyUnrestBonus: 10,
      },
    },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [],
        units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null,
          researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { 'ai-1': -30 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
      },
      'ai-1': {
        id: 'ai-1',
        name: 'Opponent',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai'],
        units: [],
        techState: {
          completed: ['archery', 'bronze-working'],
          currentResearch: null,
          researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { player: -30 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
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

describe('espionage stage 3-4 missions', () => {
  it('unlocks stage 3 missions from spy-networks', () => {
    const missions = getAvailableMissions([
      'espionage-scouting',
      'espionage-informants',
      'spy-networks',
    ]);
    expect(missions).toContain('steal_tech');
    expect(missions).toContain('sabotage_production');
    expect(missions).toContain('incite_unrest');
  });

  it('does not unlock stage 3 missions before stage 3 tech', () => {
    const missions = getAvailableMissions([
      'espionage-scouting',
      'espionage-informants',
    ]);
    expect(missions).not.toContain('steal_tech');
    expect(missions).not.toContain('assassinate_advisor');
  });

  it('unlocks stage 4 missions from cryptography', () => {
    const missions = getAvailableMissions([
      'espionage-scouting',
      'espionage-informants',
      'spy-networks',
      'cryptography',
    ]);
    expect(missions).toContain('assassinate_advisor');
    expect(missions).toContain('forge_documents');
    expect(missions).toContain('fund_rebels');
  });

  it('steal_tech returns a tech the target has and the player lacks', () => {
    const state = makeState();
    const result = resolveMissionResult('steal_tech', 'ai-1', 'city-ai', state, 'player', 'spy-1');
    expect(['archery', 'bronze-working']).toContain(result.stolenTechId);
  });

  it('incite_unrest injects 25 unrest pressure', () => {
    const state = makeState();
    const result = resolveMissionResult('incite_unrest', 'ai-1', 'city-ai', state, 'player', 'spy-1');
    expect(result.unrestInjected).toBe(25);
  });

  it('fund_rebels injects more unrest into already unstable cities', () => {
    const state = makeState();
    const result = resolveMissionResult('fund_rebels', 'ai-1', 'city-ai', state, 'player', 'spy-1');
    expect(result.unrestInjected).toBe(35);
  });

  it('fund_rebels does nothing against a stable city', () => {
    const state = makeState();
    state.cities['city-ai'].unrestLevel = 0;
    state.cities['city-ai'].unrestTurns = 0;
    state.cities['city-ai'].spyUnrestBonus = 0;

    const result = resolveMissionResult('fund_rebels', 'ai-1', 'city-ai', state, 'player', 'spy-1');

    expect(result.unrestInjected).toBeUndefined();
  });
});
