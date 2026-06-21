import type { Tech } from '@/core/types';

// Relocated stubs — same values as original to preserve existing tests.
// Era fields and prerequisites will be updated when real late-era content lands.
const RELOCATED_STUBS: Tech[] = [
  { id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: ['trade-routes', 'banking'], unlocks: ['Late-era supply chains and wonder distribution requirements'], unlocksBuildings: ['stock_exchange'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'nuclear-theory', name: 'Nuclear Theory', track: 'science', cost: 165, prerequisites: ['astronomy', 'medicine'], unlocks: ['Late-era atomic research and wonder prerequisites'], era: 5, countsForEraAdvancement: false },
  { id: 'mass-media', name: 'Mass Media', track: 'communication', cost: 150, prerequisites: ['printing', 'diplomats'], unlocks: ['Global broadcasts and late-era cultural coordination'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 175, prerequisites: ['cryptography', 'counter-intelligence'], unlocks: ['Satellite Surveillance', 'Misinformation Campaign'], era: 5 },
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], unlocksUnits: ['spy_hacker'], era: 5 },
  { id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: ['caravels', 'naval-warfare'], unlocks: [], unlocksUnits: ['troop_transport'], era: 5, countsForEraAdvancement: false },
];

// Era 5 techs — filled in by Task 10
const ERA_5_TECHS: Tech[] = [];

export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
];
