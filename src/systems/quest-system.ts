import type { MinorCivArchetype, Quest, QuestReward, QuestTarget, QuestType, GameState, IdCounters } from '@/core/types';
import { createQuestTarget } from './quest-objective-system';
import type { QuestObjectiveOption } from './quest-chain-definitions';
import {
  getQuestDescriptionForPlayer as getQuestDescriptionForPlayerFromPresentation,
  getQuestIssuedMessageForPlayer as getQuestIssuedMessageForPlayerFromPresentation,
} from './quest-presentation';

const QUEST_WEIGHTS: Record<MinorCivArchetype, Record<QuestType, number>> = {
  militaristic: { destroy_camp: 0.6, defeat_units: 0.4, gift_gold: 0.0, trade_route: 0.0, sponsor_festival: 0.0 },
  mercantile: { gift_gold: 0.6, trade_route: 0.25, destroy_camp: 0.1, defeat_units: 0.05, sponsor_festival: 0.0 },
  cultural: { trade_route: 0.4, gift_gold: 0.3, destroy_camp: 0.15, defeat_units: 0.15, sponsor_festival: 0.0 },
};

const NORMAL_QUEST_OPTIONS: Record<QuestType, QuestObjectiveOption> = {
  destroy_camp: { type: 'destroy_camp', radius: 8, description: 'Destroy a nearby barbarian camp' },
  gift_gold: { type: 'gift_gold', goldMultiplier: 1, description: 'Contribute gold to this city-state' },
  defeat_units: { type: 'defeat_units', radius: 8, description: 'Defeat nearby hostile units' },
  trade_route: { type: 'trade_route', description: 'Establish a trade route to this city-state' },
  sponsor_festival: { type: 'sponsor_festival', description: 'Sponsor a cultural festival' },
};

export function generateQuest(
  archetype: MinorCivArchetype,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
  state: GameState,
  rng: () => number,
  counters: IdCounters,
): Quest | null {
  const weights = QUEST_WEIGHTS[archetype];
  const candidates = (Object.entries(weights) as [QuestType, number][])
    .filter(([, weight]) => weight > 0)
    .map(([type, weight]) => ({
      type,
      weight,
      target: createQuestTarget(
        { state, minorCivId, majorCivId, currentTurn, duration: 20 },
        NORMAL_QUEST_OPTIONS[type],
      ),
    }))
    .filter((candidate): candidate is { type: QuestType; weight: number; target: QuestTarget } => candidate.target !== null);

  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (roll < cumulative) {
      return makeQuest(candidate.type, candidate.target, currentTurn, counters);
    }
  }

  const fallback = candidates[candidates.length - 1];
  return makeQuest(fallback.type, fallback.target, currentTurn, counters);
}

function makeQuest(type: QuestType, target: QuestTarget, currentTurn: number, counters: IdCounters): Quest {
  const reward = getRewardForType(type);
  return {
    id: `quest-${counters.nextQuestId++}`,
    type,
    description: getQuestDescription(type, target),
    target,
    cityId: target.type === 'defeat_units' ? target.cityId : undefined,
    reward,
    progress: 0,
    status: 'active',
    turnIssued: currentTurn,
    expiresOnTurn: currentTurn + 20,
  };
}

function getRewardForType(type: QuestType): QuestReward {
  switch (type) {
    case 'destroy_camp': return { relationshipBonus: 25, gold: 50 };
    case 'gift_gold': return { relationshipBonus: 20 };
    case 'defeat_units': return { relationshipBonus: 30, freeUnit: 'warrior' };
    case 'trade_route': return { relationshipBonus: 25, science: 20 };
    case 'sponsor_festival': return { relationshipBonus: 25 };
  }
}

function getQuestDescription(type: QuestType, target: QuestTarget): string {
  switch (type) {
    case 'destroy_camp': return 'Destroy a nearby barbarian camp';
    case 'gift_gold': return `Gift ${(target as { amount: number }).amount} gold`;
    case 'defeat_units': return `Defeat ${(target as { count: number }).count} enemy units nearby`;
    case 'trade_route': return 'Establish a trade route to our city';
    case 'sponsor_festival': return `Sponsor a festival for ${(target as { amount: number }).amount} gold`;
  }
}

export function checkQuestCompletion(quest: Quest, state: Pick<GameState, 'barbarianCamps'>): boolean {
  switch (quest.target.type) {
    case 'destroy_camp':
      return !(quest.target.campId in state.barbarianCamps);
    case 'gift_gold':
      return quest.progress >= quest.target.amount;
    case 'defeat_units':
      return quest.progress >= quest.target.count;
    case 'trade_route':
      return quest.progress >= 1;
    case 'sponsor_festival':
      return quest.progress >= 1;
    default:
      return false;
  }
}

export function processQuestExpiry(quest: Quest, currentTurn: number): Quest {
  if (quest.status !== 'active') return quest;
  if (quest.expiresOnTurn !== null && currentTurn > quest.expiresOnTurn) {
    return { ...quest, status: 'expired' };
  }
  return quest;
}

export function awardQuestReward(reward: QuestReward): QuestReward {
  return reward;
}

export function isQuestTargetKnownToPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): boolean {
  return !getQuestDescriptionForPlayerFromPresentation(state, playerId, quest).includes('foreign city')
    && !getQuestDescriptionForPlayerFromPresentation(state, playerId, quest).includes('discovered city-state');
}

export function getQuestDescriptionForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): string {
  return getQuestDescriptionForPlayerFromPresentation(state, playerId, quest);
}

export function getQuestIssuedMessageForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  minorCivName: string,
  quest: Quest,
): string {
  return getQuestIssuedMessageForPlayerFromPresentation(state, playerId, minorCivName, quest);
}
