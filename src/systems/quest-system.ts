import type { MinorCivArchetype, Quest, QuestReward, QuestTarget, QuestType, GameState } from '@/core/types';
import { hexDistance } from './hex-utils';
import { hasDiscoveredCity, hasDiscoveredMinorCiv } from './discovery-system';

let questIdCounter = 0;

export function resetQuestId(): void {
  questIdCounter = 0;
}

const QUEST_WEIGHTS: Record<MinorCivArchetype, Record<QuestType, number>> = {
  militaristic: { destroy_camp: 0.6, defeat_units: 0.4, gift_gold: 0.0, trade_route: 0.0 },
  mercantile: { gift_gold: 0.6, trade_route: 0.25, destroy_camp: 0.1, defeat_units: 0.05 },
  cultural: { trade_route: 0.4, gift_gold: 0.3, destroy_camp: 0.15, defeat_units: 0.15 },
};

const GOLD_PER_ERA = [0, 25, 50, 75, 100];

export function generateQuest(
  archetype: MinorCivArchetype,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
  state: Pick<GameState, 'barbarianCamps' | 'era' | 'minorCivs' | 'cities' | 'units'>,
  rng: () => number,
): Quest | null {
  const weights = QUEST_WEIGHTS[archetype];
  const candidates = (Object.entries(weights) as [QuestType, number][])
    .filter(([, weight]) => weight > 0)
    .map(([type, weight]) => ({
      type,
      weight,
      target: buildQuestTarget(type, minorCivId, majorCivId, state),
    }))
    .filter((candidate): candidate is { type: QuestType; weight: number; target: QuestTarget } => candidate.target !== null);

  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (roll < cumulative) {
      return makeQuest(candidate.type, candidate.target, currentTurn);
    }
  }

  const fallback = candidates[candidates.length - 1];
  return makeQuest(fallback.type, fallback.target, currentTurn);
}

function buildQuestTarget(
  type: QuestType,
  minorCivId: string,
  majorCivId: string,
  state: Pick<GameState, 'barbarianCamps' | 'era' | 'minorCivs' | 'cities' | 'units'>,
): QuestTarget | null {
  const minorCiv = state.minorCivs?.[minorCivId];
  const city = minorCiv ? state.cities?.[minorCiv.cityId] : null;
  const cityPosition = city?.position;

  switch (type) {
    case 'destroy_camp': {
      if (!cityPosition) return null;
      const camps = Object.values(state.barbarianCamps)
        .filter(camp => hexDistance(camp.position, cityPosition) <= 8)
        .sort((a, b) => hexDistance(a.position, cityPosition) - hexDistance(b.position, cityPosition));
      if (camps.length === 0) return null;
      const camp = camps[0];
      return { type: 'destroy_camp', campId: camp.id };
    }
    case 'gift_gold':
      return { type: 'gift_gold', amount: GOLD_PER_ERA[state.era] ?? 25 };
    case 'defeat_units': {
      if (!cityPosition) return null;
      const nearbyHostiles = Object.values(state.units ?? {}).filter(unit => (
        unit.owner !== majorCivId
        && unit.owner !== minorCivId
        && hexDistance(unit.position, cityPosition) <= 8
      ));
      if (nearbyHostiles.length < 2) return null;
      return { type: 'defeat_units', count: 2, nearPosition: cityPosition, radius: 8 };
    }
    case 'trade_route':
      return null;
    default:
      return null;
  }
}

function makeQuest(type: QuestType, target: QuestTarget, currentTurn: number): Quest {
  questIdCounter++;
  const reward = getRewardForType(type);
  return {
    id: `quest-${questIdCounter}`,
    type,
    description: getQuestDescription(type, target),
    target,
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
  }
}

function getQuestDescription(type: QuestType, target: QuestTarget): string {
  switch (type) {
    case 'destroy_camp': return 'Destroy a nearby barbarian camp';
    case 'gift_gold': return `Gift ${(target as { amount: number }).amount} gold`;
    case 'defeat_units': return `Defeat ${(target as { count: number }).count} enemy units nearby`;
    case 'trade_route': return 'Establish a trade route to our city';
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
  const target = quest.target as QuestTarget & { cityId?: string };

  if ('cityId' in target && target.cityId) {
    return hasDiscoveredCity(state as GameState, playerId, target.cityId);
  }

  if (target.type === 'trade_route') {
    return hasDiscoveredMinorCiv(state as GameState, playerId, target.minorCivId);
  }

  return true;
}
