import { lehmerFoldByCodePoint } from '@/systems/deterministic-hash';
import type { GameState } from '@/core/types';
import { checkAndQueueGeneralCandidateChoice, spawnGeneralForCiv } from '@/systems/great-general-system';
import { chooseBestGeneralCandidate } from '@/ai/ai-general-command';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import type { GeneralDefinition } from '@/systems/great-general-definitions';
import type { CivTurn } from './types';

// #544 MR3: same char-folding convention combat-reward-system.ts's seededRoll and
// city-capture-system.ts's assault seed already use -- turns a (gameId, turn, civId)
// tuple into a deterministic numeric seed without a shared cross-file seed-hashing
// utility (several systems in this codebase each keep their own small local variant).
// #932: `gameId` (the canonical determinism base for combat, barbarians, pirates,
// crises, minor civs, city-capture assaults) is now folded in so two different
// playthroughs no longer draw the identical authored candidate set at the same
// turn. `state.gameId` is always populated for any state reaching turn processing
// -- `createNewGame` sets it, and `save-migrations` backfills a per-save
// `stableLegacyGameId` for pre-field saves -- so old saves get their own distinct
// draw sequence too, not a shared collision. The `?? 'legacy'` is belt-and-braces
// parity with `deterministicCombatSeed`'s own guard, not a real code path. The
// `${gameId}:${civId}` separator prevents ("ab","c") aliasing to ("a","bc").
export function deriveGeneralCandidateSeed(gameId: string | undefined, turn: number, civId: string): number {
  return lehmerFoldByCodePoint(Math.abs(turn * 7919), `${gameId ?? 'legacy'}:${civId}`);
}

/**
 * Queues a Great General candidate choice once the civ crosses its next threshold; an AI civ picks at once.
 */
export function queueGeneralCandidates(state: GameState, turn: CivTurn): GameState {
  let newState = state;
  const { civId, civ } = turn;

  newState = checkAndQueueGeneralCandidateChoice(
    newState,
    civId,
    'round-end',
    deriveGeneralCandidateSeed(newState.gameId, newState.turn, civId),
  );
  if (!civ.isHuman) {
    const pending = (newState.pendingGeneralCandidateChoices ?? [])
      .find(choice => choice.civId === civId);
    if (pending) {
      const candidates = pending.candidateDefinitionIds
        .map(id => resolveGeneralDefinition(newState, id))
        .filter((g): g is GeneralDefinition => g !== undefined);
      if (candidates.length > 0) {
        newState = spawnGeneralForCiv(newState, civId, chooseBestGeneralCandidate(newState, civId, candidates).id);
      }
    }
  }
  return newState;
}
