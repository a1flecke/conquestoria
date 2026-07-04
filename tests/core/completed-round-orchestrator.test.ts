import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';

describe('runCompletedRound', () => {
  it('threads immutable completed-round phases in canonical order', () => {
    const state = createNewGame(undefined, 'round-order', 'small');
    const trace: string[] = [];
    const result = runCompletedRound(state, new EventBus(), {
      improvements: (current, bus) => {
        trace.push('improvements');
        bus.emit('turn:start', { turn: current.turn, playerId: 'player' });
        return { ...current, gameTitle: 'improved' };
      },
      majors: current => {
        trace.push('ai');
        return { ...current, gameTitle: `${current.gameTitle}-ai` };
      },
      world: current => {
        trace.push('world');
        return { ...current, turn: current.turn + 1 };
      },
      postprocess: (before, current) => {
        trace.push(`post:${before.turn}`);
        return current;
      },
    });

    expect(trace).toEqual(['improvements', 'ai', 'world', 'post:1']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.turn).toBe(2);
      expect(result.state.gameTitle).toBe('improved-ai');
    }
    expect(state.turn).toBe(1);
    expect(state.gameTitle).not.toBe('improved-ai');
  });

  it.each(['improvements', 'majors', 'world', 'postprocess'] as const)(
    'restores the untouched input and discards events when %s throws',
    failingPhase => {
      const state = createNewGame(undefined, `round-failure-${failingPhase}`, 'small');
      const phases = {
        improvements: (current: typeof state, bus: EventBus) => {
          bus.emit('turn:start', { turn: current.turn, playerId: 'player' });
          if (failingPhase === 'improvements') throw new Error('failed');
          return { ...current, turn: 20 };
        },
        majors: (current: typeof state) => {
          if (failingPhase === 'majors') throw new Error('failed');
          return { ...current, turn: 30 };
        },
        world: (current: typeof state) => {
          if (failingPhase === 'world') throw new Error('failed');
          return { ...current, turn: 40 };
        },
        postprocess: (
          _before: Readonly<typeof state>,
          current: typeof state,
          bus: EventBus,
        ) => {
          bus.emit('ai:strategic-warning-audio', {
            viewerId: current.currentPlayer,
            turn: current.turn,
          });
          if (failingPhase === 'postprocess') throw new Error('failed');
          return current;
        },
      };

      const result = runCompletedRound(state, new EventBus(), phases);

      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(result.state.turn).toBe(1);
    },
  );
});
