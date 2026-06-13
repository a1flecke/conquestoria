import type { GameState, Quest, QuestReward } from '@/core/types';
import { hasDiscoveredCity, hasDiscoveredMinorCiv } from '@/systems/discovery-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { formatCityReference } from '@/systems/player-facing-labels';
import { getQuestChain, getQuestStepVariant } from './quest-chain-definitions';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { describeQuestObjectiveForPlayer } from './quest-objective-system';

export interface MinorCivQuestPresentation {
  chainName?: string;
  stepLabel?: string;
  stepTitle?: string;
  description: string;
  progressLabel?: string;
  turnsRemaining?: number;
  currentReward: QuestReward;
  finalAllianceLabel?: string;
}

export interface MinorCivChainPresentation {
  status: 'pending' | 'allied' | 'broken';
  label: string;
  detail: string;
}

function formatAllyBonus(definition: (typeof MINOR_CIV_DEFINITIONS)[number]): string {
  switch (definition.allyBonus.type) {
    case 'gold_per_turn': return `+${definition.allyBonus.amount} gold per turn`;
    case 'science_per_turn': return `+${definition.allyBonus.amount} science per turn`;
    case 'production_per_turn': return `+${definition.allyBonus.amount} production per turn`;
    case 'free_unit': return `Free ${definition.allyBonus.unitType} every ${definition.allyBonus.everyNTurns} turns`;
  }
}

export function formatQuestReward(reward: QuestReward): string {
  const parts = [`+${reward.relationshipBonus} relationship`];
  if (reward.gold) parts.push(`+${reward.gold} gold`);
  if (reward.science) parts.push(`+${reward.science} science`);
  if (reward.freeUnit) parts.push(`free ${reward.freeUnit.replace(/_/g, ' ')}`);
  return parts.join(', ');
}

function getQuestCityId(quest: Quest): string | undefined {
  return quest.cityId ?? (quest.target.type === 'defeat_units' ? quest.target.cityId : undefined);
}

export function isQuestVisibleToPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  quest: Quest,
  viewerId: string,
): boolean {
  if (quest.target.type === 'trade_route') {
    return hasDiscoveredMinorCiv(state as GameState, viewerId, quest.target.minorCivId);
  }

  return true;
}

export function getQuestOriginLabel(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  quest: Quest,
  viewerId: string,
): string {
  if (quest.target.type === 'trade_route') {
    return getMinorCivPresentationForPlayer(state as GameState, viewerId, quest.target.minorCivId, 'city-state').name;
  }

  const cityId = getQuestCityId(quest);
  if (!cityId) {
    return 'unknown source';
  }

  if (!hasDiscoveredCity(state as GameState, viewerId, cityId)) {
    return 'foreign city';
  }

  const city = (state as GameState).cities[cityId];
  if (!city) {
    return 'unknown source';
  }

  const duplicateCount = Object.values((state as GameState).cities).filter(other => other.name === city.name).length;
  const ownerName = (state as GameState).civilizations[city.owner]?.name;
  return formatCityReference(city.name, { ownerName, duplicateCount });
}

export function getQuestDescriptionForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): string {
  return describeQuestObjectiveForPlayer(state as GameState, playerId, quest);
}

export function getMinorCivQuestPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivQuestPresentation | null {
  if (!hasDiscoveredMinorCiv(state, viewerCivId, minorCivId)) return null;
  const minorCiv = state.minorCivs[minorCivId];
  const quest = minorCiv?.activeQuests[viewerCivId];
  if (!minorCiv || !quest) return null;
  const chain = quest.chainId ? getQuestChain(quest.chainId) : null;
  const variant = chain && quest.stepIndex !== undefined
    ? getQuestStepVariant(chain, quest.stepIndex, state.era)
    : null;
  const targetAmount = quest.target.type === 'defeat_units' ? quest.target.count : 1;
  const progressLabel = targetAmount > 1 ? `${Math.min(quest.progress, targetAmount)} / ${targetAmount}` : undefined;
  const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv.definitionId);
  return {
    ...(chain ? { chainName: chain.name } : {}),
    ...(quest.stepIndex !== undefined ? { stepLabel: `Step ${quest.stepIndex + 1} of 3` } : {}),
    ...(variant ? { stepTitle: variant.title } : {}),
    description: getQuestDescriptionForPlayer(state, viewerCivId, quest),
    ...(progressLabel ? { progressLabel } : {}),
    ...(quest.expiresOnTurn === null ? {} : { turnsRemaining: Math.max(0, quest.expiresOnTurn - state.turn) }),
    currentReward: quest.reward,
    ...(chain && definition ? { finalAllianceLabel: `Durable alliance: ${formatAllyBonus(definition)}` } : {}),
  };
}

export function getMinorCivChainPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivChainPresentation | null {
  if (!hasDiscoveredMinorCiv(state, viewerCivId, minorCivId)) return null;
  const status = state.minorCivs[minorCivId]?.chainStatusByCiv[viewerCivId];
  if (!status) return null;
  const chain = getQuestChain(status.chainId);
  const name = chain?.name ?? 'Alliance chain';
  if (status.status === 'pending') {
    return {
      status: 'pending',
      label: `${name}: Step ${status.pendingStepIndex + 1} pending`,
      detail: `A feasible objective will be offered for ${Math.max(0, status.pendingExpiresOnTurn - state.turn)} more turns.`,
    };
  }
  if (status.status === 'allied') {
    const minorCiv = state.minorCivs[minorCivId];
    const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv?.definitionId);
    const bonus = definition ? ` Active bonus: ${formatAllyBonus(definition)}.` : '';
    return { status: 'allied', label: 'Durable Alliance', detail: `${name} completed.${bonus}` };
  }
  return { status: 'broken', label: 'Alliance Broken', detail: `Make peace and rebuild trust to restart ${name}.` };
}

export function getQuestIssuedMessageForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  issuerLabel: string,
  quest: Quest,
): string {
  return `${issuerLabel} asks: ${getQuestDescriptionForPlayer(state, playerId, quest)}`;
}
