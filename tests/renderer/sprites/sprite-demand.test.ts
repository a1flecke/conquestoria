import { describe, expect, it } from 'vitest';
import { collectSpriteDemand } from '@/renderer/sprites/sprite-loader';
import type { GameState } from '@/core/types';

function state(overrides: Partial<Pick<GameState, 'civilizations' | 'units' | 'cities'>>): Pick<GameState, 'civilizations' | 'units' | 'cities'> {
  return {
    civilizations: { player: {}, 'ai-1': {} } as unknown as GameState['civilizations'],
    units: {},
    cities: {},
    ...overrides,
  };
}

const unit = (id: string, owner: string, type: string) => ({ id, owner, type }) as unknown as GameState['units'][string];
const city = (id: string, owner: string, queue: string[]) =>
  ({ id, owner, productionQueue: queue }) as unknown as GameState['cities'][string];

describe('collectSpriteDemand (#1439 phase 5)', () => {
  it('lists each distinct (unit type, owner) once', () => {
    const demand = collectSpriteDemand(state({
      units: {
        u1: unit('u1', 'player', 'warrior'),
        u2: unit('u2', 'player', 'warrior'),
        u3: unit('u3', 'player', 'settler'),
        u4: unit('u4', 'ai-1', 'warrior'),
      },
    }));
    expect(demand).toEqual([
      { id: 'warrior', civId: 'player' },
      { id: 'settler', civId: 'player' },
      { id: 'warrior', civId: 'ai-1' },
    ]);
  });

  it('adds each city production-queue head (any kind) under the city owner, and only the head', () => {
    const demand = collectSpriteDemand(state({
      cities: {
        c1: city('c1', 'player', ['granary', 'warrior']),
        c2: city('c2', 'ai-1', ['great_pyramid']),
        c3: city('c3', 'player', []),
      },
    }));
    expect(demand).toEqual([
      { id: 'granary', civId: 'player' },
      { id: 'great_pyramid', civId: 'ai-1' },
    ]);
  });

  it('skips owners without a palette in the state (barbarians, minor civs, pirates load through their own paths)', () => {
    const demand = collectSpriteDemand(state({
      units: {
        u1: unit('u1', 'barbarian', 'warrior'),
        u2: unit('u2', 'mc-sparta', 'warrior'),
        u3: unit('u3', 'pirates', 'pirate_galley'),
        u4: unit('u4', 'player', 'archer'),
      },
      cities: { c1: city('c1', 'mc-sparta', ['granary']) },
    }));
    expect(demand).toEqual([{ id: 'archer', civId: 'player' }]);
  });

  it('is empty for an empty state', () => {
    expect(collectSpriteDemand(state({}))).toEqual([]);
  });
});
