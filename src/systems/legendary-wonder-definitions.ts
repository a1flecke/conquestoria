import type { LegendaryWonderDefinition } from '@/core/types';
import { getApprovedM4LegendaryWonderRoster } from '@/systems/approved-legendary-wonder-roster';

export interface LateEraWonderTechRequirement {
  wonderId: string;
  requiredTechs: string[];
}

const LEGENDARY_WONDER_DEFINITIONS_BY_ID: Record<string, LegendaryWonderDefinition> = {
  'oracle-of-delphi': {
    id: 'oracle-of-delphi',
    name: 'Oracle of Delphi',
    era: 3,
    productionCost: 120,
    requiredTechs: ['philosophy', 'pilgrimages'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'discover-natural-wonder', type: 'discover_wonder', description: 'Discover a natural wonder.' },
      { id: 'complete-pilgrimage-route', type: 'trade_route', description: 'Establish a pilgrimage trade route.' },
    ],
    reward: {
      summary: '+60 research immediately and +1 science in the host city each turn.',
      instantResearch: 60,
      cityYieldBonus: { science: 1 },
    },
  },
  'grand-canal': {
    id: 'grand-canal',
    name: 'Grand Canal',
    era: 4,
    productionCost: 150,
    requiredTechs: ['city-planning', 'printing'],
    requiredResources: ['stone'],
    cityRequirement: 'river',
    questSteps: [
      { id: 'connect-two-cities', type: 'trade-routes-established', targetCount: 2, description: 'Establish 2 trade routes.' },
      { id: 'grow-river-city', type: 'buildings-in-multiple-cities', targetCount: 1, description: 'Develop this river city into a major civic center.' },
    ],
    reward: {
      summary: '+2 food and +2 gold in the host city each turn.',
      cityYieldBonus: { food: 2, gold: 2 },
    },
  },
  'sun-spire': {
    id: 'sun-spire',
    name: 'Sun Spire',
    era: 4,
    productionCost: 165,
    requiredTechs: ['architecture-arts', 'theology-tech'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-sacred-route', type: 'trade_route', description: 'Establish a sacred trade route.' },
      { id: 'defeat-nearby-stronghold', type: 'defeat_stronghold', scope: 'near-city', radius: 4, description: 'Clear a nearby barbarian stronghold.' },
    ],
    reward: {
      summary: '+2 production and +1 gold in the host city each turn.',
      cityYieldBonus: { production: 2, gold: 1 },
    },
  },
  'world-archive': {
    id: 'world-archive',
    name: 'World Archive',
    era: 4,
    productionCost: 180,
    requiredTechs: ['printing', 'diplomats'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-four-communication-techs', type: 'research_count', track: 'communication', targetCount: 4, description: 'Complete 4 communication technologies.' },
      { id: 'establish-two-trade-links', type: 'trade-routes-established', targetCount: 2, description: 'Maintain 2 active trade routes.' },
    ],
    reward: {
      summary: '+4 science empire-wide each turn.',
      civYieldBonus: { science: 4 },
    },
  },
  'moonwell-gardens': {
    id: 'moonwell-gardens',
    name: 'Moonwell Gardens',
    era: 4,
    productionCost: 175,
    requiredTechs: ['agricultural-science', 'pilgrimages'],
    requiredResources: [],
    cityRequirement: 'river',
    questSteps: [
      { id: 'tend-flourishing-gardens', type: 'buildings-in-multiple-cities', targetCount: 2, description: 'Develop 2 well-built cities to support the gardens.' },
      { id: 'chart-sacred-landscapes', type: 'map-discoveries', targetCount: 2, description: 'Discover 2 natural wonders.' },
    ],
    reward: {
      summary: '+3 food and +1 science in the host city each turn.',
      cityYieldBonus: { food: 3, science: 1 },
    },
  },
  'ironroot-foundry': {
    id: 'ironroot-foundry',
    name: 'Ironroot Foundry',
    era: 4,
    productionCost: 180,
    requiredTechs: ['steel-forging', 'city-planning'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'raise-two-industrial-cities', type: 'buildings-in-multiple-cities', targetCount: 2, description: 'Develop 2 industrial cities.' },
      { id: 'break-a-frontier-stronghold', type: 'defeat_stronghold', scope: 'near-city', radius: 4, description: 'Destroy a barbarian stronghold threatening your frontier.' },
    ],
    reward: {
      summary: '+3 production and +1 science in the host city each turn.',
      cityYieldBonus: { production: 3, science: 1 },
    },
  },
  'tidecaller-bastion': {
    id: 'tidecaller-bastion',
    name: 'Tidecaller Bastion',
    era: 4,
    productionCost: 170,
    requiredTechs: ['caravels', 'fortresses'],
    requiredResources: ['stone'],
    cityRequirement: 'coastal',
    questSteps: [
      { id: 'secure-coastal-trade', type: 'trade-routes-established', targetCount: 1, description: 'Establish a coastal trade route.' },
      { id: 'chart-distant-shores', type: 'map-discoveries', targetCount: 2, description: 'Discover 2 natural wonders or distant landmarks.' },
    ],
    reward: {
      summary: '+2 production and +2 gold in the host city each turn.',
      cityYieldBonus: { production: 2, gold: 2 },
    },
  },
  'starvault-observatory': {
    id: 'starvault-observatory',
    name: 'Starvault Observatory',
    era: 4,
    productionCost: 185,
    requiredTechs: ['astronomy', 'natural-philosophy'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'trace-two-celestial-sites', type: 'map-discoveries', targetCount: 2, description: 'Discover 2 remarkable sites.' },
      { id: 'raise-scholarly-centers', type: 'buildings-in-multiple-cities', targetCount: 2, description: 'Develop 2 scholarly cities.' },
    ],
    reward: {
      summary: '+2 science in the host city and +2 science empire-wide each turn.',
      cityYieldBonus: { science: 2 },
      civYieldBonus: { science: 2 },
    },
  },
  'whispering-exchange': {
    id: 'whispering-exchange',
    name: 'Whispering Exchange',
    era: 4,
    productionCost: 190,
    requiredTechs: ['banking', 'diplomats'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'broker-three-routes', type: 'trade-routes-established', targetCount: 3, description: 'Maintain 3 active trade routes.' },
      { id: 'raise-three-merchant-hubs', type: 'buildings-in-multiple-cities', targetCount: 3, description: 'Develop 3 prosperous cities.' },
    ],
    reward: {
      summary: '+4 gold and +1 science empire-wide each turn.',
      civYieldBonus: { gold: 4, science: 1 },
    },
  },
  'hall-of-champions': {
    id: 'hall-of-champions',
    name: 'Hall of Champions',
    era: 4,
    productionCost: 185,
    requiredTechs: ['tactics', 'drama-poetry'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'win-a-famous-victory', type: 'defeat_stronghold', scope: 'any', description: 'Break a major enemy stronghold.' },
      { id: 'raise-two-glorious-cities', type: 'buildings-in-multiple-cities', targetCount: 2, description: 'Develop 2 celebrated cities.' },
    ],
    reward: {
      summary: '+2 production and +2 gold empire-wide each turn.',
      civYieldBonus: { production: 2, gold: 2 },
    },
  },
  'gate-of-the-world': {
    id: 'gate-of-the-world',
    name: 'Gate of the World',
    era: 4,
    productionCost: 195,
    requiredTechs: ['exploration-tech', 'diplomats'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      { id: 'discover-three-far-horizons', type: 'map-discoveries', targetCount: 3, description: 'Discover 3 remarkable sites.' },
      { id: 'link-the-seas', type: 'trade-routes-established', targetCount: 2, description: 'Maintain 2 active long-range trade routes.' },
    ],
    reward: {
      summary: '+2 gold and +2 science empire-wide each turn.',
      civYieldBonus: { gold: 2, science: 2 },
    },
  },
  'leviathan-drydock': {
    id: 'leviathan-drydock',
    name: 'Leviathan Drydock',
    era: 4,
    productionCost: 200,
    requiredTechs: ['caravels', 'harbor-building'],
    requiredResources: ['stone'],
    cityRequirement: 'coastal',
    questSteps: [
      { id: 'build-two-harbor-cities', type: 'buildings-in-multiple-cities', targetCount: 2, description: 'Develop 2 major port cities.' },
      { id: 'prove-open-sea-command', type: 'trade-routes-established', targetCount: 1, description: 'Maintain an active overseas trade route.' },
    ],
    reward: {
      summary: '+2 production and +2 gold in the host city each turn.',
      cityYieldBonus: { production: 2, gold: 2 },
    },
  },
  'storm-signal-spire': {
    id: 'storm-signal-spire',
    name: 'Storm-Signal Spire',
    era: 5,
    productionCost: 220,
    requiredTechs: ['mass-media', 'digital-surveillance'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      { id: 'map-four-key-sites', type: 'map-discoveries', targetCount: 4, description: 'Discover 4 key sites across the world.' },
      { id: 'build-three-broadcast-centers', type: 'buildings-in-multiple-cities', targetCount: 3, description: 'Develop 3 advanced cities.' },
    ],
    reward: {
      summary: '+3 gold and +2 science empire-wide each turn.',
      civYieldBonus: { gold: 3, science: 2 },
    },
  },
  'manhattan-project': {
    id: 'manhattan-project',
    name: 'Manhattan Project',
    era: 5,
    productionCost: 240,
    requiredTechs: ['nuclear-theory'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-six-advanced-techs', type: 'research_count', targetCount: 6, description: 'Complete 6 advanced technologies.' },
      { id: 'raise-three-research-centers', type: 'buildings-in-multiple-cities', targetCount: 3, description: 'Develop 3 research-capable cities.' },
    ],
    reward: {
      summary: '+120 research immediately and +2 science empire-wide each turn.',
      instantResearch: 120,
      civYieldBonus: { science: 2 },
    },
  },
  internet: {
    id: 'internet',
    name: 'Internet',
    era: 5,
    productionCost: 250,
    requiredTechs: ['mass-media', 'global-logistics'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'network-three-cities', type: 'buildings-in-multiple-cities', targetCount: 3, description: 'Develop 3 connected urban centers.' },
      { id: 'maintain-three-trade-links', type: 'trade-routes-established', targetCount: 3, description: 'Maintain 3 active trade routes.' },
    ],
    reward: {
      summary: '+6 science and +2 gold empire-wide each turn.',
      civYieldBonus: { science: 6, gold: 2 },
    },
  },
};

export const LEGENDARY_WONDER_DEFINITIONS: LegendaryWonderDefinition[] = getApprovedM4LegendaryWonderRoster().map(entry => {
  const definition = LEGENDARY_WONDER_DEFINITIONS_BY_ID[entry.id];
  if (!definition) {
    throw new Error(`Missing legendary wonder definition for approved roster entry ${entry.id}`);
  }
  return definition;
});

export function getLegendaryWonderDefinitions(): LegendaryWonderDefinition[] {
  return LEGENDARY_WONDER_DEFINITIONS.map(definition => ({
    ...definition,
    requiredTechs: [...definition.requiredTechs],
    requiredResources: [...definition.requiredResources],
    questSteps: definition.questSteps.map(step => ({ ...step })),
    reward: {
      ...definition.reward,
      civYieldBonus: definition.reward.civYieldBonus ? { ...definition.reward.civYieldBonus } : undefined,
      cityYieldBonus: definition.reward.cityYieldBonus ? { ...definition.reward.cityYieldBonus } : undefined,
    },
  }));
}

export function getLegendaryWonderDefinition(wonderId: string): LegendaryWonderDefinition | undefined {
  return LEGENDARY_WONDER_DEFINITIONS_BY_ID[wonderId];
}

const LATE_ERA_WONDER_TECH_REQUIREMENTS: LateEraWonderTechRequirement[] = [
  {
    wonderId: 'manhattan-project',
    requiredTechs: ['nuclear-theory'],
  },
  {
    wonderId: 'internet',
    requiredTechs: ['mass-media', 'global-logistics'],
  },
];

export function getLateEraWonderTechRequirements(): LateEraWonderTechRequirement[] {
  return LATE_ERA_WONDER_TECH_REQUIREMENTS.map(requirement => ({
    wonderId: requirement.wonderId,
    requiredTechs: [...requirement.requiredTechs],
  }));
}
