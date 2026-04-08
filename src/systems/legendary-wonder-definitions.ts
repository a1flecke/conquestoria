import type { LegendaryWonderDefinition } from '@/core/types';

export const LEGENDARY_WONDER_DEFINITIONS: LegendaryWonderDefinition[] = [
  {
    id: 'oracle-of-delphi',
    name: 'Oracle of Delphi',
    era: 3,
    productionCost: 120,
    requiredTechs: ['philosophy', 'pilgrimages'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'discover-natural-wonder', type: 'discover_wonder' },
      { id: 'complete-pilgrimage-route', type: 'trade_route' },
    ],
    reward: {
      summary: '+60 research immediately and +1 science in the host city each turn.',
      instantResearch: 60,
      cityYieldBonus: { science: 1 },
    },
  },
  {
    id: 'grand-canal',
    name: 'Grand Canal',
    era: 4,
    productionCost: 150,
    requiredTechs: ['city-planning', 'printing'],
    requiredResources: ['stone'],
    cityRequirement: 'river',
    questSteps: [
      { id: 'connect-two-cities', type: 'trade_route' },
      { id: 'grow-river-city', type: 'research_count' },
    ],
    reward: {
      summary: '+2 food and +2 gold in the host city each turn.',
      cityYieldBonus: { food: 2, gold: 2 },
    },
  },
  {
    id: 'sun-spire',
    name: 'Sun Spire',
    era: 4,
    productionCost: 165,
    requiredTechs: ['architecture-arts', 'theology-tech'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-sacred-route', type: 'trade_route' },
      { id: 'defeat-nearby-stronghold', type: 'defeat_stronghold' },
    ],
    reward: {
      summary: '+2 production and +1 gold in the host city each turn.',
      cityYieldBonus: { production: 2, gold: 1 },
    },
  },
  {
    id: 'world-archive',
    name: 'World Archive',
    era: 4,
    productionCost: 180,
    requiredTechs: ['printing', 'diplomats'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-four-communication-techs', type: 'research_count' },
      { id: 'establish-two-trade-links', type: 'trade_route' },
    ],
    reward: {
      summary: '+4 science empire-wide each turn.',
      civYieldBonus: { science: 4 },
    },
  },
];

export function getLegendaryWonderDefinition(wonderId: string): LegendaryWonderDefinition | undefined {
  return LEGENDARY_WONDER_DEFINITIONS.find(wonder => wonder.id === wonderId);
}
