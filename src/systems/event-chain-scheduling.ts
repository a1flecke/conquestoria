// #990: event-chain onset eligibility and scheduling — mirrors
// crisis-scheduling.ts's role for crises (per-civ era/cooldown/cap gating,
// then a chain-specific eligibility predicate). AI civs resolve their onset
// choice immediately, in the same scheduling pass — see the header note on
// `maybeStartEventChain` for why that is not a determinism or information
// leak concern.
import type { ActiveEventChain, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { resolveCivilizationEra } from './tech-definitions';
import { getCapitalCityId } from './capital-system';
import {
  chooseAiFinancialPanicOption,
  getEventChainDefinition,
} from './event-chain-definitions';
import { applyEventChainChoice } from './event-chain-choices';

export function countActiveEventChainsForCiv(state: GameState, civId: string): number {
  return Object.values(state.activeEventChains ?? {}).filter(c => c.targetCivId === civId).length;
}

function countActiveAiEventChains(state: GameState): number {
  return Object.values(state.activeEventChains ?? {})
    .filter(c => !state.civilizations[c.targetCivId]?.isHuman)
    .length;
}

export function processEventChainScheduler(state: GameState, bus: EventBus): GameState {
  let next = state;
  for (const civId of Object.keys(next.civilizations).sort()) {
    next = maybeStartEventChain(next, civId, bus);
  }
  return next;
}

function maybeStartEventChain(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isEliminated || civ.cities.length === 0) return state;

  const definition = getEventChainDefinition('financial-panic');
  const civEra = resolveCivilizationEra(civ.techState.completed);
  if (civEra < definition.eraBand[0] || civEra > definition.eraBand[1]) return state;
  if (civ.lastEventChainOnsetTurn !== undefined && state.turn - civ.lastEventChainOnsetTurn < definition.cooldownTurns) {
    return state;
  }
  if (countActiveEventChainsForCiv(state, civId) >= definition.maxSimultaneousPerCiv) return state;
  if (!civ.isHuman && countActiveAiEventChains(state) >= definition.aiWorldCap[state.settings.mapSize]) return state;
  if (!definition.isEligible(state, civId)) return state;

  const capitalCityId = getCapitalCityId(state, civId);
  const onsetStage = definition.stages[0];
  const chainId = `eventchain-${state.turn}-${civId}`;
  const chain: ActiveEventChain = {
    id: chainId,
    kind: definition.kind,
    targetCivId: civId,
    cityIds: capitalCityId ? [capitalCityId] : [],
    stageId: onsetStage.id,
    startedTurn: state.turn,
    turnsInStage: 0,
    nextEvaluationTurn: state.turn,
    priorChoices: [],
    pendingChoice: onsetStage.options ? { stageId: onsetStage.id, optionIds: onsetStage.options.map(o => o.id) } : undefined,
    pendingChoiceExpiresTurn: onsetStage.options && onsetStage.pendingChoiceExpiresTurns !== undefined
      ? state.turn + onsetStage.pendingChoiceExpiresTurns
      : undefined,
  };

  let nextState: GameState = {
    ...state,
    activeEventChains: { ...(state.activeEventChains ?? {}), [chainId]: chain },
    civilizations: { ...state.civilizations, [civId]: { ...civ, lastEventChainOnsetTurn: state.turn } },
  };
  bus.emit('eventchain:started', { chainId, kind: chain.kind, civId, cityIds: chain.cityIds });

  // AI civs decide from their own known state in the same scheduling pass —
  // this is not a determinism or information-leak concern: the AI policy
  // function (chooseAiFinancialPanicOption) is a pure function of this civ's
  // own state (its own war status), and same-turn resolution is exactly how
  // every other AI-facing crisis intervention in this codebase already
  // behaves (see .claude/rules/game-systems.md's AI Combat section — AI never
  // "waits" on a decision it is itself the decision-maker for). A human's
  // pendingChoice, by contrast, genuinely waits for real player input.
  if (!civ.isHuman) {
    const optionId = chooseAiFinancialPanicOption(nextState, civId);
    const updated = applyEventChainChoice(nextState, chain, optionId, civId, bus, false);
    nextState = { ...nextState, activeEventChains: { ...(nextState.activeEventChains ?? {}), [chainId]: updated } };
  }

  return nextState;
}
