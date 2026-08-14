import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processTurn } from '@/core/turn-manager';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import type { GameState, SoloSetupConfig } from '@/core/types';

/**
 * Run-to-run determinism guard, permanent (unlike the now-retired
 * pre-refactor baseline test this file used to also carry -- see #787 phase
 * 11, which deleted it once the composition-root decomposition arc it backed
 * was done: `BASELINE`, `digest`, and `ONE_RUN_TIMEOUT_MS` are gone).
 *
 * Runs the real turn pipeline with no UI attached, twice from the same
 * cloned start, and asserts the two runs produce byte-identical state. This
 * is invariant under legitimate gameplay/content/balance changes (both runs
 * still land on whatever the new correct output is) but catches any
 * accidental source of nondeterminism -- e.g. `Math.random()` sneaking in
 * somewhere that should use the seeded RNG. Deliberately NOT a snapshot:
 * this repo has no snapshot tests, and a snapshot's failure mode is `-u`
 * until green, which would defeat the point here.
 */

const CONFIG: SoloSetupConfig = {
  civType: 'generic',
  mapSize: 'small',
  opponentCount: 3,
  gameTitle: 'determinism guard',
  seed: 'composition-root-guard',
};

const ROUNDS = 20;

/**
 * gameId must be pinned, not left as createNewGame produced it.
 *
 * createGameId embeds Date.now() (game-state.ts:123), and pirate ecology seeds
 * its RNG from `${state.gameId}:${state.turn}` (pirate-ecology.ts:380). So two
 * games created at different wall-clock times diverge in unit count by design.
 * That is correct behaviour for real campaigns and fatal for a fixed baseline --
 * without this pin the second test below fails intermittently and looks exactly
 * like the gameplay regression it exists to detect.
 */
function pinnedStart(): GameState {
  return { ...createNewGame(CONFIG), gameId: 'determinism-guard-fixed-id' };
}

function advance(state: GameState, rounds: number): GameState {
  let current = state;
  for (let i = 0; i < rounds; i += 1) {
    const bus = new EventBus();
    const result = runCompletedRound(current, bus, {
      improvements: (s, b) => processImprovementTurns(s, b),
      majors: (s, b) => processNonHumanMajorRound(s, b).state,
      world: (s, b) => processTurn(s, b),
      postprocess: (before, s, b) => applyStrategicWarningTransitions(before, s, b),
    });
    if (!result.ok) throw result.error;
    current = result.state;
  }
  return current;
}

// Timeout per .claude/rules/hooks-and-tooling.md (#608): this file advances the
// full turn pipeline across several civs twice, so it is a simulation test, not
// a cheap unit test, and must never sit on vitest's 5s default. Sized well above
// the worst observed run so contention from parallel worktree agents cannot turn
// it into a phantom regression. Do not tighten toward solo-run timings.
const TWO_RUN_TIMEOUT_MS = 30_000;

describe('determinism guard', () => {
  it(`${ROUNDS} rounds over the same start produce an identical state across runs`, () => {
    // Cloning one start (rather than creating two games) isolates exactly what
    // this guard is for: determinism of the turn pipeline itself.
    const start = pinnedStart();
    const a = advance(structuredClone(start), ROUNDS);
    const b = advance(structuredClone(start), ROUNDS);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, TWO_RUN_TIMEOUT_MS);
});
