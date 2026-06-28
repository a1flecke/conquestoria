import type { EventBus } from '@/core/event-bus';
import { appendNotification } from '@/core/notification-log';
import type { GameState } from '@/core/types';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { clearCompletedWorkerTasksForImprovement } from '@/systems/worker-action-system';

export function processImprovementTurns(state: GameState, bus: EventBus): GameState {
  let next = structuredClone(state);
  for (const [key, tile] of Object.entries(next.map.tiles)) {
    if (tile.improvementTurnsLeft <= 0) continue;
    tile.improvementTurnsLeft -= 1;
    if (tile.improvementTurnsLeft > 0) continue;

    const owner = tile.improvementOwner;
    const label = getImprovementDisplayName(tile.improvement);
    bus.emit('improvement:completed', {
      coord: { ...tile.coord },
      type: tile.improvement,
    });
    next = clearCompletedWorkerTasksForImprovement(next, tile.coord);
    const completedTile = next.map.tiles[key]!;
    if (owner) {
      appendNotification(next, owner, {
        message: `${label} completed!`,
        type: 'success',
        turn: next.turn,
        target: {
          kind: 'map',
          coord: { ...completedTile.coord },
          label,
        },
      });
      completedTile.improvementOwner = undefined;
    }
  }
  return next;
}
