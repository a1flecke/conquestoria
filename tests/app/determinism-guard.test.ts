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
 * Gameplay guard for the composition-root decomposition arc (#787).
 *
 * The refactor moves ~5,400 lines out of src/main.ts across eleven phases, and
 * main.ts calls into nearly every system. This runs the real turn pipeline with
 * no UI attached, so it is unaffected by every phase EXCEPT one that
 * accidentally changes a system call -- which is exactly the failure it exists
 * to catch. See docs/superpowers/plans/2026-08-04-composition-root-decomposition.md.
 *
 * Deliberately NOT a snapshot: this repo has no snapshot tests, and a snapshot's
 * failure mode is `-u` until green. The only correct response to the baseline
 * below failing is to find which phase moved a system call and revert it.
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

function digest(state: GameState): Record<string, unknown> {
  return {
    turn: state.turn,
    era: state.era,
    cityCount: Object.keys(state.cities).length,
    unitCount: Object.keys(state.units).length,
    goldByCiv: Object.fromEntries(
      Object.entries(state.civilizations).map(([id, civ]) => [id, civ.gold]),
    ),
    techsCompletedByCiv: Object.fromEntries(
      Object.entries(state.civilizations).map(([id, civ]) => [id, civ.techState.completed.length]),
    ),
  };
}

describe('determinism guard', () => {
  it(`${ROUNDS} rounds over the same start produce an identical state across runs`, () => {
    // Cloning one start (rather than creating two games) isolates exactly what
    // this guard is for: determinism of the turn pipeline itself.
    const start = pinnedStart();
    const a = advance(structuredClone(start), ROUNDS);
    const b = advance(structuredClone(start), ROUNDS);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('matches the baseline recorded from the pre-refactor build', () => {
    const state = advance(pinnedStart(), ROUNDS);

    expect(digest(state)).toEqual(BASELINE);
  });
});

/**
 * Recorded 2026-08-04 from commit 2ce97c70 with `git stash push -- src/` applied,
 * i.e. against a source tree with zero decomposition-arc changes. Verified stable
 * across repeated runs with the pinned gameId above.
 *
 * Do not re-record to make a failing phase pass. If this fails, find the phase
 * that moved a system call and revert it.
 */
const BASELINE = {
  turn: 21,
  era: 1,
  cityCount: 6,
  unitCount: 23,
  // The human seat never acts in this harness -- only non-human majors and the
  // world tick run -- so `player` staying at 0 is correct, and the AI columns
  // are what actually guard AI behavior.
  goldByCiv: { player: 0, 'ai-1': 20, 'ai-2': 22 },
  techsCompletedByCiv: { player: 0, 'ai-1': 4, 'ai-2': 4 },
} as const;
