import { describe, expect, it } from 'vitest';
import { checkDominationVictory } from '@/systems/victory-system';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { collectUsedCityNames } from '@/systems/city-name-system';
import type { GameState } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeMinimalCiv(id: string, cityIds: string[]) {
  return {
    id,
    name: id,
    color: '#fff',
    isHuman: id === 'player',
    civType: 'generic',
    cities: cityIds,
    units: [],
    techState: {
      completed: [],
      currentResearch: null,
      researchQueue: [],
      researchProgress: 0,
      trackPriorities: {
        military: 'medium', economy: 'medium', science: 'medium', civics: 'medium',
        exploration: 'medium', agriculture: 'medium', medicine: 'medium', philosophy: 'medium',
        arts: 'medium', maritime: 'medium', metallurgy: 'medium', construction: 'medium',
        communication: 'medium', espionage: 'medium', spirituality: 'medium',
      } as const,
    },
    gold: 0,
    visibility: { tiles: {} },
    score: 0,
    diplomacy: {
      relationships: {},
      treaties: [],
      events: [],
      atWarWith: [],
      treacheryScore: 0,
      vassalage: {
        overlord: null,
        vassals: [],
        protectionScore: 100,
        protectionTimers: [],
        peakCities: 0,
        peakMilitary: 0,
      },
    },
  };
}

function makeState(civEntries: [string, string[]][]): GameState {
  const civilizations: GameState['civilizations'] = {};
  for (const [id, cityIds] of civEntries) {
    civilizations[id] = makeMinimalCiv(id, cityIds) as GameState['civilizations'][string];
  }
  return { civilizations } as unknown as GameState;
}

describe('checkDominationVictory', () => {
  it('returns null when 2 major civs each have cities', () => {
    const state = makeState([['player', ['city-1']], ['ai-1', ['city-2']]]);
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('returns winner id when exactly one major civ has cities', () => {
    const state = makeState([['player', ['city-1']], ['ai-1', []]]);
    expect(checkDominationVictory(state)).toBe('player');
  });

  it('returns null when no major civ has cities', () => {
    const state = makeState([['player', []], ['ai-1', []]]);
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('returns null when only one major civ exists (no rival to eliminate)', () => {
    const state = makeState([['player', ['city-1']]]);
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('returns winner id when all 3 civs are present and 2 rivals have no cities', () => {
    const state = makeState([
      ['player', ['city-1', 'city-2']],
      ['ai-1', []],
      ['ai-2', []],
    ]);
    expect(checkDominationVictory(state)).toBe('player');
  });
});

describe('processTurn victory wiring', () => {
  it('sets gameOver and winner when only one civ has cities', () => {
    const state = createNewGame('egypt', 'test-victory-seed');

    const settler = Object.values(state.units).find(
      u => u.owner === 'player' && u.type === 'settler',
    );
    const pos = settler?.position ?? { q: 5, r: 5 };
    const city = foundCity('player', pos, state.map, mkC(), {
      civType: 'egypt',
      usedNames: collectUsedCityNames(state),
    });
    state.cities[city.id] = city;
    state.civilizations['player']!.cities = [city.id];
    state.civilizations['ai-1']!.cities = [];

    const bus = new EventBus();
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe('player');
    expect(result.gameOverReason).toBe('domination');
  });

  it('does NOT set gameOver when both civs have cities', () => {
    const state = createNewGame('egypt', 'test-no-victory-seed');

    const playerSettler = Object.values(state.units).find(
      u => u.owner === 'player' && u.type === 'settler',
    );
    const playerPos = playerSettler?.position ?? { q: 2, r: 2 };
    const playerCity = foundCity('player', playerPos, state.map, mkC(), {
      civType: 'egypt',
      usedNames: collectUsedCityNames(state),
    });
    state.cities[playerCity.id] = playerCity;
    state.civilizations['player']!.cities = [playerCity.id];

    const aiSettler = Object.values(state.units).find(
      u => u.owner === 'ai-1' && u.type === 'settler',
    );
    const aiPos = aiSettler?.position ?? { q: 10, r: 10 };
    const aiCiv = state.civilizations['ai-1'];
    const aiCity = foundCity('ai-1', aiPos, state.map, mkC(), {
      civType: aiCiv?.civType ?? 'generic',
      usedNames: collectUsedCityNames(state),
    });
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1']!.cities = [aiCity.id];

    const bus = new EventBus();
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(false);
    expect(result.winner).toBeNull();
  });
});
