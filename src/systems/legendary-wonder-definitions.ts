import type { LegendaryWonderDefinition } from '@/core/types';
import { getApprovedM4LegendaryWonderRoster } from '@/systems/approved-legendary-wonder-roster';

export interface LateEraWonderTechRequirement {
  wonderId: string;
  requiredTechs: string[];
}

const LATE_ERA_WONDER_IDS = ['storm-signal-spire', 'manhattan-project', 'internet'] as const;

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
      { id: 'grow-river-city', type: 'buildings-in-multiple-cities', targetCount: 1, cityScope: 'host-city', minimumBuildingsPerCity: 3, description: 'Develop this river city into a major civic center.' },
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
      { id: 'tend-flourishing-gardens', type: 'buildings-in-multiple-cities', targetCount: 2, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 2 well-built cities to support the gardens.' },
      { id: 'chart-sacred-landscapes', type: 'map-discoveries', targetCount: 2, discoveryTypes: ['natural-wonder'], description: 'Discover 2 natural wonders.' },
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
      { id: 'raise-two-industrial-cities', type: 'buildings-in-multiple-cities', targetCount: 2, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 2 industrial cities.' },
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
      { id: 'secure-coastal-trade', type: 'trade-routes-established', targetCount: 1, routeRequirement: 'coastal', description: 'Establish a coastal trade route.' },
      { id: 'chart-distant-shores', type: 'map-discoveries', targetCount: 2, discoveryTypes: ['natural-wonder', 'tribal-village'], description: 'Discover 2 natural wonders or distant landmarks.' },
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
      { id: 'trace-two-celestial-sites', type: 'map-discoveries', targetCount: 2, discoveryTypes: ['natural-wonder', 'tribal-village'], description: 'Discover 2 remarkable sites.' },
      { id: 'raise-scholarly-centers', type: 'buildings-in-multiple-cities', targetCount: 2, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 2 scholarly cities.' },
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
      { id: 'raise-three-merchant-hubs', type: 'buildings-in-multiple-cities', targetCount: 3, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 3 prosperous cities.' },
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
      { id: 'raise-two-glorious-cities', type: 'buildings-in-multiple-cities', targetCount: 2, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 2 celebrated cities.' },
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
      { id: 'discover-three-far-horizons', type: 'map-discoveries', targetCount: 3, discoveryTypes: ['natural-wonder', 'tribal-village'], description: 'Discover 3 remarkable sites.' },
      { id: 'link-the-seas', type: 'trade-routes-established', targetCount: 2, routeRequirement: 'long-range', minimumRouteDistance: 8, description: 'Maintain 2 active long-range trade routes.' },
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
      { id: 'build-two-harbor-cities', type: 'buildings-in-multiple-cities', targetCount: 2, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 2 major port cities.' },
      { id: 'prove-open-sea-command', type: 'trade-routes-established', targetCount: 1, routeRequirement: 'overseas', description: 'Maintain an active overseas trade route.' },
    ],
    reward: {
      summary: '+2 production and +2 gold in the host city each turn.',
      cityYieldBonus: { production: 2, gold: 2 },
    },
  },
  'storm-signal-spire': {
    id: 'storm-signal-spire',
    name: 'Storm-Signal Spire',
    era: 9,
    productionCost: 220,
    requiredTechs: ['mass-media', 'digital-surveillance'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      { id: 'map-four-key-sites', type: 'map-discoveries', targetCount: 4, discoveryTypes: ['natural-wonder', 'tribal-village'], description: 'Discover 4 key sites across the world.' },
      { id: 'build-three-broadcast-centers', type: 'buildings-in-multiple-cities', targetCount: 3, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 3 advanced cities.' },
    ],
    reward: {
      summary: '+3 gold and +2 science empire-wide each turn.',
      civYieldBonus: { gold: 3, science: 2 },
    },
  },
  'manhattan-project': {
    id: 'manhattan-project',
    name: 'Manhattan Project',
    era: 11,
    productionCost: 240,
    requiredTechs: ['nuclear-theory'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      { id: 'complete-six-advanced-techs', type: 'research_count', targetCount: 6, description: 'Complete 6 advanced technologies.' },
      { id: 'raise-three-research-centers', type: 'buildings-in-multiple-cities', targetCount: 3, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 3 research-capable cities.' },
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
    era: 12,
    productionCost: 250,
    requiredTechs: ['mass-media', 'global-logistics'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      { id: 'network-three-cities', type: 'buildings-in-multiple-cities', targetCount: 3, cityScope: 'empire', minimumBuildingsPerCity: 3, description: 'Develop 3 connected urban centers.' },
      { id: 'maintain-three-trade-links', type: 'trade-routes-established', targetCount: 3, description: 'Maintain 3 active trade routes.' },
    ],
    reward: {
      summary: '+6 science and +2 gold empire-wide each turn.',
      civYieldBonus: { science: 6, gold: 2 },
    },
  },

  // ERA 5 WONDERS
  'sistine-vault': {
    id: 'sistine-vault',
    name: 'Sistine Vault',
    era: 5,
    productionCost: 220,
    requiredTechs: ['renaissance-painting', 'monastic-orders'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'arts-techs',
        type: 'research_count',
        track: 'arts',
        targetCount: 4,
        description: 'Complete 4 arts or spirituality technologies.',
      },
      {
        id: 'city-depth',
        type: 'buildings-in-multiple-cities',
        targetCount: 3,
        cityScope: 'empire',
        minimumBuildingsPerCity: 3,
        description: 'Develop 3 cities with at least 3 buildings each.',
      },
    ],
    reward: {
      summary: '+3 science and +1 gold empire-wide each turn.',
      civYieldBonus: { science: 3, gold: 1 },
    },
  },
  'codex-eternal': {
    id: 'codex-eternal',
    name: 'Codex Eternal',
    era: 5,
    productionCost: 220,
    requiredTechs: ['printing-press', 'scientific-method'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'science-techs',
        type: 'research_count',
        track: 'science',
        targetCount: 4,
        description: 'Complete 4 science technologies.',
      },
      {
        id: 'libraries',
        type: 'buildings-in-multiple-cities',
        targetCount: 3,
        cityScope: 'empire',
        minimumBuildingsPerCity: 2,
        description: 'Build at least 2 buildings (including a library) in 3 separate cities.',
      },
    ],
    reward: {
      summary: '+4 science empire-wide each turn.',
      civYieldBonus: { science: 4 },
    },
  },
  'navigators-compass': {
    id: 'navigators-compass',
    name: "Navigator's Compass",
    era: 5,
    productionCost: 220,
    requiredTechs: ['circumnavigation', 'deep-sea-routes'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      {
        id: 'foreign-discoveries',
        type: 'map-discoveries',
        targetCount: 3,
        discoveryTypes: ['natural-wonder', 'tribal-village'],
        description: 'Discover 3 natural wonders or tribal villages.',
      },
      {
        id: 'coastal-trade',
        type: 'trade-routes-established',
        targetCount: 2,
        routeRequirement: 'coastal',
        description: 'Establish 2 coastal trade routes.',
      },
    ],
    reward: {
      summary: '+4 gold empire-wide each turn. All newly trained naval units gain +1 movement permanently.',
      civYieldBonus: { gold: 4 },
    },
  },
  'palace-of-the-sun': {
    id: 'palace-of-the-sun',
    name: 'Palace of the Sun',
    era: 6,
    productionCost: 265,
    requiredTechs: ['baroque-music', 'separation-of-powers'],
    requiredResources: ['gold_resource'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'gold-treasury',
        type: 'research_count',
        track: 'economy',
        targetCount: 4,
        description: 'Complete 4 economy technologies.',
      },
      {
        id: 'grand-cities',
        type: 'buildings-in-multiple-cities',
        targetCount: 3,
        cityScope: 'empire',
        minimumBuildingsPerCity: 5,
        description: 'Develop 3 cities to at least 5 buildings each.',
      },
    ],
    reward: {
      summary: '+5 gold and +1 production empire-wide each turn.',
      civYieldBonus: { gold: 5, production: 1 },
    },
  },
  'iron-arsenal': {
    id: 'iron-arsenal',
    name: 'Iron Arsenal',
    era: 6,
    productionCost: 265,
    requiredTechs: ['precision-casting', 'fortification-engineering'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'military-techs',
        type: 'research_count',
        track: 'military',
        targetCount: 4,
        description: 'Complete 4 military technologies.',
      },
      {
        id: 'strongholds',
        type: 'defeat_stronghold',
        targetCount: 2,
        description: 'Defeat 2 enemy strongholds or fortified cities.',
      },
    ],
    reward: {
      summary: '+3 production empire-wide each turn. Military production powerhouse.',
      civYieldBonus: { production: 3 },
    },
  },
  'merchant-admiralty': {
    id: 'merchant-admiralty',
    name: 'Merchant Admiralty',
    era: 6,
    productionCost: 265,
    requiredTechs: ['trade-winds', 'frigate-construction'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      {
        id: 'naval-routes',
        type: 'trade-routes-established',
        targetCount: 3,
        routeRequirement: 'coastal',
        description: 'Establish 3 coastal or overseas trade routes.',
      },
      {
        id: 'maritime-techs',
        type: 'research_count',
        track: 'maritime',
        targetCount: 3,
        description: 'Complete 3 maritime technologies.',
      },
    ],
    reward: {
      summary: '+6 gold empire-wide each turn. Maritime trading supremacy.',
      civYieldBonus: { gold: 6 },
    },
  },

  // ERA 7 LEGENDARY WONDERS
  'crystal-palace': {
    id: 'crystal-palace',
    name: 'Crystal Palace',
    era: 7,
    productionCost: 285,
    requiredTechs: ['industrialization', 'steel-production'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'industrial-research',
        type: 'research_count',
        track: 'science',
        targetCount: 4,
        description: 'Complete 4 science technologies.',
      },
      {
        id: 'factories-built',
        type: 'buildings-in-multiple-cities',
        targetCount: 3,
        cityScope: 'empire',
        minimumBuildingsPerCity: 6,
        description: 'Develop 3 cities to at least 6 buildings each.',
      },
    ],
    reward: {
      summary: '+5 production and +1 science empire-wide each turn. Emblem of the industrial age.',
      civYieldBonus: { production: 5, science: 1 },
    },
  },
  'suez-canal': {
    id: 'suez-canal',
    name: 'Suez Canal',
    era: 7,
    productionCost: 290,
    requiredTechs: ['ironclad-warships', 'colonial-railways'],
    requiredResources: [],
    cityRequirement: 'coastal',
    questSteps: [
      {
        id: 'maritime-research',
        type: 'research_count',
        track: 'maritime',
        targetCount: 4,
        description: 'Complete 4 maritime technologies.',
      },
      {
        id: 'trade-routes-ocean',
        type: 'trade-routes-established',
        targetCount: 4,
        routeRequirement: 'coastal',
        description: 'Establish 4 coastal or overseas trade routes.',
      },
    ],
    reward: {
      summary: '+6 gold empire-wide each turn. The canal that connected two seas.',
      civYieldBonus: { gold: 6 },
    },
  },
  'continental-congress': {
    id: 'continental-congress',
    name: 'Continental Congress',
    era: 7,
    productionCost: 280,
    requiredTechs: ['nationalism', 'popular-press'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'civic-research',
        type: 'research_count',
        track: 'civics',
        targetCount: 4,
        description: 'Complete 4 civics technologies.',
      },
      {
        id: 'large-empire',
        type: 'buildings-in-multiple-cities',
        targetCount: 4,
        cityScope: 'empire',
        minimumBuildingsPerCity: 4,
        description: 'Develop 4 cities to at least 4 buildings each.',
      },
    ],
    reward: {
      summary: '+4 science and +2 gold empire-wide each turn. A unified voice of enlightened governance.',
      civYieldBonus: { science: 4, gold: 2 },
    },
  },
  'eiffel-tower': {
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    era: 8,
    productionCost: 295,
    requiredTechs: ['structural-engineering', 'engineering-exhibition'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'engineering-research',
        type: 'research_count',
        track: 'metallurgy',
        targetCount: 4,
        description: 'Complete 4 metallurgy technologies.',
      },
      {
        id: 'modern-city',
        type: 'buildings-in-multiple-cities',
        targetCount: 2,
        cityScope: 'empire',
        minimumBuildingsPerCity: 8,
        description: 'Develop 2 cities to at least 8 buildings each.',
      },
    ],
    reward: {
      summary: '+5 gold and +1 production empire-wide each turn. A monument to industrial ambition.',
      civYieldBonus: { gold: 5, production: 1 },
    },
  },
  'brooklyn-bridge': {
    id: 'brooklyn-bridge',
    name: 'Brooklyn Bridge',
    era: 8,
    productionCost: 290,
    requiredTechs: ['reinforced-concrete', 'bessemer-steel'],
    requiredResources: ['iron'],
    cityRequirement: 'river',
    questSteps: [
      {
        id: 'construction-research',
        type: 'research_count',
        track: 'construction',
        targetCount: 4,
        description: 'Complete 4 construction technologies.',
      },
      {
        id: 'trade-network',
        type: 'trade-routes-established',
        targetCount: 3,
        description: 'Establish 3 active trade routes.',
      },
    ],
    reward: {
      summary: '+4 production and +2 food empire-wide each turn. The bridge that united a city and inspired a nation.',
      civYieldBonus: { production: 4, food: 2 },
    },
  },
  'trans-siberian-railway': {
    id: 'trans-siberian-railway',
    name: 'Trans-Siberian Railway',
    era: 8,
    productionCost: 300,
    requiredTechs: ['transcontinental-rail', 'general-mobilization'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'exploration-research',
        type: 'research_count',
        track: 'exploration',
        targetCount: 4,
        description: 'Complete 4 exploration technologies.',
      },
      {
        id: 'sprawling-empire',
        type: 'buildings-in-multiple-cities',
        targetCount: 5,
        cityScope: 'empire',
        minimumBuildingsPerCity: 4,
        description: 'Develop 5 cities to at least 4 buildings each.',
      },
    ],
    reward: {
      summary: '+6 production empire-wide each turn. The iron spine of a continental empire.',
      civYieldBonus: { production: 6 },
    },
  },

  'panama-canal': {
    id: 'panama-canal',
    name: 'Panama Canal',
    era: 9,
    productionCost: 310,
    requiredTechs: ['transcontinental-rail', 'hydroelectric-power'],
    requiredResources: ['iron'],
    cityRequirement: 'coastal',
    questSteps: [
      {
        id: 'maritime-mastery',
        type: 'trade-routes-established',
        targetCount: 3,
        description: 'Establish 3 active trade routes.',
      },
      {
        id: 'naval-tradition',
        type: 'research_count',
        track: 'maritime',
        targetCount: 3,
        description: 'Complete 3 maritime technologies.',
      },
    ],
    reward: {
      summary: '+6 gold empire-wide each turn. The canal halves the world.',
      civYieldBonus: { gold: 6 },
    },
  },

  'empire-state-building': {
    id: 'empire-state-building',
    name: 'Empire State Building',
    era: 9,
    productionCost: 315,
    requiredTechs: ['steel-skyscrapers', 'mass-production'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'urban-density',
        type: 'buildings-in-multiple-cities',
        targetCount: 4,
        cityScope: 'empire',
        minimumBuildingsPerCity: 6,
        description: 'Develop 4 cities to at least 6 buildings each.',
      },
      {
        id: 'industrial-era-science',
        type: 'research_count',
        track: 'science',
        targetCount: 3,
        description: 'Complete 3 era-9 science technologies.',
      },
    ],
    reward: {
      summary: '+4 production, +3 gold empire-wide. The city that never sleeps.',
      civYieldBonus: { production: 4, gold: 3 },
    },
  },

  'hoover-dam': {
    id: 'hoover-dam',
    name: 'Hoover Dam',
    era: 9,
    productionCost: 320,
    requiredTechs: ['hydroelectric-power', 'quantum-theory'],
    requiredResources: ['stone'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'infrastructure-push',
        type: 'buildings-in-multiple-cities',
        targetCount: 5,
        cityScope: 'empire',
        minimumBuildingsPerCity: 5,
        description: 'Develop 5 cities to at least 5 buildings each.',
      },
      {
        id: 'engineering-mastery',
        type: 'research_count',
        track: 'construction',
        targetCount: 3,
        description: 'Complete 3 construction technologies.',
      },
    ],
    reward: {
      summary: '+4 food, +3 production empire-wide. Power tamed from a river.',
      civYieldBonus: { food: 4, production: 3 },
    },
  },
  'united-nations': {
    id: 'united-nations',
    name: 'United Nations',
    era: 10,
    productionCost: 350,
    requiredTechs: ['international-institutions'],
    requiredResources: [],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'civics-techs',
        type: 'research_count',
        track: 'civics',
        targetCount: 2,
        description: 'Complete 2 era-10 civics technologies.',
      },
      {
        id: 'diplomatic-cities',
        type: 'buildings-in-multiple-cities',
        targetCount: 3,
        cityScope: 'empire',
        minimumBuildingsPerCity: 4,
        description: 'Develop 3 cities into diplomatic centres.',
      },
    ],
    reward: {
      summary: '+5 gold and +1 science empire-wide each turn. First permanent intergovernmental peacekeeping body.',
      // civYieldBonus: gold 5 ≤ 6, science 1 ≤ 6; two keys ✓
      civYieldBonus: { gold: 5, science: 1 },
    },
  },
  'wright-flyer': {
    id: 'wright-flyer',
    name: 'Wright Flyer',
    era: 9,
    productionCost: 330,
    requiredTechs: ['aviation', 'aluminium-smelting'],
    requiredResources: ['iron'],
    cityRequirement: 'any',
    questSteps: [
      {
        id: 'aviation-infrastructure',
        type: 'buildings-in-multiple-cities',
        targetCount: 2,
        cityScope: 'empire',
        minimumBuildingsPerCity: 5,
        description: 'Develop 2 cities with aviation infrastructure.',
      },
      {
        id: 'science-breakthrough',
        type: 'research_count',
        track: 'science',
        targetCount: 3,
        description: 'Complete 3 science technologies.',
      },
    ],
    reward: {
      summary: '+4 science, +2 production empire-wide. The age of flight begins here.',
      // civYieldBonus: each key ≤ 6; science 4 ≤ 6, production 2 ≤ 6; total 2 keys ✓
      civYieldBonus: { science: 4, production: 2 },
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

export function getLateEraWonderTechRequirements(): LateEraWonderTechRequirement[] {
  return LATE_ERA_WONDER_IDS.map(wonderId => {
    const definition = getLegendaryWonderDefinition(wonderId);
    if (!definition) {
      throw new Error(`Missing late-era wonder definition for ${wonderId}`);
    }

    return {
      wonderId,
      requiredTechs: [...definition.requiredTechs],
    };
  });
}
