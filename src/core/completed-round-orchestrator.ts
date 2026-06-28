import type { EventBus } from '@/core/event-bus';
import { GameEventBuffer } from '@/core/game-event-buffer';
import type { GameState } from '@/core/types';

export interface CompletedRoundPhases {
  improvements: (state: GameState, bus: EventBus) => GameState;
  majors: (state: GameState, bus: EventBus) => GameState;
  world: (state: GameState, bus: EventBus) => GameState;
  postprocess?: (
    beforeRound: Readonly<GameState>,
    state: GameState,
    bus: EventBus,
  ) => GameState;
}

export type CompletedRoundResult =
  | { ok: true; state: GameState; events: GameEventBuffer }
  | { ok: false; state: GameState; error: unknown };

export function runCompletedRound(
  state: GameState,
  _bus: EventBus,
  phases: CompletedRoundPhases,
): CompletedRoundResult {
  const beforeRound = structuredClone(state);
  const events = new GameEventBuffer();
  try {
    let working = structuredClone(state);
    working = phases.improvements(working, events);
    working = phases.majors(working, events);
    working = phases.world(working, events);
    if (phases.postprocess) {
      working = phases.postprocess(beforeRound, working, events);
    }
    return { ok: true, state: working, events };
  } catch (error) {
    events.discard();
    return { ok: false, state, error };
  }
}
