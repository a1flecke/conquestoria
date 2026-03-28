import type { MinorCivArchetype, Quest, QuestReward, QuestTarget, QuestType, GameState } from '@/core/types';

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
  state: Pick<GameState, 'barbarianCamps' | 'era'>,
  rng: () => number,
): Quest | null {
  const weights = QUEST_WEIGHTS[archetype];
  const roll = rng();

  // Select quest type by cumulative weight
  let cumulative = 0;
  let selectedType: QuestType = 'gift_gold';
  for (const [type, weight] of Object.entries(weights) as [QuestType, number][]) {
    cumulative += weight;
    if (roll < cumulative) {
      selectedType = type;
      break;
    }
  }

  // Build target based on type; fall back if no valid target
  const target = buildQuestTarget(selectedType, minorCivId, state);
  if (!target) {
    // Fallback to gift_gold which always works
    const fallbackTarget = buildQuestTarget('gift_gold', minorCivId, state);
    if (!fallbackTarget) return null;
    return makeQuest('gift_gold', fallbackTarget, currentTurn);
  }

  return makeQuest(selectedType, target, currentTurn);
}

function buildQuestTarget(
  type: QuestType,
  minorCivId: string,
  state: Pick<GameState, 'barbarianCamps' | 'era'>,
): QuestTarget | null {
  switch (type) {
    case 'destroy_camp': {
      const camps = Object.values(state.barbarianCamps);
      if (camps.length === 0) return null;
      const camp = camps[0];
      return { type: 'destroy_camp', campId: camp.id };
    }
    case 'gift_gold':
      return { type: 'gift_gold', amount: GOLD_PER_ERA[state.era] ?? 25 };
    case 'defeat_units':
      return { type: 'defeat_units', count: 2, nearPosition: { q: 0, r: 0 }, radius: 8 };
    case 'trade_route':
      return { type: 'trade_route', minorCivId };
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
