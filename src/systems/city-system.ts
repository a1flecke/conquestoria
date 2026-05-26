import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry, IdCounters, ResourceType } from '@/core/types';
import { isSpyUnitType } from './espionage-system';
import { hexKey, hexesInRange, wrapHexCoord } from './hex-utils';
import { drawNextCityName, DEFAULT_CITY_NAMES } from './city-name-system';
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from './city-maturity-system';
import { findOptimalSlot, isSlotUnlocked } from './adjacency-system';
import {
  getLegendaryWonderDisplayName,
  getLegendaryWonderProductionCost,
  getLegendaryWonderQueueItemMetadata,
} from './legendary-wonder-production';

export const CITY_NAMES = DEFAULT_CITY_NAMES;

export interface FoundCityOptions {
  civType?: string;
  namingPool?: string[];
  usedNames?: Set<string>;
  civName?: string;
}

export const BUILDINGS: Record<string, Building> = {
  // Food
  granary: { id: 'granary', name: 'Granary', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 40, description: 'Stores food for growth', techRequired: 'granary-design', adjacencyBonuses: [] },
  herbalist: {
    id: 'herbalist',
    name: 'Herbalist',
    category: 'food',
    yields: { food: 1, production: 0, gold: 0, science: 0 },
    productionCost: 16,
    description: 'Herbal medicine boosts health',
    techRequired: null,
    adjacencyBonuses: [],
    pacing: {
      band: 'starter',
      role: 'early-growth',
      impact: 1,
      scope: 'city',
      snowball: 1.05,
      urgency: 1.1,
      situationality: 1,
      unlockBreadth: 1,
    },
  },
  aqueduct: { id: 'aqueduct', name: 'Aqueduct', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 80, description: 'Brings fresh water for growth', techRequired: 'engineering', adjacencyBonuses: [] },

  // Production
  workshop: { id: 'workshop', name: 'Workshop', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 12, description: 'Tools boost production', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'early-production', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  forge: { id: 'forge', name: 'Forge', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 70, description: 'Metalworking facility', techRequired: 'engineering', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'production-scaling', impact: 1.2, scope: 'city', snowball: 1.25, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  lumbermill: { id: 'lumbermill', name: 'Lumbermill', category: 'production', yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 50, description: 'Processes timber efficiently', techRequired: 'state-workforce', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'production-economy', impact: 1.1, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  'quarry-building': { id: 'quarry-building', name: 'Quarry', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 55, description: 'Cuts stone for construction', techRequired: 'state-workforce', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'production-scaling', impact: 1.1, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1, unlockBreadth: 1 } },

  // Science
  library: { id: 'library', name: 'Library', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 16, description: 'Knowledge repository', techRequired: 'writing', adjacencyBonuses: [] },
  archive: { id: 'archive', name: 'Archive', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 60, description: 'Preserves ancient knowledge', techRequired: 'mathematics', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'science-scaling', impact: 1.15, scope: 'city', snowball: 1.2, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  observatory: { id: 'observatory', name: 'Observatory', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 100, description: 'Studies the stars', techRequired: 'astronomy', adjacencyBonuses: [] },

  // Economy
  marketplace: { id: 'marketplace', name: 'Marketplace', category: 'economy', yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 50, description: 'Center of trade — adds a trade route slot.', techRequired: 'currency', adjacencyBonuses: [], routeCapacity: 1 },
  harbor: { id: 'harbor', name: 'Harbor', category: 'economy', yields: { food: 1, production: 0, gold: 3, science: 0 }, productionCost: 80, description: 'Enables sea trade', techRequired: 'harbor-tech', coastalRequired: true, adjacencyBonuses: [] },
  dock: { id: 'dock', name: 'Dock', category: 'economy', yields: { food: 2, production: 0, gold: 1, science: 0 }, productionCost: 20, description: 'Harbor for fishing boats. Boosts coastal city food and trade.', techRequired: 'fishing', coastalRequired: true, adjacencyBonuses: [], pacing: { band: 'core', role: 'coastal-food', impact: 1, scope: 'city', snowball: 1.05, urgency: 1, situationality: 1.2, unlockBreadth: 1 } },

  // Military
  barracks: { id: 'barracks', name: 'Barracks', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10, description: 'A training ground. Required by future military doctrines.', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'military-enabler', impact: 1, scope: 'city', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1.05 } },
  walls: { id: 'walls', name: 'Walls', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 60, description: 'Defends the city', techRequired: 'fortification', adjacencyBonuses: [] },
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains mounted units', techRequired: 'horseback-riding', adjacencyBonuses: [] },

  // Culture
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center', techRequired: 'philosophy', adjacencyBonuses: [] },
  monument: { id: 'monument', name: 'Monument', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 30, description: 'Commemorates your civilization', techRequired: 'code-of-laws', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'early-culture', impact: 1.05, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture', techRequired: 'drama-poetry', adjacencyBonuses: [] },
  shrine: { id: 'shrine', name: 'Shrine', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 8, description: 'Place of worship', techRequired: null, adjacencyBonuses: [], pacing: { band: 'starter', role: 'early-science', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  forum: { id: 'forum', name: 'Forum', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 70, description: 'Public gathering place', techRequired: 'civil-service', adjacencyBonuses: [], pacing: { band: 'infrastructure', role: 'civic-economy', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },

  // Espionage
  safehouse: {
    id: 'safehouse', name: 'Safehouse', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 36,
    description: 'Reduces spy unit training cost by 25%.',
    techRequired: 'espionage-scouting', adjacencyBonuses: [],
    pacing: { band: 'power-spike', role: 'spy-cost-reduction', impact: 1.2, scope: 'city', snowball: 1.15, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  'intelligence-agency': {
    id: 'intelligence-agency', name: 'Intelligence Agency', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 60,
    description: "Raises this city's counter-intelligence score by 20 each turn (max 100). Bonus halves when digital-surveillance era is reached.",
    techRequired: 'espionage-informants', adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'counter-intelligence', impact: 1.15, scope: 'city', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  'security-bureau': {
    id: 'security-bureau', name: 'Security Bureau', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 100,
    description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves at cyber-warfare era.',
    techRequired: 'counter-intelligence', adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'advanced-counter-intelligence', impact: 1.2, scope: 'city', snowball: 1, urgency: 1, situationality: 1.1, unlockBreadth: 1 },
  },
  // S4b — Strategic resource buildings (copper)
  'bronze-workshop': {
    id: 'bronze-workshop', name: 'Bronze Workshop', category: 'production',
    yields: { food: 0, production: 1, gold: 0, science: 1 },
    productionCost: 30,
    description: 'Copper-tool crafting. +1 production, +1 science per turn.',
    techRequired: 'stone-weapons',
    resourceRequired: ['copper'],
    adjacencyBonuses: [],
    pacing: { band: 'power-spike', role: 'copper-production', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 },
  },
  armory: {
    id: 'armory', name: 'Armory', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 35,
    description: 'Weapons depot. Reduces melee and ranged unit training cost by 15% in this city.',
    techRequired: 'stone-weapons',
    resourceRequired: ['copper'],
    adjacencyBonuses: [],
    pacing: { band: 'power-spike', role: 'melee-cost-reduction', impact: 1.15, scope: 'city', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  // S4b — Strategic resource buildings (horses)
  ranch: {
    id: 'ranch', name: 'Ranch', category: 'food',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 35,
    description: 'Pasture and breeding grounds. +2 food per turn.',
    techRequired: 'animal-husbandry',
    resourceRequired: ['horses'],
    adjacencyBonuses: [],
    pacing: { band: 'power-spike', role: 'horse-food', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  'cavalry-academy': {
    id: 'cavalry-academy', name: 'Cavalry Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 55,
    description: 'Mounted warfare school. Reduces cavalry unit training cost by 15% in this city.',
    techRequired: 'horseback-riding',
    resourceRequired: ['horses'],
    adjacencyBonuses: [],
    pacing: { band: 'power-spike', role: 'cavalry-cost-reduction', impact: 1.15, scope: 'city', snowball: 1, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  // S4b — Strategic resource buildings (iron)
  'iron-foundry': {
    id: 'iron-foundry', name: 'Iron Foundry', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 },
    productionCost: 80,
    description: 'Advanced smelting facility. +3 production per turn. Pairs with Forge for +6 total.',
    techRequired: 'iron-forging',
    resourceRequired: ['iron'],
    adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'iron-production', impact: 1.25, scope: 'city', snowball: 1.3, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
  },
  'war-academy': {
    id: 'war-academy', name: 'War Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 70,
    description: 'Military institution. Reduces melee and ranged unit training cost by 15% in this city.',
    techRequired: 'iron-forging',
    resourceRequired: ['iron'],
    adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'military-cost-reduction', impact: 1.2, scope: 'city', snowball: 1, urgency: 1, situationality: 1.1, unlockBreadth: 1 },
  },
  // S4b — Strategic resource buildings (stone)
  'masonry-works': {
    id: 'masonry-works', name: 'Masonry Works', category: 'production',
    yields: { food: 0, production: 2, gold: 0, science: 0 },
    productionCost: 50,
    description: 'Quarried stone speeds construction. +2 production per turn. Walls cost 20% less.',
    techRequired: 'state-workforce',
    resourceRequired: ['stone'],
    adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'stone-production', impact: 1.15, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  'siege-workshop': {
    id: 'siege-workshop', name: 'Siege Workshop', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 90,
    description: 'Siege engine fabrication. Reduces Catapult and Ballista training cost by 20% in this city.',
    techRequired: 'siege-warfare',
    resourceRequired: ['stone'],
    adjacencyBonuses: [],
    pacing: { band: 'infrastructure', role: 'siege-cost-reduction', impact: 1.2, scope: 'city', snowball: 1, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
  },
  // S5 — Trade infrastructure buildings
  caravanserai: {
    id: 'caravanserai', name: 'Caravanserai', category: 'economy',
    yields: { food: 1, production: 0, gold: 1, science: 0 },
    productionCost: 40,
    description: 'A roadside inn for merchants — adds a trade route slot and resupplies traveling caravans (+2 bonus trips).',
    techRequired: 'wheel',
    adjacencyBonuses: [],
    routeCapacity: 1,
  },
  bank: {
    id: 'bank', name: 'Bank', category: 'economy',
    yields: { food: 0, production: 0, gold: 4, science: 0 },
    productionCost: 90,
    description: 'Letters of credit enable long-distance commerce without moving gold — adds a trade route slot.',
    techRequired: 'banking',
    adjacencyBonuses: [],
    routeCapacity: 1,
  },
  stock_exchange: {
    id: 'stock_exchange', name: 'Stock Exchange', category: 'economy',
    yields: { food: 0, production: 0, gold: 6, science: 1 },
    productionCost: 120,
    description: 'Joint-stock companies finance global trade empires — adds a trade route slot and generates financial innovation.',
    techRequired: 'global-logistics',
    adjacencyBonuses: [],
    routeCapacity: 1,
  },
};

export const TRAINABLE_UNITS: Array<TrainableUnitEntry & { pacing?: Building['pacing'] }> = [
  { type: 'warrior', name: 'Warrior', cost: 8, pacing: { band: 'starter', role: 'early-military', impact: 1, scope: 'military', snowball: 1, urgency: 1.2, situationality: 1, unlockBreadth: 1 } },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery', pacing: { band: 'power-spike', role: 'ranged-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  { type: 'scout', name: 'Scout', cost: 6, pacing: { band: 'starter', role: 'early-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { type: 'worker', name: 'Worker', cost: 12 },
  { type: 'settler', name: 'Settler', cost: 24, pacing: { band: 'power-spike', role: 'expansion', impact: 1.25, scope: 'empire', snowball: 1.3, urgency: 1.05, situationality: 1, unlockBreadth: 1.2 } },
  { type: 'swordsman',    name: 'Swordsman',    cost: 50,  techRequired: 'bronze-working',   resourceRequired: ['iron'],           pacing: { band: 'power-spike', role: 'melee-breakpoint',       impact: 1.2,  scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'pikeman',      name: 'Pikeman',      cost: 70,  techRequired: 'fortification',                                          pacing: { band: 'power-spike', role: 'anti-cavalry-breakpoint', impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'musketeer',    name: 'Musketeer',    cost: 90,  techRequired: 'tactics' },
  { type: 'galley',       name: 'Galley',       cost: 40,  techRequired: 'galleys' },
  { type: 'trireme',      name: 'Trireme',      cost: 70,  techRequired: 'triremes',                                              pacing: { band: 'power-spike', role: 'naval-breakpoint',       impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  // S4b — melee
  { type: 'axeman',       name: 'Axeman',       cost: 22,  techRequired: 'stone-weapons',    resourceRequired: ['copper'],         obsoletedByTech: 'fortification', pacing: { band: 'power-spike', role: 'early-copper-melee',    impact: 1.1,  scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'spearman',     name: 'Spearman',     cost: 32,  techRequired: 'bronze-working',                                        obsoletedByTech: 'fortification', pacing: { band: 'power-spike', role: 'ungated-era2-melee',    impact: 1.05, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'horseman',     name: 'Horseman',     cost: 55,  techRequired: 'horseback-riding', resourceRequired: ['horses'],                                           pacing: { band: 'power-spike', role: 'basic-cavalry',         impact: 1.15, scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'cavalry',      name: 'Cavalry',      cost: 60,  techRequired: 'horseback-riding', resourceRequired: ['horses', 'iron'],                                   pacing: { band: 'power-spike', role: 'heavy-cavalry',         impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'knight',       name: 'Knight',       cost: 80,  techRequired: 'iron-forging',     resourceRequired: ['horses', 'iron'],                                   pacing: { band: 'power-spike', role: 'heavy-cavalry-apex',    impact: 1.25, scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  // S4b — ranged + siege
  { type: 'crossbowman',  name: 'Crossbowman',  cost: 75,  techRequired: 'tactics',          resourceRequired: ['copper'],                                           pacing: { band: 'power-spike', role: 'precision-ranged',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'catapult',     name: 'Catapult',     cost: 110, techRequired: 'siege-warfare',    resourceRequired: ['stone'],                                            pacing: { band: 'power-spike', role: 'siege-bombardment',    impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'ballista',     name: 'Ballista',     cost: 100, techRequired: 'siege-warfare',    resourceRequired: ['iron'],                                             pacing: { band: 'power-spike', role: 'anti-unit-siege',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.15, unlockBreadth: 1 } },
  { type: 'spy_scout', name: 'Scout Agent', cost: 30, techRequired: 'espionage-scouting', obsoletedByTech: 'espionage-informants', pacing: { band: 'power-spike', role: 'first-spy-unit', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_informant', name: 'Informant', cost: 50, techRequired: 'espionage-informants', obsoletedByTech: 'spy-networks', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_agent', name: 'Field Agent', cost: 70, techRequired: 'spy-networks', obsoletedByTech: 'cryptography', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.2, scope: 'military', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'cyber-warfare' },
  { type: 'spy_hacker', name: 'Cyber Operative', cost: 110, techRequired: 'cyber-warfare' },
  { type: 'scout_hound', name: 'Scout Hound', cost: 36, techRequired: 'lookouts', pacing: { band: 'power-spike', role: 'spy-detection', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'shadow_warden', name: 'Shadow Warden', cost: 36, techRequired: 'lookouts', civTypeRequired: 'persia', replacesUnit: 'scout_hound', pacing: { band: 'power-spike', role: 'unique-spy-detection', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'war_hound', name: 'War Hound', cost: 32, techRequired: 'lookouts', civTypeRequired: 'rome', replacesUnit: 'scout_hound', pacing: { band: 'power-spike', role: 'unique-spy-detection-combat', impact: 1.1, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 } },
  // S5 — trade unit
  { type: 'caravan', name: 'Caravan', cost: 60, techRequired: 'trade-routes' },
];

export const SETTLER_COST_BY_ERA: Record<number, number> = {
  1: 24,
  2: 32,
  3: 40,
  4: 48,
  5: 56,
};

function clampProductionEra(era: number | undefined): number {
  const numericEra = typeof era === 'number' && Number.isFinite(era) ? era : 1;
  const normalized = Math.max(1, Math.floor(numericEra));
  return Math.min(5, normalized);
}

export function getSettlerProductionCost(era: number = 1): number {
  return SETTLER_COST_BY_ERA[clampProductionEra(era)];
}

export function getCatalogProductionCost(itemId: string, era: number = 1): number {
  const legendaryCost = getLegendaryWonderProductionCost(itemId);
  if (legendaryCost !== null) return legendaryCost;

  const building = BUILDINGS[itemId];
  if (building) return building.productionCost;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  if (!unit) return 0;
  if (unit.type === 'settler') return getSettlerProductionCost(era);
  return unit.cost;
}

const MELEE_RANGED_UNIT_TYPES: string[] = [
  'warrior', 'axeman', 'spearman', 'swordsman', 'pikeman', 'musketeer', 'archer', 'crossbowman',
];
const CAVALRY_UNIT_TYPES: string[] = ['horseman', 'cavalry', 'knight'];
const SIEGE_UNIT_TYPES: string[] = ['catapult', 'ballista'];

function getBuildingDiscountMultiplier(itemId: string, cityBuildings: string[]): number {
  let best = 1;
  if (MELEE_RANGED_UNIT_TYPES.includes(itemId)) {
    if (cityBuildings.includes('armory'))      best = Math.min(best, 0.85);
    if (cityBuildings.includes('war-academy')) best = Math.min(best, 0.85);
  }
  if (CAVALRY_UNIT_TYPES.includes(itemId)) {
    if (cityBuildings.includes('cavalry-academy')) best = Math.min(best, 0.85);
  }
  if (SIEGE_UNIT_TYPES.includes(itemId)) {
    if (cityBuildings.includes('siege-workshop')) best = Math.min(best, 0.80);
  }
  // Masonry Works: Walls building 20% cheaper
  if (itemId === 'walls') {
    if (cityBuildings.includes('masonry-works')) best = Math.min(best, 0.80);
  }
  return best;
}

export function getProductionCostForItem(
  itemId: string,
  options: {
    city?: Pick<City, 'buildings'>;
    bonusEffect?: CivBonusEffect;
    era?: number;
  } = {},
): number {
  const baseCost = getCatalogProductionCost(itemId, options.era);
  if (baseCost <= 0) return 0;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  const civMultiplier = applyProductionBonus(itemId, options.bonusEffect);

  const discounts: number[] = [];
  if (unit && options.city?.buildings.includes('safehouse') && isSpyUnitType(unit.type)) {
    discounts.push(0.75);
  }
  if (options.city) {
    const d = getBuildingDiscountMultiplier(itemId, options.city.buildings);
    if (d < 1) discounts.push(d);
  }
  const discountMultiplier = discounts.length > 0 ? Math.min(...discounts) : 1;
  const effective = baseCost * civMultiplier * discountMultiplier;
  return discountMultiplier < 1 ? Math.ceil(effective) : Math.round(effective);
}

export const PRODUCTION_ICONS: Record<string, string> = {
  // Buildings
  granary: '🌾',
  herbalist: '🌿',
  aqueduct: '💧',
  workshop: '🔨',
  forge: '🔥',
  lumbermill: '🪵',
  'quarry-building': '⛏️',
  library: '📚',
  archive: '📜',
  observatory: '🔭',
  marketplace: '🏪',
  harbor: '⚓',
  dock: '🚢',
  barracks: '🪖',
  walls: '🧱',
  stable: '🐴',
  temple: '🛕',
  monument: '🗿',
  amphitheater: '🎭',
  shrine: '⛩️',
  forum: '📢',
  safehouse: '🏠',
  'intelligence-agency': '🛡️',
  'security-bureau': '🔒',
  // Units
  warrior: '⚔️',
  archer: '🏹',
  scout: '🔍',
  worker: '🪚',
  settler: '🏕️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  galley: '⛵',
  trireme: '🚢',
  spy_scout: '👁️',
  spy_informant: '📡',
  spy_agent: '🕵️',
  spy_operative: '🎯',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '👤',
  war_hound: '🐺',
  // S4b — new unit icons
  axeman:      '🪓',
  spearman:    '🗼',
  horseman:    '🏇',
  cavalry:     '⚡',
  knight:      '♞',
  crossbowman: '🪃',
  catapult:    '🪨',
  ballista:    '🔩',
  // S4b — new building icons
  'bronze-workshop': '🔧',
  armory:            '⚔️',
  ranch:             '🐄',
  'cavalry-academy': '🎠',
  'iron-foundry':    '🏭',
  'war-academy':     '🏋️',
  'masonry-works':   '⛏️',
  'siege-workshop':  '🪚',
  // S5 — trade unit + buildings
  caravan:         '🐪',
  caravanserai:    '🏕️',
  bank:            '🏦',
  stock_exchange:  '📈',
};

export const PRODUCTION_ICON_FALLBACK = '🏗️';

export function getProductionDisplayName(itemId: string): string {
  const legendaryName = getLegendaryWonderDisplayName(itemId);
  if (legendaryName) return legendaryName;

  const building = BUILDINGS[itemId];
  if (building) return building.name;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  return unit?.name ?? itemId;
}

export function getProductionIconForItem(itemId: string): string {
  return getLegendaryWonderQueueItemMetadata(itemId)?.icon
    ?? PRODUCTION_ICONS[itemId]
    ?? PRODUCTION_ICON_FALLBACK;
}

export function getTrainableUnitsForCiv(
  completedTechs: string[],
  civType?: string,
  availableResources?: Set<ResourceType>,
): TrainableUnitEntry[] {
  const replacedForCiv = new Set(
    TRAINABLE_UNITS
      .filter(u => u.civTypeRequired === civType && u.replacesUnit)
      .map(u => u.replacesUnit!),
  );
  return TRAINABLE_UNITS.filter(u => {
    if (u.techRequired && !completedTechs.includes(u.techRequired)) return false;
    if (u.obsoletedByTech && completedTechs.includes(u.obsoletedByTech)) return false;
    if (u.civTypeRequired && u.civTypeRequired !== civType) return false;
    if (replacedForCiv.has(u.type)) return false;
    if (availableResources !== undefined && u.resourceRequired?.length) {
      if (!u.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    return true;
  });
}

export function getDetectionUnitTypeForCiv(civType?: string): UnitType {
  return TRAINABLE_UNITS.find(u => u.civTypeRequired === civType && u.replacesUnit === 'scout_hound')?.type ?? 'scout_hound';
}

export function createEmptyCityGrid(): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => null),
  );
  grid[3][3] = 'city-center';
  return grid;
}

export function foundCity(owner: string, position: HexCoord, map: GameMap, counters: IdCounters, options: FoundCityOptions = {}): City {
  const canonicalPosition = map.wrapsHorizontally ? wrapHexCoord(position, map.width) : { ...position };
  const name = drawNextCityName(options.civType ?? owner, options.usedNames ?? new Set<string>(), {
    namingPool: options.namingPool,
    civName: options.civName,
  });

  // Claim nearby land tiles (radius 1)
  const ownedTileMap = new Map<string, HexCoord>();
  const nearby = hexesInRange(canonicalPosition, 1);
  for (const coord of nearby) {
    const canonical = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : { ...coord };
    const tile = map.tiles[hexKey(canonical)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain') {
      ownedTileMap.set(hexKey(canonical), canonical);
    }
  }
  const ownedTiles = Array.from(ownedTileMap.values());

  const grid = createEmptyCityGrid();

  return {
    id: `city-${counters.nextCityId++}`,
    name,
    owner,
    position: canonicalPosition,
    population: 1,
    food: 0,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles,
    workedTiles: [],
    focus: INITIAL_CITY_FOCUS,
    maturity: INITIAL_CITY_MATURITY,
    grid,
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
  };
}

export function isCityCoastal(city: City, mapTiles: GameMap['tiles']): boolean {
  return (city.ownedTiles ?? []).some(coord => {
    const tile = mapTiles[hexKey(coord)];
    return tile?.terrain === 'ocean' || tile?.terrain === 'coast';
  });
}

export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  mapTiles: GameMap['tiles'],
  availableResources?: Set<ResourceType>,
): Building[] {
  const coastal = isCityCoastal(city, mapTiles);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    if (b.coastalRequired && !coastal) return false;
    if (availableResources !== undefined && b.resourceRequired?.length) {
      if (!b.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    return true;
  });
}

export function checkGridExpansion(_city: City): boolean {
  return false;
}

export function purchaseGridExpansion(_city: City, _currentGold: number): number {
  return 0;
}

export function placeBuildingInGrid(city: City, buildingId: string): City {
  if (city.grid.flat().includes(buildingId)) return city;
  const slot = findOptimalSlot(city.grid, city.gridSize, buildingId);
  if (!slot) return city;

  const grid = city.grid.map(row => row.slice());
  if (grid[slot.row]?.[slot.col]) return city;
  grid[slot.row][slot.col] = buildingId;
  return { ...city, grid };
}

export function getUnplacedBuildings(city: City): string[] {
  const placed = new Set(city.grid.flat().filter((entry): entry is string => Boolean(entry)));
  const seen = new Set<string>();
  return city.buildings.filter(buildingId => {
    if (seen.has(buildingId)) return false;
    seen.add(buildingId);
    return !placed.has(buildingId);
  });
}

export function placeBuilding(city: City, buildingId: string, row: number, col: number): City {
  const renderSize = 7;
  if (!isSlotUnlocked(row, col, city.gridSize, renderSize)) return city;
  if (city.grid[row]?.[col] !== null) return city;
  if (!getUnplacedBuildings(city).includes(buildingId)) return city;

  const grid = city.grid.map(r => r.slice());
  grid[row][col] = buildingId;
  return { ...city, grid };
}

export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  idleGoldBonus: number;
  idleScienceBonus: number;
  /** The building id that was silently dequeued because the city is no longer coastal, or null. */
  droppedBuilding: string | null;
}

export interface CityProductionCompletionResult {
  city: City;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
}

export function completeCityProductionItem(city: City, itemId: string): CityProductionCompletionResult {
  const newQueue = [...city.productionQueue];
  const newBuildings = [...city.buildings];
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  if (newQueue[0] !== itemId) {
    return { city, completedBuilding, completedUnit };
  }
  newQueue.shift();

  const building = BUILDINGS[itemId];
  if (building) {
    if (!newBuildings.includes(building.id)) {
      newBuildings.push(building.id);
      completedBuilding = building.id;
    }
  } else {
    const unitDef = TRAINABLE_UNITS.find(u => u.type === itemId);
    if (unitDef) {
      completedUnit = unitDef.type;
    }
  }

  let nextCity: City = {
    ...city,
    productionQueue: newQueue,
    productionProgress: 0,
    buildings: newBuildings,
  };

  if (completedBuilding) {
    nextCity = placeBuildingInGrid(nextCity, completedBuilding);
  }

  return {
    city: nextCity,
    completedBuilding,
    completedUnit,
  };
}

export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
  civType?: string,
  era: number = 1,
  availableResources?: Set<ResourceType>,
): CityProcessResult {
  let grew = false;
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  // Food and growth
  const foodSurplus = foodYield - city.population; // each pop eats 1 food
  let newFood = city.food + Math.max(0, foodSurplus);
  let newPop = city.population;
  let newFoodNeeded = city.foodNeeded;

  if (newFood >= city.foodNeeded) {
    newPop++;
    newFood -= city.foodNeeded;
    newFoodNeeded = Math.floor(city.foodNeeded * 1.3);
    grew = true;
  }

  // Production
  let newProgress = city.productionProgress;
  const newQueue = [...city.productionQueue];
  const newBuildings = [...city.buildings];
  let newGrid = city.grid;

  // Drop queued items that are no longer available (tech lost, resource lost)
  if ((completedTechs.length > 0 || availableResources) && newQueue.length > 0) {
    const trainable = getTrainableUnitsForCiv(completedTechs, civType, availableResources);
    const trainableTypes = new Set(trainable.map(u => u.type));
    const BUILDING_IDS = new Set(Object.keys(BUILDINGS));
    const filtered = newQueue.filter(item => {
      if (item.startsWith('legendary:')) return true;
      if (BUILDING_IDS.has(item)) {
        const building = BUILDINGS[item];
        if (building?.resourceRequired?.length && availableResources !== undefined) {
          if (!building.resourceRequired.every(r => availableResources!.has(r))) return false;
        }
        return true;
      }
      return trainableTypes.has(item as UnitType);
    });
    if (filtered.length !== newQueue.length) {
      newQueue.length = 0;
      newQueue.push(...filtered);
      if (filtered.length === 0) newProgress = 0;
    }
  }

  // Coastal guard: drop the queue head BEFORE accumulating production so no yield is wasted.
  // A building with coastalRequired cannot be built in an inland city; if this city
  // lost coastal access (e.g. map-script edge case), remove the item silently.
  let droppedBuilding: string | null = null;
  if (newQueue.length > 0) {
    const headBuilding = BUILDINGS[newQueue[0]];
    if (headBuilding?.coastalRequired && !isCityCoastal(city, map.tiles)) {
      droppedBuilding = newQueue.shift()!;
      newProgress = 0;
    }
  }

  if (newQueue.length > 0) {
    newProgress += productionYield;
    const currentItem = newQueue[0];

    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    if ((BUILDINGS[currentItem] || unitDef) && newProgress >= getProductionCostForItem(currentItem, { city, bonusEffect, era })) {
      const completion = completeCityProductionItem(
        { ...city, productionQueue: newQueue, productionProgress: newProgress, buildings: newBuildings },
        currentItem,
      );
      newQueue.length = 0;
      newQueue.push(...completion.city.productionQueue);
      newBuildings.length = 0;
      newBuildings.push(...completion.city.buildings);
      newProgress = completion.city.productionProgress;
      newGrid = completion.city.grid;
      completedBuilding = completion.completedBuilding;
      completedUnit = completion.completedUnit;
    }
  }

  let idleGoldBonus = 0;
  let idleScienceBonus = 0;
  if (city.productionQueue.length === 0 && city.idleProduction) {
    if (city.idleProduction === 'gold') {
      idleGoldBonus = productionYield;
    } else if (city.idleProduction === 'science') {
      idleScienceBonus = productionYield;
    }
  }

  let nextCity: City = {
    ...city,
    food: newFood,
    foodNeeded: newFoodNeeded,
    population: newPop,
    productionProgress: newProgress,
    productionQueue: newQueue,
    buildings: newBuildings,
    grid: newGrid,
  };

  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
    droppedBuilding,
  };
}

const WONDER_BUILDINGS = ['monument', 'amphitheater'];

export function applyProductionBonus(
  itemId: string,
  bonusEffect: CivBonusEffect | undefined,
): number {
  if (!bonusEffect) return 1;

  if (bonusEffect.type === 'faster_wonders' && WONDER_BUILDINGS.includes(itemId)) {
    return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'faster_military') {
    const isMilitary = ['warrior', 'scout'].includes(itemId) ||
      ['barracks', 'walls', 'stable'].includes(itemId);
    if (isMilitary) return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'coastal_science') {
    const isNaval = ['galley', 'trireme'].includes(itemId);
    if (isNaval) return 1 - bonusEffect.navalProductionBonus;
  }

  // Shire: military units cost 25% more
  if (bonusEffect.type === 'peaceful_growth') {
    const militaryTypes = ['warrior', 'swordsman', 'pikeman', 'musketeer', 'scout', 'archer'];
    if (militaryTypes.includes(itemId)) {
      return 1 + bonusEffect.militaryPenalty; // e.g. 1.25
    }
  }

  return 1;
}

export function razeForestForProduction(
  city: City,
  map: GameMap,
  tileCoord: HexCoord,
): { city: City; map: GameMap } | null {
  const key = `${tileCoord.q},${tileCoord.r}`;
  const tile = map.tiles[key];
  if (!tile || tile.terrain !== 'forest') return null;

  const isOwned = city.ownedTiles.some(t => t.q === tileCoord.q && t.r === tileCoord.r);
  if (!isOwned) return null;

  const newTile = { ...tile, terrain: 'plains' as const, improvement: 'none' as const, improvementTurnsLeft: 0 };
  const newMap = { ...map, tiles: { ...map.tiles, [key]: newTile } };
  const newCity = { ...city, productionProgress: city.productionProgress + 30 };
  return { city: newCity, map: newMap };
}
