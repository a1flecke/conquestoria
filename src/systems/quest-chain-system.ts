import type {
  GameState,
  MinorCivRelationshipStatus,
  Quest,
  QuestAction,
  QuestReward,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { applyResearchBonus } from './tech-system';
import { modifyRelationship } from './diplomacy-system';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import { createUnit } from './unit-system';
import { hexKey, hexNeighbors } from './hex-utils';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import {
  getQuestChain,
  getQuestChainForArchetype,
  getQuestStepVariant,
  type QuestChainDefinition,
} from './quest-chain-definitions';
import {
  createQuestTarget,
  applyQuestObjectiveAction,
  isQuestObjectiveComplete,
  isQuestTargetFeasible,
} from './quest-objective-system';

export type ChainTransition =
  | { type: 'issued'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'pending'; majorCivId: string; minorCivId: string; chainId: string; stepIndex: 0 | 1 | 2 }
  | { type: 'progressed'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'completed'; majorCivId: string; minorCivId: string; quest: Quest; reward: QuestReward }
  | { type: 'expired'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'retargeted'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'cancelled'; majorCivId: string; minorCivId: string; chainId: string; stepIndex: 0 | 1 | 2 }
  | { type: 'allied'; majorCivId: string; minorCivId: string; chainId: string }
  | { type: 'alliance-broken'; majorCivId: string; minorCivId: string; chainId: string };

export interface ChainTransitionResult {
  state: GameState;
  transitions: ChainTransition[];
}

export function emitMinorCivQuestTransitions(
  bus: EventBus | undefined,
  transitions: ChainTransition[],
  state?: GameState,
): void {
  if (!bus) return;
  for (const transition of transitions) {
    switch (transition.type) {
      case 'issued': bus.emit('minor-civ:quest-issued', { ...transition, state }); break;
      case 'pending': bus.emit('minor-civ:quest-chain-pending', { ...transition, state }); break;
      case 'progressed': bus.emit('minor-civ:quest-progressed', { ...transition, state }); break;
      case 'completed': bus.emit('minor-civ:quest-completed', { ...transition, state }); break;
      case 'expired': bus.emit('minor-civ:quest-expired', { ...transition, state }); break;
      case 'retargeted': bus.emit('minor-civ:quest-retargeted', { ...transition, state }); break;
      case 'cancelled': bus.emit('minor-civ:quest-cancelled', { ...transition, state }); break;
      case 'allied': bus.emit('minor-civ:allied', { ...transition, state }); break;
      case 'alliance-broken': bus.emit('minor-civ:alliance-broken', { ...transition, state }); break;
    }
  }
}

function getChainForMinor(state: GameState, minorCivId: string): QuestChainDefinition | null {
  const minorCiv = state.minorCivs[minorCivId];
  const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv?.definitionId);
  return definition ? getQuestChainForArchetype(definition.archetype) : null;
}

function issueChainStep(
  state: GameState,
  minorCivId: string,
  majorCivId: string,
  chain: QuestChainDefinition,
  stepIndex: 0 | 1 | 2,
  currentTurn: number,
  pendingWindow?: { statusTurn: number; pendingExpiresOnTurn: number },
): ChainTransitionResult {
  const nextState = structuredClone(state);
  const minorCiv = nextState.minorCivs[minorCivId];
  const step = chain.steps[stepIndex];
  const variant = getQuestStepVariant(chain, stepIndex, nextState.era);
  for (const option of [variant.preferred, ...variant.fallbacks]) {
    const target = createQuestTarget(
      { state: nextState, minorCivId, majorCivId, currentTurn, duration: step.duration },
      option,
    );
    if (!target) continue;
    const quest: Quest = {
      id: `quest-${nextState.idCounters.nextQuestId++}`,
      type: target.type,
      description: option.description,
      target,
      cityId: target.type === 'defeat_units' ? target.cityId : undefined,
      reward: { ...step.reward },
      progress: 0,
      status: 'active',
      turnIssued: currentTurn,
      expiresOnTurn: currentTurn + step.duration,
      chainId: chain.id,
      stepIndex,
    };
    minorCiv.activeQuests[majorCivId] = quest;
    delete minorCiv.chainStatusByCiv[majorCivId];
    return { state: nextState, transitions: [{ type: 'issued', majorCivId, minorCivId, quest }] };
  }

  minorCiv.chainStatusByCiv[majorCivId] = {
    chainId: chain.id,
    status: 'pending',
    statusTurn: pendingWindow?.statusTurn ?? currentTurn,
    pendingStepIndex: stepIndex,
    pendingExpiresOnTurn: pendingWindow?.pendingExpiresOnTurn ?? currentTurn + 10,
  };
  delete minorCiv.activeQuests[majorCivId];
  return {
    state: nextState,
    transitions: [{ type: 'pending', majorCivId, minorCivId, chainId: chain.id, stepIndex }],
  };
}

function findFreeSpawnPosition(state: GameState, cityId: string) {
  const city = state.cities[cityId];
  if (!city) return null;
  for (const position of [city.position, ...hexNeighbors(city.position)]) {
    if (!state.map.tiles[hexKey(position)]) continue;
    if (!Object.values(state.units).some(unit => hexKey(unit.position) === hexKey(position))) return position;
  }
  return null;
}

function applyReward(
  state: GameState,
  minorCivId: string,
  majorCivId: string,
  reward: QuestReward,
): GameState {
  const nextState = structuredClone(state);
  const minorCiv = nextState.minorCivs[minorCivId];
  const civ = nextState.civilizations[majorCivId];
  if (!minorCiv || !civ) return nextState;
  minorCiv.diplomacy = modifyRelationship(minorCiv.diplomacy, majorCivId, reward.relationshipBonus);
  if (reward.gold) civ.gold += reward.gold;
  if (reward.science && civ.techState.currentResearch) {
    civ.techState = applyResearchBonus(civ.techState, reward.science).state;
  }
  if (reward.freeUnit) {
    const cityId = civ.cities.find(candidate => findFreeSpawnPosition(nextState, candidate));
    const position = cityId ? findFreeSpawnPosition(nextState, cityId) : null;
    if (position) {
      const unit = createUnit(reward.freeUnit, majorCivId, position, nextState.idCounters);
      nextState.units[unit.id] = unit;
      civ.units.push(unit.id);
    }
  }
  return nextState;
}

function completeQuest(
  state: GameState,
  minorCivId: string,
  majorCivId: string,
  quest: Quest,
  currentTurn: number,
): ChainTransitionResult {
  let nextState = applyReward(state, minorCivId, majorCivId, quest.reward);
  const completedQuest = { ...quest, status: 'completed' as const };
  const transitions: ChainTransition[] = [
    { type: 'completed', majorCivId, minorCivId, quest: completedQuest, reward: quest.reward },
  ];
  delete nextState.minorCivs[minorCivId].activeQuests[majorCivId];

  if (!quest.chainId || quest.stepIndex === undefined) {
    const relationship = nextState.minorCivs[minorCivId].diplomacy.relationships[majorCivId] ?? 0;
    const chain = getChainForMinor(nextState, minorCivId);
    if (relationship >= 30 && chain && !isMinorCivAtWar(nextState, majorCivId, minorCivId)) {
      delete nextState.minorCivs[minorCivId].chainStatusByCiv[majorCivId];
      const issued = issueChainStep(nextState, minorCivId, majorCivId, chain, 0, currentTurn);
      return { state: issued.state, transitions: [...transitions, ...issued.transitions] };
    }
    nextState.minorCivs[minorCivId].questCooldownUntilByCiv[majorCivId] = currentTurn + 3;
    return { state: nextState, transitions };
  }

  const chain = getQuestChain(quest.chainId);
  if (!chain) return { state: nextState, transitions };
  if (quest.stepIndex < 2) {
    const issued = issueChainStep(
      nextState,
      minorCivId,
      majorCivId,
      chain,
      (quest.stepIndex + 1) as 1 | 2,
      currentTurn,
    );
    return { state: issued.state, transitions: [...transitions, ...issued.transitions] };
  }

  const minorCiv = nextState.minorCivs[minorCivId];
  minorCiv.diplomacy.relationships[majorCivId] = Math.max(60, minorCiv.diplomacy.relationships[majorCivId] ?? 0);
  minorCiv.chainStatusByCiv[majorCivId] = {
    chainId: chain.id,
    status: 'allied',
    statusTurn: currentTurn,
    earnedTurn: currentTurn,
  };
  minorCiv.lastNotifiedStatusByCiv[majorCivId] = 'allied';
  transitions.push({ type: 'allied', majorCivId, minorCivId, chainId: chain.id });
  return { state: nextState, transitions };
}

export function applyQuestGameplayAction(state: GameState, action: QuestAction): ChainTransitionResult {
  if (action.turn !== state.turn) return { state, transitions: [] };
  let nextState = state;
  const transitions: ChainTransition[] = [];
  for (const minorCivId of Object.keys(state.minorCivs ?? {}).sort()) {
    const quest = nextState.minorCivs[minorCivId]?.activeQuests[action.actorCivId];
    if (!quest || quest.status !== 'active') continue;
    const appliedState = applyQuestObjectiveAction(nextState, minorCivId, quest, action);
    if (!appliedState) continue;
    nextState = appliedState;
    const activeQuest = nextState.minorCivs[minorCivId].activeQuests[action.actorCivId];
    if (isQuestObjectiveComplete(activeQuest)) {
      const completed = completeQuest(nextState, minorCivId, action.actorCivId, activeQuest, action.turn);
      nextState = completed.state;
      transitions.push(...completed.transitions);
    } else {
      transitions.push({ type: 'progressed', majorCivId: action.actorCivId, minorCivId, quest: { ...activeQuest } });
    }
  }
  return { state: nextState, transitions };
}

export function reconcileMinorCivQuestTurn(
  state: GameState,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
): ChainTransitionResult {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) return { state, transitions: [] };
  const quest = minorCiv.activeQuests[majorCivId];
  if (quest?.expiresOnTurn !== null && quest?.expiresOnTurn !== undefined && currentTurn > quest.expiresOnTurn) {
    const nextState = structuredClone(state);
    const nextMinor = nextState.minorCivs[minorCivId];
    delete nextMinor.activeQuests[majorCivId];
    delete nextMinor.chainStatusByCiv[majorCivId];
    nextMinor.diplomacy = modifyRelationship(nextMinor.diplomacy, majorCivId, -5);
    nextMinor.questCooldownUntilByCiv[majorCivId] = currentTurn + 3;
    return { state: nextState, transitions: [{ type: 'expired', majorCivId, minorCivId, quest }] };
  }

  if (quest?.chainId && quest.stepIndex !== undefined) {
    const remainingTurns = quest.expiresOnTurn === null ? 20 : Math.max(0, quest.expiresOnTurn - currentTurn);
    if (!isQuestTargetFeasible(state, majorCivId, minorCivId, quest, remainingTurns)) {
      const chain = getQuestChain(quest.chainId);
      if (!chain) return { state, transitions: [] };
      const variant = getQuestStepVariant(chain, quest.stepIndex, state.era);
      for (const option of [variant.preferred, ...variant.fallbacks]) {
        const target = createQuestTarget(
          { state, minorCivId, majorCivId, currentTurn, duration: Math.max(1, remainingTurns) },
          option,
        );
        if (!target) continue;
        const nextState = structuredClone(state);
        const retargeted: Quest = {
          ...quest,
          type: target.type,
          description: option.description,
          target,
          cityId: target.type === 'defeat_units' ? target.cityId : undefined,
          progress: 0,
        };
        nextState.minorCivs[minorCivId].activeQuests[majorCivId] = retargeted;
        return { state: nextState, transitions: [{ type: 'retargeted', majorCivId, minorCivId, quest: retargeted }] };
      }
      const pendingState = structuredClone(state);
      delete pendingState.minorCivs[minorCivId].activeQuests[majorCivId];
      pendingState.minorCivs[minorCivId].chainStatusByCiv[majorCivId] = {
        chainId: chain.id,
        status: 'pending',
        statusTurn: currentTurn,
        pendingStepIndex: quest.stepIndex,
        pendingExpiresOnTurn: currentTurn + 10,
      };
      return {
        state: pendingState,
        transitions: [{ type: 'pending', majorCivId, minorCivId, chainId: chain.id, stepIndex: quest.stepIndex }],
      };
    }
  }

  const pending = minorCiv.chainStatusByCiv[majorCivId];
  if (pending?.status === 'pending') {
    if (currentTurn > pending.pendingExpiresOnTurn) {
      const nextState = structuredClone(state);
      delete nextState.minorCivs[minorCivId].chainStatusByCiv[majorCivId];
      nextState.minorCivs[minorCivId].questCooldownUntilByCiv[majorCivId] = currentTurn + 3;
      return {
        state: nextState,
        transitions: [{ type: 'cancelled', majorCivId, minorCivId, chainId: pending.chainId, stepIndex: pending.pendingStepIndex }],
      };
    }
    const chain = getQuestChain(pending.chainId);
    if (chain) {
      return issueChainStep(state, minorCivId, majorCivId, chain, pending.pendingStepIndex, currentTurn, {
        statusTurn: pending.statusTurn,
        pendingExpiresOnTurn: pending.pendingExpiresOnTurn,
      });
    }
  }
  return { state, transitions: [] };
}

export function isMinorCivAllianceActive(state: GameState, majorCivId: string, minorCivId: string): boolean {
  const minorCiv = state.minorCivs[minorCivId];
  return Boolean(
    minorCiv
    && !minorCiv.isDestroyed
    && !isMinorCivAtWar(state, majorCivId, minorCivId)
    && minorCiv.chainStatusByCiv[majorCivId]?.status === 'allied',
  );
}

export function getMinorCivRelationshipStatus(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): MinorCivRelationshipStatus {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) return 'neutral';
  if (isMinorCivAtWar(state, majorCivId, minorCivId)) return 'at-war';
  if (isMinorCivAllianceActive(state, majorCivId, minorCivId)) return 'allied';
  const relationship = minorCiv.diplomacy.relationships[majorCivId] ?? 0;
  if (relationship <= -60) return 'hostile';
  if (relationship >= 30) return 'friendly';
  return 'neutral';
}
