import { describe, expect, it } from 'vitest';
import { checkDominationVictory } from '@/systems/victory-system';
import type { GameState } from '@/core/types';

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
    visibility: {},
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
