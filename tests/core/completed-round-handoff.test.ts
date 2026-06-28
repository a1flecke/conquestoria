import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { GameEventBuffer } from '@/core/game-event-buffer';
import { createNewGame } from '@/core/game-state';
import { createCompletedRoundHandoffTransaction } from '@/core/completed-round-handoff';

describe('completed-round handoff transaction', () => {
  it('reruns simulation from the original state after a phase failure', async () => {
    const initial = createNewGame(undefined, 'handoff-phase-retry', 'small');
    const events = new GameEventBuffer();
    const runCompletedRound = vi.fn()
      .mockReturnValueOnce({ ok: false, state: initial, error: new Error('phase failed') })
      .mockReturnValueOnce({
        ok: true,
        state: { ...initial, turn: initial.turn + 1 },
        events,
      });
    const adoptState = vi.fn();
    const persistState = vi.fn(async () => {});
    const transaction = createCompletedRoundHandoffTransaction({
      initialState: initial,
      runCompletedRound,
      prepareCompletedState: state => ({ ...state, currentPlayer: 'player' }),
      eventTarget: new EventBus(),
      adoptState,
      persistState,
    });

    await expect(transaction.runCompletedRoundSimulation())
      .resolves.toMatchObject({ status: 'simulation-failed', state: initial });
    await expect(transaction.runCompletedRoundSimulation())
      .resolves.toMatchObject({ status: 'ready', state: { turn: initial.turn + 1 } });

    expect(runCompletedRound).toHaveBeenCalledTimes(2);
    expect(runCompletedRound).toHaveBeenNthCalledWith(1, initial);
    expect(runCompletedRound).toHaveBeenNthCalledWith(2, initial);
    expect(adoptState).toHaveBeenCalledTimes(1);
    expect(persistState).toHaveBeenCalledTimes(1);
  });

  it('retries only persistence after successful simulation and commits events once', async () => {
    const initial = createNewGame(undefined, 'handoff-save-retry', 'small');
    const eventTarget = new EventBus();
    const delivered = vi.fn();
    eventTarget.on('turn:end', delivered);
    const events = new GameEventBuffer();
    events.emit('turn:end', { turn: initial.turn, playerId: initial.currentPlayer });
    const runCompletedRound = vi.fn(() => ({
      ok: true as const,
      state: { ...initial, turn: initial.turn + 1 },
      events,
    }));
    const persistState = vi.fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const order: string[] = [];
    const transaction = createCompletedRoundHandoffTransaction({
      initialState: initial,
      runCompletedRound,
      prepareCompletedState: state => ({ ...state, currentPlayer: 'player' }),
      eventTarget,
      adoptState: () => order.push('adopt'),
      persistState: async state => {
        order.push('persist');
        await persistState(state);
      },
      onCommitErrors: errors => {
        expect(errors).toEqual([]);
        order.push('commit');
      },
    });

    await expect(transaction.runCompletedRoundSimulation())
      .resolves.toMatchObject({ status: 'persistence-failed', state: { turn: initial.turn + 1 } });
    await expect(transaction.persistCompletedRoundHandoff())
      .resolves.toMatchObject({ status: 'ready', state: { turn: initial.turn + 1 } });

    expect(runCompletedRound).toHaveBeenCalledOnce();
    expect(delivered).toHaveBeenCalledOnce();
    expect(persistState).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['adopt', 'commit', 'persist', 'persist']);
  });
});
