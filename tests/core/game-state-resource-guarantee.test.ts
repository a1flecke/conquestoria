import { beforeEach, describe, expect, it, vi } from 'vitest';

const guaranteeStartResourcesMock = vi.hoisted(() => vi.fn());

vi.mock('@/systems/map-generator', async importOriginal => {
  const actual = await importOriginal<typeof import('@/systems/map-generator')>();
  return {
    ...actual,
    guaranteeStartResources: (
      ...args: Parameters<typeof actual.guaranteeStartResources>
    ): ReturnType<typeof actual.guaranteeStartResources> => {
      guaranteeStartResourcesMock(...args);
      return actual.guaranteeStartResources(...args);
    },
  };
});

import { createHotSeatGame, createNewGame } from '@/core/game-state';

describe('game-state resource guarantees', () => {
  beforeEach(() => {
    guaranteeStartResourcesMock.mockClear();
  });

  it('wires start-resource guarantees into solo game creation', () => {
    const state = createNewGame({
      civType: 'egypt',
      seed: 'resource-guarantee-solo-wire',
      mapSize: 'small',
      opponentCount: 2,
      mapScript: 'procedural',
      gameTitle: 'Resource Guarantee Solo',
    });

    expect(guaranteeStartResourcesMock).toHaveBeenCalledTimes(1);
    const [map, startPositions, rng] = guaranteeStartResourcesMock.mock.calls[0];
    expect(map).toBe(state.map);
    expect(startPositions).toHaveLength(Object.keys(state.civilizations).length);
    expect(typeof rng).toBe('function');
  });

  it('wires start-resource guarantees into hot-seat game creation', () => {
    const state = createHotSeatGame({
      playerCount: 3,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
        { name: 'AI Greece', slotId: 'ai-1', civType: 'greece', isHuman: false },
      ],
      mapScript: 'procedural',
    }, 'resource-guarantee-hotseat-wire');

    expect(guaranteeStartResourcesMock).toHaveBeenCalledTimes(1);
    const [map, startPositions, rng] = guaranteeStartResourcesMock.mock.calls[0];
    expect(map).toBe(state.map);
    expect(startPositions).toHaveLength(Object.keys(state.civilizations).length);
    expect(typeof rng).toBe('function');
  });
});
