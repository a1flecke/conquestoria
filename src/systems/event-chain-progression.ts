// #990: chain-kind-specific per-turn behavior — the delayed-consequence effect
// for each shipped chain kind, plus the pending-choice-expiry auto-default
// path (a chain must never wait forever on a human who hasn't decided).
// Mirrors crisis-progression.ts's role: this is the "what a chain is" policy
// dispatched to generically by event-chain-lifecycle.ts, the same seam
// #1012 documented for crises.
import type { ActiveEventChain, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { resolveCivilizationEra } from './tech-definitions';
import {
  FINANCIAL_PANIC_DO_NOTHING_MIN_UNREST_LEVEL,
  FINANCIAL_PANIC_OPTIONS,
  FINANCIAL_PANIC_REFORM_WAR_MIN_UNREST_LEVEL,
  getEventChainStageDefinition,
  getFinancialPanicBailoutCost,
  getFinancialPanicGoldThreshold,
} from './event-chain-definitions';
import { applyEventChainChoice } from './event-chain-choices';

/** Applies the stage's own `defaultOptionId` when a human decision-maker
 * hasn't chosen within the pending-choice window. Returns the chain unchanged
 * if no default is configured (a defensive no-op, never expected to trigger
 * for a well-formed definition) or if the window hasn't elapsed yet. */
function applyPendingChoiceExpiryIfDue(
  state: GameState,
  chain: ActiveEventChain,
  bus: EventBus,
): ActiveEventChain {
  if (!chain.pendingChoice) return chain;
  if (chain.pendingChoiceExpiresTurn === undefined || state.turn < chain.pendingChoiceExpiresTurn) return chain;
  const stageDef = getEventChainStageDefinition(chain.kind, chain.stageId);
  const defaultOptionId = stageDef?.defaultOptionId;
  if (!defaultOptionId) return chain;
  return applyEventChainChoice(state, chain, defaultOptionId, chain.targetCivId, bus, true);
}

function resolveFinancialPanicConsequence(
  state: GameState,
  chain: ActiveEventChain,
  bus: EventBus,
): { record: ActiveEventChain | null; state: GameState } {
  const civ = state.civilizations[chain.targetCivId];
  if (!civ) {
    bus.emit('eventchain:resolved', {
      chainId: chain.id, kind: chain.kind, civId: chain.targetCivId, outcome: 'invalid', priorChoices: chain.priorChoices,
    });
    return { record: null, state };
  }

  const onsetChoice = chain.priorChoices.find(c => c.stageId === 'onset');
  const optionId = onsetChoice?.optionId ?? FINANCIAL_PANIC_OPTIONS.doNothing;
  const era = resolveCivilizationEra(civ.techState.completed);

  let nextState = state;
  let minUnrestLevel: 0 | 1 | 2 = 0;

  if (optionId === FINANCIAL_PANIC_OPTIONS.bailout) {
    // Billed now, not at choice time — the commitment was made 4 turns ago;
    // never blocks on insufficient gold (a real loan, not a cash purchase),
    // and always guarantees a clean resolution below.
    const cost = Math.min(civ.gold, getFinancialPanicBailoutCost(era));
    nextState = { ...nextState, civilizations: { ...nextState.civilizations, [chain.targetCivId]: { ...civ, gold: civ.gold - cost } } };
  } else if (optionId === FINANCIAL_PANIC_OPTIONS.reform) {
    // Reform holds only through calm — an ongoing major war undermines it.
    const atWar = majorCivWarOpponentIds(civ.diplomacy.atWarWith).length > 0;
    minUnrestLevel = atWar ? FINANCIAL_PANIC_REFORM_WAR_MIN_UNREST_LEVEL : 0;
  } else {
    // Do nothing: free and harmless if the treasury already recovered on its
    // own by evaluation time; costly if it never did.
    const recovered = civ.gold >= getFinancialPanicGoldThreshold(era);
    minUnrestLevel = recovered ? 0 : FINANCIAL_PANIC_DO_NOTHING_MIN_UNREST_LEVEL;
  }

  if (minUnrestLevel > 0) {
    const cityId = chain.cityIds[0];
    const city = cityId ? nextState.cities[cityId] : undefined;
    if (city && city.unrestLevel < minUnrestLevel) {
      // Reset unrestTurns alongside the level bump, matching every unrest-level
      // transition elsewhere in faction-system.ts — a level change always starts
      // a fresh turns-at-level count.
      nextState = { ...nextState, cities: { ...nextState.cities, [city.id]: { ...city, unrestLevel: minUnrestLevel, unrestTurns: 0 } } };
    }
  }

  bus.emit('eventchain:resolved', {
    chainId: chain.id, kind: chain.kind, civId: chain.targetCivId, outcome: 'resolved', priorChoices: chain.priorChoices,
  });
  return { record: null, state: nextState };
}

function tickFinancialPanic(
  state: GameState,
  chain: ActiveEventChain,
  bus: EventBus,
): { record: ActiveEventChain | null; state: GameState } {
  let working: ActiveEventChain = { ...chain, turnsInStage: chain.turnsInStage + 1 };
  working = applyPendingChoiceExpiryIfDue(state, working, bus);
  if (working.pendingChoice) return { record: working, state }; // still awaiting a decision

  if (working.stageId === 'consequence' && state.turn >= working.nextEvaluationTurn) {
    return resolveFinancialPanicConsequence(state, working, bus);
  }
  return { record: working, state };
}

/** Chain-kind dispatch — the exact seam #1012 asked #990 to reuse rather than
 * duplicate: the reusable engine loop (staged-lifecycle-engine.ts, called via
 * event-chain-lifecycle.ts) is generic; this is the ONE place that switches on
 * chain kind, mirroring crisis-progression.ts's `tickCrisisByArchetype`. */
export function tickEventChainByKind(
  state: GameState,
  chain: ActiveEventChain,
  bus: EventBus,
): { record: ActiveEventChain | null; state: GameState } {
  switch (chain.kind) {
    case 'financial-panic':
      return tickFinancialPanic(state, chain, bus);
    default:
      return { record: chain, state };
  }
}
