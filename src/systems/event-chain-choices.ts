// #990: recording a decision against a pending event chain and advancing it to
// its next stage. Deliberately holds NO chain-kind-specific game effects (gold
// costs, unrest penalties) — those are resolved later, when the delayed stage
// actually evaluates (see event-chain-progression.ts). This module only ever
// does bookkeeping: append to `priorChoices`, clear `pendingChoice`, advance
// `stageId`. Used by three callers that must all go through the same core
// logic rather than three divergent copies: the player-facing command
// (`chooseEventChainOption`), the AI's same-turn auto-resolution
// (event-chain-scheduling.ts), and the pending-choice-expiry auto-default path
// (event-chain-progression.ts).
import type { ActiveEventChain, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getEventChainDefinition } from './event-chain-definitions';

function advanceToNextStage(state: GameState, chain: ActiveEventChain): ActiveEventChain {
  const definition = getEventChainDefinition(chain.kind);
  const currentIndex = definition.stages.findIndex(s => s.id === chain.stageId);
  // currentIndex === -1 means chain.stageId names a stage this definition no
  // longer has (corrupted state, or a definition edited out from under an
  // in-flight save) -- treat exactly like "no next stage" below, never fall
  // through to `stages[-1 + 1] === stages[0]`, which would silently restart
  // the chain at its own onset stage instead of surfacing the problem.
  const next = currentIndex === -1 ? undefined : definition.stages[currentIndex + 1];
  if (!next) {
    // A well-formed definition never ends on a choice stage, but never leave a
    // chain silently stuck awaiting a decision it has already made.
    return { ...chain, pendingChoice: undefined };
  }
  return {
    ...chain,
    stageId: next.id,
    turnsInStage: 0,
    nextEvaluationTurn: state.turn + (next.delayTurns ?? 0),
    pendingChoice: next.options ? { stageId: next.id, optionIds: next.options.map(o => o.id) } : undefined,
    pendingChoiceExpiresTurn: next.options && next.pendingChoiceExpiresTurns !== undefined
      ? state.turn + next.pendingChoiceExpiresTurns
      : undefined,
  };
}

/** The one place a chain's `priorChoices` grows and its stage advances.
 * `wasDefaulted` distinguishes an auto-applied default from a genuine
 * human/AI decision for the `eventchain:choice-made` event — both still
 * count as "the decision that was made" for `priorChoices` purposes. */
export function applyEventChainChoice(
  state: GameState,
  chain: ActiveEventChain,
  optionId: string,
  actorCivId: string,
  bus: EventBus,
  wasDefaulted: boolean,
): ActiveEventChain {
  const recorded: ActiveEventChain = {
    ...chain,
    priorChoices: [...chain.priorChoices, { stageId: chain.stageId, optionId, turn: state.turn, actorCivId }],
  };
  const advanced = advanceToNextStage(state, recorded);
  bus.emit('eventchain:choice-made', { chainId: chain.id, stageId: chain.stageId, optionId, actorCivId, wasDefaulted });
  return advanced;
}

export type ChooseEventChainOptionResult =
  | { success: true; state: GameState }
  | { success: false; state: GameState; message: string };

/** The player-facing command. `actorCivId` must be the chain's own
 * `targetCivId` — a chain is a first-person decision about your own
 * situation, never something another civ can answer on your behalf. */
export function chooseEventChainOption(
  state: GameState,
  chainId: string,
  optionId: string,
  actorCivId: string,
  bus: EventBus,
): ChooseEventChainOptionResult {
  const chain = state.activeEventChains?.[chainId];
  if (!chain) return { success: false, state, message: 'No such event.' };
  if (chain.targetCivId !== actorCivId) {
    return { success: false, state, message: 'This is not your decision to make.' };
  }
  if (!chain.pendingChoice) return { success: false, state, message: 'No decision is pending.' };
  if (!chain.pendingChoice.optionIds.includes(optionId)) {
    return { success: false, state, message: 'Not a valid option.' };
  }

  const updated = applyEventChainChoice(state, chain, optionId, actorCivId, bus, false);
  return {
    success: true,
    state: { ...state, activeEventChains: { ...(state.activeEventChains ?? {}), [chainId]: updated } },
  };
}
