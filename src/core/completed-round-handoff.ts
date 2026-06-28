import type { EventBus } from '@/core/event-bus';
import type { CompletedRoundResult } from '@/core/completed-round-orchestrator';
import type { GameState } from '@/core/types';

export type CompletedRoundHandoffResult =
  | { status: 'ready'; state: GameState }
  | { status: 'simulation-failed'; state: GameState; error: unknown }
  | { status: 'persistence-failed'; state: GameState; error: unknown };

export interface CompletedRoundHandoffTransactionOptions {
  initialState: GameState;
  runCompletedRound: (state: GameState) => CompletedRoundResult;
  prepareCompletedState: (state: GameState) => GameState;
  eventTarget: EventBus;
  adoptState: (state: GameState) => void;
  persistState: (state: GameState) => Promise<void>;
  onCommitErrors?: (errors: readonly unknown[]) => void;
}

export interface CompletedRoundHandoffTransaction {
  runCompletedRoundSimulation(): Promise<CompletedRoundHandoffResult>;
  persistCompletedRoundHandoff(): Promise<CompletedRoundHandoffResult>;
}

export function createCompletedRoundHandoffTransaction(
  options: CompletedRoundHandoffTransactionOptions,
): CompletedRoundHandoffTransaction {
  let completedState: GameState | null = null;

  const persistCompletedRoundHandoff = async (): Promise<CompletedRoundHandoffResult> => {
    if (!completedState) {
      return {
        status: 'simulation-failed',
        state: options.initialState,
        error: new Error('Completed-round simulation has not succeeded.'),
      };
    }
    try {
      await options.persistState(completedState);
      return { status: 'ready', state: completedState };
    } catch (error) {
      return { status: 'persistence-failed', state: completedState, error };
    }
  };

  const runCompletedRoundSimulation = async (): Promise<CompletedRoundHandoffResult> => {
    if (completedState) return persistCompletedRoundHandoff();

    const result = options.runCompletedRound(options.initialState);
    if (!result.ok) {
      return {
        status: 'simulation-failed',
        state: options.initialState,
        error: result.error,
      };
    }

    completedState = options.prepareCompletedState(result.state);
    options.adoptState(completedState);
    const commitErrors = result.events.commitTo(options.eventTarget);
    options.onCommitErrors?.(commitErrors);
    return persistCompletedRoundHandoff();
  };

  return {
    runCompletedRoundSimulation,
    persistCompletedRoundHandoff,
  };
}
