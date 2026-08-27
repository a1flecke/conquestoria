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

  it('delivers Fort completion only to its owner during a hot-seat turn', () => {
    const state = createNewGame(undefined, 'fort-hot-seat-completion', 'small');
    const worker = Object.values(state.units)[0]!;
    const tile = state.map.tiles[hexKey(worker.position)]!;
    state.currentPlayer = 'player';
    tile.improvement = 'fort';
    tile.improvementTurnsLeft = 1;
    tile.improvementOwner = worker.owner;
    worker.workerTask = { action: 'fort', coord: { ...tile.coord } };

    const next = processImprovementTurns(state, new EventBus());

    expect(next.notificationLog?.[worker.owner]?.at(-1)?.message).toBe('Fort completed!');
    expect(next.notificationLog?.player ?? []).toHaveLength(worker.owner === 'player' ? 1 : 0);
  });

  it('records a completed Fort against the territory that owned it at the completion transition', () => {
    const state = createNewGame(undefined, 'fort-history-completion', 'small');
    const city = Object.values(state.cities)[0]!;
    const worker = Object.values(state.units).find(unit => unit.owner === city.owner)!;
    const tile = state.map.tiles[hexKey(city.ownedTiles[1] ?? city.ownedTiles[0]!)]!;
    tile.improvement = 'fort';
    tile.improvementTurnsLeft = 1;
    tile.improvementOwner = worker.owner;

    const next = processImprovementTurns(state, new EventBus());

    expect(next.legendaryWonderHistory?.militaryFacts).toContainEqual({
      id: `fort-completed:${state.turn}:${worker.owner}:${tile.coord.q},${tile.coord.r}`,
      kind: 'fort-completed', civId: worker.owner, cityId: city.id, position: tile.coord, turn: state.turn,
    });
  });
});
