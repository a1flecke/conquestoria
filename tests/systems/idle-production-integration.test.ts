import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import type { GameState } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeIdleProductionState(idleProduction: 'gold' | 'science' | null): GameState {
  const map = generateMap(20, 20, `idle-integration-${idleProduction ?? 'none'}`);
  const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
  const city = { ...foundCity('player', tile.coord, map, mkC()), productionQueue: [], idleProduction };

  return {
    turn: 1, era: 1, currentPlayer: 'player', hotSeat: false,
    gameOver: false, winner: null, map,
    units: {},
    cities: { [city.id]: city },
    civilizations: {
      player: {
        id: 'player', name: 'Test', color: '#fff', isHuman: true, civType: 'generic',
        cities: [city.id], units: [], gold: 0, score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        visibility: { tiles: {} },
        diplomacy: {
          relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
  } as unknown as GameState;
}

describe('idle production — turn-manager wiring', () => {
  it('increases civ gold when idle city has idleProduction gold', () => {
    const withIdle = processTurn(makeIdleProductionState('gold'), new EventBus());
    const withoutIdle = processTurn(makeIdleProductionState(null), new EventBus());
    expect(withIdle.civilizations['player'].gold).toBeGreaterThan(withoutIdle.civilizations['player'].gold);
  });

  it('increases research progress when idle city has idleProduction science', () => {
    const scienceState = makeIdleProductionState('science');
    scienceState.civilizations['player'].techState.currentResearch = 'fire';
    const withIdle = processTurn(scienceState, new EventBus());

    const noneState = makeIdleProductionState(null);
    noneState.civilizations['player'].techState.currentResearch = 'fire';
    const withoutIdle = processTurn(noneState, new EventBus());

    expect(withIdle.civilizations['player'].techState.researchProgress)
      .toBeGreaterThan(withoutIdle.civilizations['player'].techState.researchProgress);
  });
});
