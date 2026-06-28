import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { hexKey } from '@/systems/hex-utils';

describe('processImprovementTurns', () => {
  it('completes improvements immutably, clears worker work, logs, and emits once', () => {
    const state = createNewGame(undefined, 'improvement-round', 'small');
    const worker = Object.values(state.units)[0]!;
    worker.type = 'worker';
    const tile = state.map.tiles[hexKey(worker.position)]!;
    tile.improvement = 'farm';
    tile.improvementTurnsLeft = 1;
    tile.improvementOwner = 'player';
    worker.workerTask = { action: 'farm', coord: { ...tile.coord } };
    const before = structuredClone(state);
    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('improvement:completed', completed);

    const next = processImprovementTurns(state, bus);

    expect(next).not.toBe(state);
    expect(state).toEqual(before);
    expect(next.map.tiles[hexKey(tile.coord)]?.improvementTurnsLeft).toBe(0);
    expect(next.map.tiles[hexKey(tile.coord)]?.improvementOwner).toBeUndefined();
    expect(next.units[worker.id]?.workerTask).toBeUndefined();
    expect(next.notificationLog?.player.at(-1)?.message).toBe('Farm completed!');
    expect(completed).toHaveBeenCalledOnce();
  });
});
