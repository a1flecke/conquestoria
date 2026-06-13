import type { MinorCivArchetype, QuestReward } from '@/core/types';

export type QuestEra = 1 | 2 | 3 | 4;

export type QuestObjectiveOption =
  | { type: 'destroy_camp'; radius: number; description: string }
  | { type: 'defeat_units'; radius: number; fixedCount?: number; description: string }
  | { type: 'gift_gold'; goldMultiplier: number; description: string }
  | { type: 'trade_route'; description: string }
  | { type: 'sponsor_festival'; description: string };

export interface QuestChainEraVariant {
  title: string;
  preferred: QuestObjectiveOption;
  fallbacks: readonly QuestObjectiveOption[];
}

export interface QuestChainStepDefinition {
  duration: number;
  reward: QuestReward;
  eraVariants: Record<QuestEra, QuestChainEraVariant>;
}

export interface QuestChainDefinition {
  id: string;
  name: string;
  theme: string;
  priority: number;
  steps: readonly [QuestChainStepDefinition, QuestChainStepDefinition, QuestChainStepDefinition];
}

export const ERA_QUEST_TUNING: Record<QuestEra, { baseGold: number; militaryCount: number; festivalGold: number }> = {
  1: { baseGold: 25, militaryCount: 1, festivalGold: 50 },
  2: { baseGold: 50, militaryCount: 2, festivalGold: 100 },
  3: { baseGold: 75, militaryCount: 3, festivalGold: 150 },
  4: { baseGold: 100, militaryCount: 4, festivalGold: 200 },
};

const REWARDS = [
  { relationshipBonus: 15 },
  { relationshipBonus: 20 },
  { relationshipBonus: 25 },
] as const;

function allEras(variant: QuestChainEraVariant): Record<QuestEra, QuestChainEraVariant> {
  return { 1: variant, 2: variant, 3: variant, 4: variant };
}

const militarySteps: QuestChainDefinition['steps'] = [
  {
    duration: 20,
    reward: REWARDS[0],
    eraVariants: allEras({
      title: 'Remove the Immediate Threat',
      preferred: { type: 'destroy_camp', radius: 8, description: 'Destroy a nearby hostile camp' },
      fallbacks: [
        { type: 'defeat_units', radius: 8, fixedCount: 1, description: 'Defeat a nearby hostile unit' },
        { type: 'gift_gold', goldMultiplier: 1, description: 'Fund immediate defenses' },
      ],
    }),
  },
  {
    duration: 20,
    reward: REWARDS[1],
    eraVariants: allEras({
      title: 'Secure the Approaches',
      preferred: { type: 'destroy_camp', radius: 10, description: 'Destroy another nearby hostile camp' },
      fallbacks: [
        { type: 'defeat_units', radius: 10, description: 'Defeat nearby hostile units' },
        { type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund reinforcements' },
      ],
    }),
  },
  {
    duration: 20,
    reward: REWARDS[2],
    eraVariants: allEras({
      title: 'Stand With Us',
      preferred: { type: 'defeat_units', radius: 10, description: 'Defeat nearby hostile units' },
      fallbacks: [
        { type: 'destroy_camp', radius: 10, description: 'Destroy a nearby hostile camp' },
        { type: 'gift_gold', goldMultiplier: 1.5, description: 'Mobilize city defenses' },
      ],
    }),
  },
];

const tradeSteps: QuestChainDefinition['steps'] = [
  {
    duration: 20,
    reward: REWARDS[0],
    eraVariants: allEras({
      title: 'Demonstrate Good Credit',
      preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Demonstrate good credit' },
      fallbacks: [],
    }),
  },
  {
    duration: 20,
    reward: REWARDS[1],
    eraVariants: allEras({
      title: 'Open an Exchange',
      preferred: { type: 'trade_route', description: 'Establish a new trade route to this city-state' },
      fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.25, description: 'Finance a merchant delegation' }],
    }),
  },
  {
    duration: 20,
    reward: REWARDS[2],
    eraVariants: allEras({
      title: 'Secure the Partnership',
      preferred: { type: 'trade_route', description: 'Establish another new trade route to this city-state' },
      fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Capitalize the partnership' }],
    }),
  },
];

const culturalSteps: QuestChainDefinition['steps'] = [
  {
    duration: 20,
    reward: REWARDS[0],
    eraVariants: {
      1: { title: 'Honor the Storytellers', preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Support the city-state\'s storytellers' }, fallbacks: [] },
      2: { title: 'Patronize Local Arts', preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Patronize local artists' }, fallbacks: [] },
      3: { title: 'Convene Philosophers', preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Fund a gathering of philosophers' }, fallbacks: [] },
      4: { title: 'Commission the Great Stage', preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Commission performers for the great stage' }, fallbacks: [] },
    },
  },
  {
    duration: 20,
    reward: REWARDS[1],
    eraVariants: {
      1: { title: 'Host a Seasonal Fair', preferred: { type: 'sponsor_festival', description: 'Host a seasonal fair using an accessible luxury' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund fair preparations' }] },
      2: { title: 'Exchange Artisans', preferred: { type: 'sponsor_festival', description: 'Host an artisan exchange using an accessible luxury' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund traveling artisans' }] },
      3: { title: 'Welcome a Cultural Delegation', preferred: { type: 'sponsor_festival', description: 'Welcome a cultural delegation using an accessible luxury' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund the delegation' }] },
      4: { title: 'Open an Exchange Route', preferred: { type: 'trade_route', description: 'Establish a cultural exchange route to this city-state' }, fallbacks: [{ type: 'sponsor_festival', description: 'Host an international arts exchange' }, { type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund traveling artists' }] },
    },
  },
  {
    duration: 20,
    reward: REWARDS[2],
    eraVariants: {
      1: { title: 'Feast of First Songs', preferred: { type: 'sponsor_festival', description: 'Sponsor the Feast of First Songs' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Fund feast preparations' }] },
      2: { title: 'Festival of Crafts', preferred: { type: 'sponsor_festival', description: 'Sponsor the Festival of Crafts' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Fund festival preparations' }] },
      3: { title: 'Festival of Ideas', preferred: { type: 'sponsor_festival', description: 'Sponsor the Festival of Ideas' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Fund festival preparations' }] },
      4: { title: 'Grand Festival', preferred: { type: 'sponsor_festival', description: 'Sponsor the Grand Festival' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Fund Grand Festival preparations' }] },
    },
  },
];

export const QUEST_CHAINS_BY_ARCHETYPE = {
  militaristic: [{ id: 'military-assistance', name: 'Military Assistance', theme: 'Protect the city-state and prove dependable military support.', priority: 10, steps: militarySteps }],
  mercantile: [{ id: 'trade-partnership', name: 'Trade Partnership', theme: 'Build trust through credit, exchange, and durable commerce.', priority: 10, steps: tradeSteps }],
  cultural: [{ id: 'festivals-and-exchange', name: 'Festivals And Exchange', theme: 'Deepen cultural ties through patronage, exchange, and celebration.', priority: 10, steps: culturalSteps }],
} satisfies Record<MinorCivArchetype, readonly QuestChainDefinition[]>;

export function getAllQuestChains(): QuestChainDefinition[] {
  return Object.values(QUEST_CHAINS_BY_ARCHETYPE)
    .flatMap(chains => [...chains])
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function getQuestChain(chainId: string): QuestChainDefinition | null {
  return getAllQuestChains().find(chain => chain.id === chainId) ?? null;
}

export function getQuestChainForArchetype(archetype: MinorCivArchetype): QuestChainDefinition {
  return QUEST_CHAINS_BY_ARCHETYPE[archetype][0];
}

export function getQuestStepVariant(chain: QuestChainDefinition, stepIndex: 0 | 1 | 2, era: number): QuestChainEraVariant {
  const normalizedEra = Math.max(1, Math.min(4, era)) as QuestEra;
  return chain.steps[stepIndex].eraVariants[normalizedEra];
}
