import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry, IdCounters, ResourceType } from '@/core/types';
import { isSpyUnitType } from './espionage-system';
import { hexKey, hexesInRange, hexNeighbors, wrapHexCoord } from './hex-utils';
import { drawNextCityName, DEFAULT_CITY_NAMES } from './city-name-system';
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from './city-maturity-system';
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
  granary: { id: 'granary', name: 'Granary', category: 'food', yields: { food: 3, production: 0, gold: 0, science: 0 }, productionCost: 40, description: 'Stores food for growth', techRequired: 'granary-design' },
  herbalist: {
    id: 'herbalist',
    name: 'Herbalist',
    category: 'food',
    yields: { food: 1, production: 0, gold: 0, science: 0 },
    productionCost: 16,
    description: 'Herbal medicine boosts health',
    techRequired: null,
   
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
  aqueduct: { id: 'aqueduct', name: 'Aqueduct', category: 'food', yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 80, description: 'Brings fresh water for growth', techRequired: 'engineering' },

  // Production
  workshop: { id: 'workshop', name: 'Workshop', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 12, description: 'Tools boost production', techRequired: null, pacing: { band: 'starter', role: 'early-production', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  forge: { id: 'forge', name: 'Forge', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 70, description: 'Metalworking facility', techRequired: 'engineering', pacing: { band: 'infrastructure', role: 'production-scaling', impact: 1.2, scope: 'city', snowball: 1.25, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  lumbermill: { id: 'lumbermill', name: 'Lumbermill', category: 'production', yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 50, description: 'Processes timber efficiently', techRequired: 'state-workforce', pacing: { band: 'infrastructure', role: 'production-economy', impact: 1.1, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  'quarry-building': { id: 'quarry-building', name: 'Quarry', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 55, description: 'Cuts stone for construction', techRequired: 'state-workforce', pacing: { band: 'infrastructure', role: 'production-scaling', impact: 1.1, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1, unlockBreadth: 1 } },

  // Science
  library: { id: 'library', name: 'Library', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 16, description: 'Knowledge repository', techRequired: 'writing' },
  archive: { id: 'archive', name: 'Archive', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 60, description: 'Preserves ancient knowledge', techRequired: 'mathematics', pacing: { band: 'infrastructure', role: 'science-scaling', impact: 1.15, scope: 'city', snowball: 1.2, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  observatory: { id: 'observatory', name: 'Observatory', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 100, description: 'Studies the stars', techRequired: 'astronomy' },

  // Economy
  marketplace: { id: 'marketplace', name: 'Marketplace', category: 'economy', yields: { food: 0, production: 0, gold: 4, science: 0 }, productionCost: 50, description: 'Center of trade — adds a trade route slot.', techRequired: 'currency', routeCapacity: 1 },
  harbor: { id: 'harbor', name: 'Harbor', category: 'economy', yields: { food: 1, production: 0, gold: 3, science: 0 }, productionCost: 80, description: 'Enables sea trade', techRequired: 'harbor-tech', coastalRequired: true },
  dock: { id: 'dock', name: 'Dock', category: 'economy', yields: { food: 2, production: 0, gold: 1, science: 0 }, productionCost: 20, description: 'Harbor for fishing boats. Boosts coastal city food and trade.', techRequired: 'fishing', coastalRequired: true, pacing: { band: 'core', role: 'coastal-food', impact: 1, scope: 'city', snowball: 1.05, urgency: 1, situationality: 1.2, unlockBreadth: 1 } },

  // Military
  barracks: { id: 'barracks', name: 'Barracks', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10, description: 'A training ground. Required by future military doctrines.', techRequired: null, pacing: { band: 'starter', role: 'military-enabler', impact: 1, scope: 'city', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1.05 } },
  walls: { id: 'walls', name: 'Walls', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 60, description: 'Defends the city', techRequired: 'fortification' },
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains mounted units', techRequired: 'horseback-riding' },

  // Culture
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center', techRequired: 'philosophy' },
  monument: { id: 'monument', name: 'Monument', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 30, description: 'Commemorates your civilization', techRequired: 'code-of-laws', pacing: { band: 'infrastructure', role: 'early-culture', impact: 1.05, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture', techRequired: 'drama-poetry' },
  shrine: { id: 'shrine', name: 'Shrine', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 8, description: 'Place of worship', techRequired: null, pacing: { band: 'starter', role: 'early-science', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  forum: { id: 'forum', name: 'Forum', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 70, description: 'Public gathering place', techRequired: 'civil-service', pacing: { band: 'infrastructure', role: 'civic-economy', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },

  // Espionage
  safehouse: {
    id: 'safehouse', name: 'Safehouse', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 36,
    description: 'Reduces spy unit training cost by 25%.',
    techRequired: 'espionage-scouting',
    pacing: { band: 'power-spike', role: 'spy-cost-reduction', impact: 1.2, scope: 'city', snowball: 1.15, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  'intelligence-agency': {
    id: 'intelligence-agency', name: 'Intelligence Agency', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 60,
    description: "Raises this city's counter-intelligence score by 20 each turn (max 100). Bonus halves when digital-surveillance era is reached.",
    techRequired: 'espionage-informants',
    pacing: { band: 'infrastructure', role: 'counter-intelligence', impact: 1.15, scope: 'city', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  'security-bureau': {
    id: 'security-bureau', name: 'Security Bureau', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 100,
    description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves when Signals Intelligence is researched.',
    techRequired: 'counter-intelligence',
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
   
    pacing: { band: 'power-spike', role: 'copper-production', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 },
  },
  armory: {
    id: 'armory', name: 'Armory', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 35,
    description: 'Weapons depot. Reduces melee and ranged unit training cost by 15% in this city.',
    techRequired: 'stone-weapons',
    resourceRequired: ['copper'],
   
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
   
    pacing: { band: 'power-spike', role: 'horse-food', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  'cavalry-academy': {
    id: 'cavalry-academy', name: 'Cavalry Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 55,
    description: 'Mounted warfare school. Reduces cavalry unit training cost by 15% in this city.',
    techRequired: 'horseback-riding',
    resourceRequired: ['horses'],
   
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
   
    pacing: { band: 'infrastructure', role: 'iron-production', impact: 1.25, scope: 'city', snowball: 1.3, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
  },
  'war-academy': {
    id: 'war-academy', name: 'War Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 70,
    description: 'Military institution. Reduces melee and ranged unit training cost by 15% in this city.',
    techRequired: 'iron-forging',
    resourceRequired: ['iron'],
   
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
   
    pacing: { band: 'infrastructure', role: 'stone-production', impact: 1.15, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  'siege-workshop': {
    id: 'siege-workshop', name: 'Siege Workshop', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 90,
    description: 'Siege engine fabrication. Reduces Catapult and Ballista training cost by 20% in this city.',
    techRequired: 'siege-warfare',
    resourceRequired: ['stone'],
   
    pacing: { band: 'infrastructure', role: 'siege-cost-reduction', impact: 1.2, scope: 'city', snowball: 1, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
  },
  // S5 — Trade infrastructure buildings
  caravanserai: {
    id: 'caravanserai', name: 'Caravanserai', category: 'economy',
    yields: { food: 1, production: 0, gold: 1, science: 0 },
    productionCost: 40,
    description: 'A roadside inn for merchants — adds a trade route slot and resupplies traveling caravans (+2 bonus trips).',
    techRequired: 'wheel',
   
    routeCapacity: 1,
  },
  bank: {
    id: 'bank', name: 'Bank', category: 'economy',
    yields: { food: 0, production: 0, gold: 4, science: 0 },
    productionCost: 90,
    description: 'Letters of credit enable long-distance commerce without moving gold — adds a trade route slot.',
    techRequired: 'banking',
   
    routeCapacity: 1,
  },
  stock_exchange: {
    id: 'stock_exchange', name: 'Stock Exchange', category: 'economy',
    yields: { food: 0, production: 0, gold: 6, science: 1 },
    productionCost: 120,
    description: 'Joint-stock companies finance global trade empires — adds a trade route slot and generates financial innovation.',
    techRequired: 'joint-stock-companies',

    routeCapacity: 1,
  },

  // ===== NATIONAL PROJECTS =====

  // Era 1
  sacred_grove: {
    id: 'sacred_grove', name: 'Sacred Grove', category: 'culture',
    yields: { food: 1, production: 0, gold: 0, science: 0 }, productionCost: 40,
    description: 'Sacred nature sanctuary. +1 food empire-wide. Wounded units heal faster in friendly territory.',
    techRequired: 'animism',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 1 },
    civYieldBonus: { food: 1 },
  },
  tribal_muster_ground: {
    id: 'tribal_muster_ground', name: 'Tribal Muster Ground', category: 'military',
    yields: { food: 0, production: 1, gold: 0, science: 0 }, productionCost: 45,
    description: 'Central mustering ground. +1 production empire-wide. Early unit training costs reduced.',
    techRequired: 'stone-weapons',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 1 },
    civYieldBonus: { production: 1 },
  },
  communal_stores: {
    id: 'communal_stores', name: 'Communal Stores', category: 'food',
    yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 40,
    description: 'Empire-wide granary network. +2 food all cities.',
    techRequired: 'gathering',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 1 },
    civYieldBonus: { food: 2 },
  },

  // Era 2
  grand_bazaar: {
    id: 'grand_bazaar', name: 'Grand Bazaar', category: 'economy',
    yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 80,
    description: '+1 gold per city empire-wide (scales dynamically with empire size).',
    techRequired: 'animal-husbandry',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 2 },
    // No civYieldBonus — per-city computation in national-project-system.ts computePerCityGold()
  },
  foundry_guild: {
    id: 'foundry_guild', name: 'Foundry Guild', category: 'military',
    yields: { food: 0, production: 1, gold: 0, science: 0 }, productionCost: 85,
    description: 'Bronze-smithing consortium. +1 production empire-wide. Bronze-class units gain combat bonus.',
    techRequired: 'bronze-working',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 2 },
    civYieldBonus: { production: 1 },
  },
  scribes_hall: {
    id: 'scribes_hall', name: "Scribes' Hall", category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 80,
    description: 'Empire-wide scribal tradition. +2 science all cities.',
    techRequired: 'mathematics',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 2 },
    civYieldBonus: { science: 2 },
  },

  // Era 3
  philosophers_circle: {
    id: 'philosophers_circle', name: "Philosopher's Circle", category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 120,
    description: 'Great assembly of thinkers. +3 science all cities.',
    techRequired: 'philosophy',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 3 },
    civYieldBonus: { science: 3 },
  },
  road_corps: {
    id: 'road_corps', name: 'Road Corps', category: 'production',
    yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 125,
    description: 'Imperial road network. +1 gold all cities. Roads built faster.',
    techRequired: 'road-building',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 3 },
    civYieldBonus: { gold: 1 },
  },
  iron_legion: {
    id: 'iron_legion', name: 'Iron Legion', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 120,
    description: 'Elite standing army. +2 production empire-wide. Military units gain combat bonus.',
    techRequired: 'iron-forging',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 3 },
    civYieldBonus: { production: 2 },
  },

  // Era 4
  imperial_archive: {
    id: 'imperial_archive', name: 'Imperial Archive', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 160,
    description: 'Imperial knowledge repository. +3 science all cities.',
    techRequired: 'printing',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 4 },
    civYieldBonus: { science: 3 },
  },
  praetorian_legion: {
    id: 'praetorian_legion', name: 'Praetorian Legion', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 160,
    description: 'Elite guard corps. +2 production empire-wide. Units in fortified cities gain strength bonus.',
    techRequired: 'tactics',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 4 },
    civYieldBonus: { production: 2 },
  },
  royal_mint: {
    id: 'royal_mint', name: 'Royal Mint', category: 'economy',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 160,
    description: 'Crown coinage monopoly. +3 gold all cities.',
    techRequired: 'banking',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 4 },
    civYieldBonus: { gold: 3 },
  },

  // Era 5
  royal_academy: {
    id: 'royal_academy', name: 'Royal Academy', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 180,
    description: 'Crown-sponsored institution of learning. +4 science all cities.',
    techRequired: 'scientific-method',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 5 },
    civYieldBonus: { science: 4 },
  },
  artillery_corps_hq: {
    id: 'artillery_corps_hq', name: 'Artillery Corps HQ', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 175,
    description: 'Central cannon command. +2 production empire-wide. Cannon units train with bonus strength.',
    techRequired: 'black-powder',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 5 },
    civYieldBonus: { production: 2 },
  },
  explorers_guild: {
    id: 'explorers_guild', name: "Explorers' Guild", category: 'economy',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 175,
    description: 'National charter for discovery. +3 gold all cities. Scouts gain +1 vision range.',
    techRequired: 'circumnavigation',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 5 },
    civYieldBonus: { gold: 3 },
  },

  // Era 6
  military_academy: {
    id: 'military_academy', name: 'Military Academy', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 185,
    description: 'Central officer training command. +3 production empire-wide. Gunpowder units train faster.',
    techRequired: 'rifle-tactics',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 6 },
    civYieldBonus: { production: 3 },
  },
  grand_cipher_bureau: {
    id: 'grand_cipher_bureau', name: 'Grand Cipher Bureau', category: 'science',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 185,
    description: 'State cryptographic intelligence agency. +3 gold all cities. Spy mission success rates increase.',
    techRequired: 'counter-espionage',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 6 },
    civYieldBonus: { gold: 3 },
  },
  colonial_administration: {
    id: 'colonial_administration', name: 'Colonial Administration', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 185,
    description: '+2 gold per city beyond your 4th. Rewards colonial expansion.',
    techRequired: 'colonial-administration',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 6 },
    // No civYieldBonus — per-city computation beyond 4th city in national-project-system.ts
  },

  // ERA 5 REGULAR BUILDINGS — costs calibrated to infrastructure [6,10] / power-spike [7,11] bands
  // at era 5 production rate of 12/turn: infrastructure max=120, power-spike max=132
  guildhall: {
    id: 'guildhall', name: 'Guildhall', category: 'economy',
    yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 120,
    description: 'Merchants and craftspeople guild. +2 production, +1 gold.',
    techRequired: 'guilds',
  },
  university: {
    id: 'university', name: 'University', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 130,
    description: 'Advanced centre of learning. +4 science.',
    techRequired: 'scientific-method',
  },
  art_gallery: {
    id: 'art_gallery', name: 'Art Gallery', category: 'culture',
    yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 110,
    description: 'Gallery of renaissance masterworks. +2 gold.',
    techRequired: 'renaissance-painting',
  },
  blast_furnace: {
    id: 'blast_furnace', name: 'Blast Furnace', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 120,
    description: 'High-temperature iron smelter. +3 production.',
    techRequired: 'blast-furnace-tech',
  },
  distillery: {
    id: 'distillery', name: 'Distillery', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 108,
    description: 'Spirit and medicine distillery. +2 gold.',
    techRequired: 'distillation',
  },
  monastery: {
    id: 'monastery', name: 'Monastery', category: 'culture',
    yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 110,
    description: 'Monastic community of scholars. +1 science, +1 gold.',
    techRequired: 'monastic-orders',
  },

  // ERA 5 SPECIAL BUILDINGS
  harbour_exchange: {
    id: 'harbour_exchange', name: 'Harbour Exchange', category: 'economy',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 120,
    description: 'Coastal trade exchange. +3 gold. Requires coastal city.',
    techRequired: 'deep-sea-routes', coastalRequired: true,
  },
  apothecary_house: {
    id: 'apothecary_house', name: 'Apothecary House', category: 'science',
    yields: { food: 2, production: 0, gold: 0, science: 1 }, productionCost: 125,
    description: 'Advanced herbalist practice. +2 food, +1 science. Requires Herbalist.',
    techRequired: 'herbalist-guilds', requiresBuildings: ['herbalist'],
  },

  // ERA 6 REGULAR BUILDINGS
  natural_history_museum: {
    id: 'natural_history_museum', name: 'Natural History Museum', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 130,
    description: 'Catalogue of the natural world. +3 science. Scientific Method era science engine.',
    techRequired: 'natural-history',
  },
  surgery_guild: {
    id: 'surgery_guild', name: 'Surgery Guild', category: 'science',
    yields: { food: 2, production: 0, gold: 0, science: 1 }, productionCost: 120,
    description: 'Certified surgical school. +2 food, +1 science. Units in city heal faster.',
    techRequired: 'surgical-school',
  },
  concert_hall: {
    id: 'concert_hall', name: 'Concert Hall', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 115,
    description: 'Grand music hall draws wealthy patrons. +3 gold. Cultural prestige.',
    techRequired: 'baroque-music',
  },
  star_fort: {
    id: 'star_fort', name: 'Star Fort', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 125,
    description: 'Angled bastion fortress. +3 production. City walls gain +5 garrison defense.',
    techRequired: 'fortification-engineering',
  },

  // ERA 7 REGULAR BUILDINGS — costs calibrated to era-7 production rate of ~15/turn
  // infrastructure band [8,13]: 120–195; power-spike band [9,14]: 135–210
  factory: {
    id: 'factory', name: 'Factory', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 1 }, productionCost: 155,
    description: 'Steam-powered industrial works. +3 production, +1 science.',
    techRequired: 'steam-power',
  },
  steel_mill: {
    id: 'steel_mill', name: 'Steel Mill', category: 'production',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 160,
    description: 'High-output steel smelting plant. +4 production. Requires iron.',
    techRequired: 'steel-production', resourceRequired: ['iron'],
  },
  field_hospital: {
    id: 'field_hospital', name: 'Field Hospital', category: 'food',
    yields: { food: 1, production: 0, gold: 0, science: 0 }, productionCost: 140,
    description: 'Sanitary medical facility. +1 food per turn from improved public health.',
    techRequired: 'field-hospitals',
  },
  print_shop: {
    id: 'print_shop', name: 'Print Shop', category: 'culture',
    yields: { food: 0, production: 0, gold: 1, science: 2 }, productionCost: 140,
    description: 'Mass-print press and news distribution. +2 science, +1 gold.',
    techRequired: 'popular-press',
  },
  census_office: {
    id: 'census_office', name: 'Census Office', category: 'economy',
    yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 130,
    description: 'Government bureau tracking population and resources. +1 gold, +1 science.',
    techRequired: 'nationalism',
  },

  // ERA 7 NATIONAL PROJECTS — homeEra 7, available during era 7 and 8
  national_railway: {
    id: 'national_railway', name: 'National Railway', category: 'economy',
    yields: { food: 0, production: 0, gold: 4, science: 0 }, productionCost: 195,
    description: 'Empire-wide rail network. +4 gold empire-wide from expanded trade capacity.',
    techRequired: 'railway-expansion',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 7 },
    civYieldBonus: { gold: 4 },
  },
  grand_arsenal: {
    id: 'grand_arsenal', name: 'Grand Arsenal', category: 'military',
    yields: { food: 0, production: 5, gold: 0, science: 0 }, productionCost: 195,
    description: 'Central weapons manufacturing complex. +5 production empire-wide.',
    techRequired: 'mass-mobilization',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 7 },
    civYieldBonus: { production: 5 },
  },
  peoples_university: {
    id: 'peoples_university', name: "People's University", category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 5 }, productionCost: 195,
    description: 'Public institution of higher learning. +5 science empire-wide.',
    techRequired: 'industrialization',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.5, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 7 },
    civYieldBonus: { science: 5 },
  },

  // ERA 8 NATIONAL PROJECTS — homeEra 8, available during era 8 and 9
  world_fair: {
    id: 'world_fair', name: 'World Fair', category: 'economy',
    yields: { food: 0, production: 0, gold: 6, science: 0 }, productionCost: 252,
    description: 'International industrial exhibition. Draws global commerce prestige. +6 gold empire-wide.',
    techRequired: 'engineering-exhibition',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 8 },
    civYieldBonus: { gold: 6 },
  },
  national_archives_building: {
    id: 'national_archives_building', name: 'National Archives', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 5 }, productionCost: 252,
    description: 'Central repository of state knowledge and imperial records. +5 science empire-wide.',
    techRequired: 'public-records',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.5, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 8 },
    civYieldBonus: { science: 5 },
  },
  imperial_general_staff: {
    id: 'imperial_general_staff', name: 'Imperial General Staff', category: 'military',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 252,
    description: 'Unified military command. Coordinates empire-wide industrial production. +4 production empire-wide.',
    techRequired: 'general-mobilization',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 8 },
    civYieldBonus: { production: 4 },
  },

  // ERA 8 REGULAR BUILDINGS — costs calibrated to era-8 production rate of ~18/turn
  steel_foundry: {
    id: 'steel_foundry', name: 'Steel Foundry', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 175,
    description: 'Iron smelting via Bessemer process. +3 production, reduces iron unit costs.',
    techRequired: 'bessemer-steel',
  },
  telephone_exchange: {
    id: 'telephone_exchange', name: 'Telephone Exchange', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 155,
    description: 'Telegraph and telephone hub. +2 gold, +1 science per turn.',
    techRequired: 'telephony',
  },
  labor_hall: {
    id: 'labor_hall', name: 'Labor Hall', category: 'production',
    yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 135,
    description: "Workers' assembly hall. +2 production, +1 gold per turn.",
    techRequired: 'labor-rights',
  },
  opera_house: {
    id: 'opera_house', name: 'Opera House', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 150,
    description: 'Grand opera theater. +3 gold per turn.',
    techRequired: 'grand-opera',
  },
  bacteriology_lab: {
    id: 'bacteriology_lab', name: 'Bacteriology Lab', category: 'science',
    yields: { food: 1, production: 0, gold: 0, science: 3 }, productionCost: 160,
    description: 'Medical research facility. +3 science, +1 food per turn.',
    techRequired: 'germ-biology',
  },
  stock_exchange_tower: {
    id: 'stock_exchange_tower', name: 'Stock Exchange Tower', category: 'economy',
    yields: { food: 0, production: 0, gold: 4, science: 0 }, productionCost: 170,
    description: 'Central stock market tower. +4 gold per turn.',
    techRequired: 'industrial-monopoly',
  },
  sanatorium: {
    id: 'sanatorium', name: 'Sanatorium', category: 'science',
    yields: { food: 1, production: 0, gold: 0, science: 2 }, productionCost: 160,
    description: 'Public health facility. +2 science, +1 food per turn.',
    techRequired: 'public-health-service',
  },
  power_station: {
    id: 'power_station', name: 'Power Station', category: 'production',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 175,
    description: 'Electrical power grid. +4 production per turn.',
    techRequired: 'structural-engineering',
  },
  exhibition_hall: {
    id: 'exhibition_hall', name: 'Exhibition Hall', category: 'culture',
    yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 150,
    description: 'Industrial exhibition center. +2 gold, +1 science per turn.',
    techRequired: 'engineering-exhibition',
  },

  /* === ERA 9 REGULAR BUILDINGS === */
  oil_refinery: {
    id: 'oil_refinery', name: 'Oil Refinery', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 185,
    description: 'Petroleum extraction and refining. +3 production per turn.',
    techRequired: 'petroleum-industry',
  },
  assembly_line: {
    id: 'assembly_line', name: 'Assembly Line', category: 'production',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 195,
    description: 'Mass-production factory. +4 production per turn.',
    techRequired: 'fordist-manufacturing',
  },
  radio_station: {
    id: 'radio_station', name: 'Radio Station', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 160,
    description: 'Broadcast tower reaches every household. +2 gold, +1 science per turn.',
    techRequired: 'radio-broadcast',
  },
  airfield: {
    id: 'airfield', name: 'Airfield', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 175,
    description: 'Aviation base. +2 production per turn; enables air support in this city.',
    techRequired: 'aviation',
  },
  film_studio: {
    id: 'film_studio', name: 'Film Studio', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 160,
    description: 'Moving picture studio. +3 gold per turn.',
    techRequired: 'cinema',
  },
  national_insurance: {
    id: 'national_insurance', name: 'National Insurance', category: 'economy',
    yields: { food: 2, production: 0, gold: 1, science: 0 }, productionCost: 145,
    description: 'State welfare office. +2 food, +1 gold per turn.',
    techRequired: 'welfare-state',
  },
  hydroelectric_dam: {
    id: 'hydroelectric_dam', name: 'Hydroelectric Dam', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 185,
    description: 'River dam generating electricity. +3 production per turn.',
    techRequired: 'hydroelectric-power',
  },
  research_institute: {
    id: 'research_institute', name: 'Research Institute', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 170,
    description: 'Modern research campus. +4 science per turn.',
    techRequired: 'quantum-theory',
  },
  tank_depot: {
    id: 'tank_depot', name: 'Tank Depot', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 165,
    description: 'Armored vehicle maintenance base. +2 production per turn.',
    techRequired: 'tank-warfare',
  },
  anti_air_battery: {
    id: 'anti_air_battery', name: 'Anti-Air Battery', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 170,
    description: 'Flak guns on city rooftops. All city defenders gain +8 defense strength against air unit attacks.',
    techRequired: 'air-superiority',
  },

  /* === ERA 9 NATIONAL PROJECTS === */
  mobilization_act: {
    id: 'mobilization_act', name: 'Mobilization Act', category: 'military',
    yields: { food: 0, production: 5, gold: 0, science: 0 }, productionCost: 280,
    description: 'Total war mobilization decree. +5 production empire-wide.',
    techRequired: 'armored-tactics',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 9 },
    civYieldBonus: { production: 5 },
  },
  state_broadcasting: {
    id: 'state_broadcasting', name: 'State Broadcasting', category: 'economy',
    yields: { food: 0, production: 0, gold: 6, science: 0 }, productionCost: 280,
    description: 'National radio network under state control. +6 gold empire-wide.',
    techRequired: 'propaganda-campaigns',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 9 },
    civYieldBonus: { gold: 6 },
  },
  national_census: {
    id: 'national_census', name: 'National Census', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 5 }, productionCost: 280,
    description: 'Modern statistical survey of the empire. +5 science empire-wide.',
    techRequired: 'welfare-state',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.5, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 9 },
    civYieldBonus: { science: 5 },
  },
  air_force_command: {
    id: 'air_force_command', name: 'Air Force Command', category: 'military',
    // Two keys: production 3 ≤ 3, science 2 ≤ 3; total 5 ≤ 9 (era 9 ceiling) ✓
    yields: { food: 0, production: 3, gold: 0, science: 2 }, productionCost: 280,
    description: 'Centralised aviation command. +3 production and +2 science empire-wide. Your air units gain +4 strength in combat.',
    techRequired: 'air-superiority',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 9 },
    civYieldBonus: { production: 3, science: 2 },
  },

  /* === ERA 10 REGULAR BUILDINGS === */
  nuclear_arsenal: {
    id: 'nuclear_arsenal', name: 'Nuclear Arsenal', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 195,
    description: 'Atomic weapon stockpile. +3 production per turn. City siege operations gain a decisive edge.',
    techRequired: 'nuclear-weapons',
    pacing: { band: 'power-spike', role: 'late-military-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.1, unlockBreadth: 1 },
  },
  central_bank: {
    id: 'central_bank', name: 'Central Bank', category: 'economy',
    yields: { food: 0, production: 0, gold: 4, science: 0 }, productionCost: 190,
    description: 'National reserve bank. +4 gold per turn. State investment cycles stabilise the economy.',
    techRequired: 'keynesian-economics',
    pacing: { band: 'power-spike', role: 'late-economy', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.0, unlockBreadth: 1 },
  },
  atomic_laboratory: {
    id: 'atomic_laboratory', name: 'Atomic Laboratory', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 195,
    description: 'Nuclear research facility. +4 science per turn. Atomic science reaches critical mass.',
    techRequired: 'nuclear-physics',
    pacing: { band: 'power-spike', role: 'late-science', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.1, situationality: 1.0, unlockBreadth: 1 },
  },
  radar_station: {
    id: 'radar_station', name: 'Radar Station', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 180,
    description: 'Early-warning radar array. +2 science per turn. Accelerates navigation and threat detection.',
    techRequired: 'radar-systems',
    pacing: { band: 'infrastructure', role: 'defense-science', impact: 1.2, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.2, unlockBreadth: 1 },
  },
  un_delegation: {
    id: 'un_delegation', name: 'UN Delegation', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 185,
    description: 'Permanent mission to international bodies. +2 gold, +1 science per turn.',
    techRequired: 'international-institutions',
    pacing: { band: 'infrastructure', role: 'diplomacy-economy', impact: 1.2, scope: 'city', snowball: 1.1, urgency: 1.0, situationality: 1.1, unlockBreadth: 1 },
  },
  rocket_program: {
    id: 'rocket_program', name: 'Rocket Program', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 190,
    description: 'Early rocketry research centre. +3 science per turn. Points toward the upper atmosphere.',
    techRequired: 'rocketry',
    pacing: { band: 'power-spike', role: 'late-science', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.0, unlockBreadth: 1 },
  },
  public_hospital: {
    id: 'public_hospital', name: 'Public Hospital', category: 'food',
    yields: { food: 3, production: 0, gold: 0, science: 0 }, productionCost: 185,
    description: 'Publicly funded clinic. +3 food per turn. Raises life expectancy across the empire.',
    techRequired: 'universal-healthcare',
    pacing: { band: 'power-spike', role: 'late-growth', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.0, unlockBreadth: 1 },
  },
  chemical_plant: {
    id: 'chemical_plant', name: 'Chemical Plant', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 185,
    description: 'Industrial polymer facility. +3 production per turn. Plastics replace scarce natural materials.',
    techRequired: 'synthetic-polymers',
    pacing: { band: 'power-spike', role: 'late-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.0, unlockBreadth: 1 },
  },
  nuclear_power_plant: {
    id: 'nuclear_power_plant', name: 'Nuclear Power Plant', category: 'production',
    yields: { food: 0, production: 5, gold: 0, science: 0 }, productionCost: 200,
    description: 'Atomic reactor generating electricity without fuel costs. +5 production per turn.',
    techRequired: 'nuclear-power',
    pacing: { band: 'marquee', role: 'late-power-production', impact: 1.6, scope: 'city', snowball: 1.5, urgency: 1.2, situationality: 1.0, unlockBreadth: 1 },
  },
  television_station: {
    id: 'television_station', name: 'Television Station', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 180,
    description: 'Broadcast studio reaching every living room. +3 gold per turn.',
    techRequired: 'television',
    pacing: { band: 'infrastructure', role: 'culture-economy', impact: 1.2, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.1, unlockBreadth: 1 },
  },
  signals_bureau: {
    id: 'signals_bureau', name: 'Signals Bureau', category: 'espionage',
    yields: { food: 0, production: 0, gold: 1, science: 2 }, productionCost: 160,
    description: 'Signals intercept facility. +2 science, +1 gold per turn. Enemy spy missions suffer -20% success.',
    techRequired: 'signals-intelligence',
    pacing: { band: 'specialist', role: 'espionage-science', impact: 1.3, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.3, unlockBreadth: 1 },
  },

  /* === ERA 10 NATIONAL PROJECTS === */
  manhattan_project: {
    id: 'manhattan_project', name: 'Manhattan Project', category: 'military',
    // Single key: production 6 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 0, production: 6, gold: 0, science: 0 }, productionCost: 310,
    description: 'Total war weapons programme. +6 production empire-wide.',
    techRequired: 'nuclear-weapons',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10 },
    civYieldBonus: { production: 6 },
  },
  postwar_reconstruction: {
    id: 'postwar_reconstruction', name: 'Postwar Reconstruction', category: 'economy',
    // Two keys: gold 3 ≤ 3, food 3 ≤ 3; total 6 ≤ 9 ✓
    yields: { food: 3, production: 0, gold: 3, science: 0 }, productionCost: 310,
    description: 'Marshall-plan reconstruction effort. +3 gold and +3 food empire-wide.',
    techRequired: 'keynesian-economics',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10 },
    civYieldBonus: { gold: 3, food: 3 },
  },
  space_program_initiative: {
    id: 'space_program_initiative', name: 'Space Program Initiative', category: 'science',
    // Single key: science 6 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 0, production: 0, gold: 0, science: 6 }, productionCost: 310,
    description: 'National rocketry and space exploration programme. +6 science empire-wide.',
    techRequired: 'rocketry',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10 },
    civYieldBonus: { science: 6 },
  },

  // ─── Era 11 regular buildings ───────────────────────────────────────────────
  helicopter_base: {
    id: 'helicopter_base', name: 'Helicopter Base', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 210,
    description: 'Dedicated operations base for attack helicopter wings. +3 production per turn.',
    techRequired: 'helicopter-warfare',
    pacing: { band: 'power-spike', role: 'air-military-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
  },
  missile_silo: {
    id: 'missile_silo', name: 'Missile Silo', category: 'military',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 215,
    description: 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn. Acts as strategic deterrent.',
    techRequired: 'icbm-development',
    pacing: { band: 'power-spike', role: 'strategic-deterrent', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.2, situationality: 1.2, unlockBreadth: 1 },
  },
  semiconductor_fab: {
    id: 'semiconductor_fab', name: 'Semiconductor Fabricator', category: 'science',
    yields: { food: 0, production: 1, gold: 0, science: 2 }, productionCost: 200,
    description: 'Clean-room facility producing transistor wafers and integrated circuits. +2 science, +1 production per turn.',
    techRequired: 'integrated-circuits',
    pacing: { band: 'infrastructure', role: 'microelectronics-science', impact: 1.3, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.1, unlockBreadth: 1 },
  },
  genetic_research_lab: {
    id: 'genetic_research_lab', name: 'Genetic Research Lab', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 210,
    description: 'Molecular biology laboratory studying DNA, proteins, and cellular mechanics. +4 science per turn.',
    techRequired: 'molecular-biology',
    pacing: { band: 'power-spike', role: 'late-life-sciences', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.1, situationality: 1.0, unlockBreadth: 1 },
  },
  environmental_agency: {
    id: 'environmental_agency', name: 'Environmental Agency', category: 'food',
    yields: { food: 3, production: 0, gold: 1, science: 0 }, productionCost: 200,
    description: 'Government bureau regulating pollution and protecting natural resources. +3 food, +1 gold per turn.',
    techRequired: 'civil-rights-legislation',
    pacing: { band: 'infrastructure', role: 'ecology-growth', impact: 1.3, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.1, unlockBreadth: 1 },
  },
  space_center: {
    id: 'space_center', name: 'Space Center', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 5 }, productionCost: 220,
    description: 'Launch complex and research campus for orbital programs. +5 science per turn. Prestige structure of the space age.',
    techRequired: 'space-exploration',
    pacing: { band: 'marquee', role: 'space-science-apex', impact: 1.6, scope: 'city', snowball: 1.5, urgency: 1.2, situationality: 1.0, unlockBreadth: 1 },
  },
  agricultural_station: {
    id: 'agricultural_station', name: 'Agricultural Research Station', category: 'food',
    yields: { food: 4, production: 0, gold: 0, science: 0 }, productionCost: 210,
    description: 'Research farm testing high-yield crop varieties and modern irrigation. +4 food per turn.',
    techRequired: 'green-revolution-crops',
    pacing: { band: 'power-spike', role: 'green-revolution-growth', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.0, unlockBreadth: 1 },
  },
  transplant_hospital: {
    id: 'transplant_hospital', name: 'Transplant Hospital', category: 'food',
    yields: { food: 3, production: 0, gold: 0, science: 0 }, productionCost: 210,
    description: 'Specialist surgical facility performing organ transplants and advanced procedures. +3 food per turn.',
    techRequired: 'organ-transplantation',
    pacing: { band: 'power-spike', role: 'late-medical-growth', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.0, unlockBreadth: 1 },
  },
  container_port: {
    id: 'container_port', name: 'Container Port', category: 'economy',
    yields: { food: 0, production: 0, gold: 5, science: 0 }, productionCost: 200,
    description: 'Deep-water port with intermodal container facilities. +5 gold per turn. Standardised steel boxes slash freight costs. Requires coastal city.',
    techRequired: 'container-shipping',
    coastalRequired: true,
    pacing: { band: 'infrastructure', role: 'coastal-trade-gold', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.0, situationality: 1.4, unlockBreadth: 1 },
  },
  research_network: {
    id: 'research_network', name: 'Research Network', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 210,
    description: 'University-linked packet-switched grid connecting research institutions. +4 science per turn. Early internet accelerates collaboration.',
    techRequired: 'arpanet',
    pacing: { band: 'power-spike', role: 'internet-science', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.1, situationality: 1.0, unlockBreadth: 1 },
  },
  surveillance_agency: {
    id: 'surveillance_agency', name: 'Surveillance Agency', category: 'espionage',
    yields: { food: 0, production: 0, gold: 1, science: 2 }, productionCost: 200,
    description: 'Signals intelligence bureau monitoring communications via satellite intercepts. +2 science, +1 gold per turn. Satellite data sharpens counter-intelligence operations.',
    techRequired: 'satellite-surveillance',
    pacing: { band: 'infrastructure', role: 'signals-intel-science', impact: 1.3, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.3, unlockBreadth: 1 },
  },

  // ─── Era 11 national projects ────────────────────────────────────────────────
  arms_control_treaty: {
    id: 'arms_control_treaty', name: 'Arms Control Treaty', category: 'economy',
    // Single key: gold 5 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 0, production: 0, gold: 5, science: 0 }, productionCost: 210,
    description: 'Superpower arms limitation agreement. +5 gold empire-wide. Diplomatic prestige reduces tensions globally.',
    techRequired: 'arms-control-negotiations',
    pacing: { band: 'power-spike', role: 'national-project', impact: 1.4, scope: 'empire', snowball: 1.3, urgency: 1.0, situationality: 1.1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 11 },
    civYieldBonus: { gold: 5 },
  },
  green_revolution_program: {
    id: 'green_revolution_program', name: 'Green Revolution Program', category: 'food',
    // Single key: food 5 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 5, production: 0, gold: 0, science: 0 }, productionCost: 210,
    description: 'Empire-wide adoption of high-yield crop strains and modern irrigation. +5 food empire-wide.',
    techRequired: 'green-revolution-crops',
    pacing: { band: 'power-spike', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.1, situationality: 1.0, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 11 },
    civYieldBonus: { food: 5 },
  },
  strategic_air_command: {
    id: 'strategic_air_command', name: 'Strategic Air Command', category: 'military',
    // Single key: production 6 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 0, production: 6, gold: 0, science: 0 }, productionCost: 215,
    description: 'Unified command structure for intercontinental nuclear and conventional air forces. +6 production empire-wide.',
    techRequired: 'icbm-development',
    pacing: { band: 'power-spike', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.2, situationality: 1.2, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 11 },
    civYieldBonus: { production: 6 },
  },

  // === ERA 12 BUILDINGS ===

  automated_port: {
    id: 'automated_port', name: 'Automated Port', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 0 },
    productionCost: 200,
    description: 'Autonomous logistics eliminates maintenance costs for all trade routes. Coastal cities only.',
    techRequired: 'autonomous-shipping',
    coastalRequired: true,
  },

  biotech_lab: {
    id: 'biotech_lab', name: 'Biotech Lab', category: 'science',
    yields: { food: 3, production: 0, gold: 0, science: 2 },
    productionCost: 190,
    description: 'Genetic engineering breakthroughs boost food yield. Cities generate +1 food per 3 science per turn (from Genomics tech).',
    techRequired: 'genomics',
  },

  broadcast_tower: {
    id: 'broadcast_tower', name: 'Broadcast Tower', category: 'espionage',
    yields: { food: 0, production: 0, gold: 3, science: 0 },
    productionCost: 170,
    description: 'EM broadcast infrastructure supporting digital communications. Generates gold from digital commerce.',
    techRequired: 'social-media',
  },

  cyber_defense_center: {
    id: 'cyber_defense_center', name: 'Cyber Defense Center', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 2 },
    productionCost: 200,
    description: 'Probabilistically blocks cyber unit gold drain (65%), spy Market Manipulation (60%), and mass-surveillance exposure (70%). Block chances +10% with a co-located Signals Hub.',
    techRequired: 'internet',
  },

  data_center: {
    id: 'data_center', name: 'Data Center', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 },
    productionCost: 200,
    description: 'High-performance computing cluster. Requires a Semiconductor Fab.',
    techRequired: 'quantum-computing',
    requiresBuildings: ['semiconductor_fab'],
  },

  fintech_hub: {
    id: 'fintech_hub', name: 'Fintech Hub', category: 'economy',
    yields: { food: 0, production: 0, gold: 2, science: 0 },
    productionCost: 180,
    description: 'Digital payment infrastructure. With Digital Economy tech, the host city gains +1 gold per active trade route.',
    techRequired: 'digital-economy',
  },

  gene_therapy_clinic: {
    id: 'gene_therapy_clinic', name: 'Gene Therapy Clinic', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 2 },
    productionCost: 220,
    description: 'Units trained here start with gene therapy pre-charged — they survive one lethal hit at 1 HP before requiring rest.',
    techRequired: 'gene-therapy',
  },

  precision_farm: {
    id: 'precision_farm', name: 'Precision Farm', category: 'food',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 160,
    description: "GPS-guided equipment. With Precision Agriculture tech, farm improvements in this city's borders also yield +1 production.",
    techRequired: 'precision-agriculture',
  },

  signals_hub: {
    id: 'signals_hub', name: 'Signals Hub', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 2 },
    productionCost: 200,
    description: 'Raises all CDC block chances in this city by +10%. Makes stealth bombers within 2 hexes targetable by ranged attacks. Requires a Cyber Defense Center.',
    techRequired: 'cyber-intelligence',
    requiresBuildings: ['cyber_defense_center'],
  },

  smart_grid: {
    id: 'smart_grid', name: 'Smart Grid', category: 'production',
    yields: { food: 0, production: 2, gold: 0, science: 1 },
    productionCost: 200,
    description: 'Intelligent power distribution. Requires a factory and a semiconductor fab.',
    techRequired: 'smart-cities',
    requiresBuildings: ['factory', 'semiconductor_fab'],
  },

  stealth_airbase: {
    id: 'stealth_airbase', name: 'Stealth Airbase', category: 'military',
    yields: { food: 0, production: 2, gold: 0, science: 0 },
    productionCost: 220,
    description: 'The only facility capable of training Stealth Bombers. Requires Stealth Technology research.',
    techRequired: 'stealth-technology',
  },

  telemedicine_hub: {
    id: 'telemedicine_hub', name: 'Telemedicine Hub', category: 'food',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 180,
    description: 'Remote medical care. With Telemedicine tech, friendly units within 3 hexes of this city heal +1 extra HP per turn.',
    techRequired: 'telemedicine',
  },
};

export const TRAINABLE_UNITS: Array<TrainableUnitEntry & { pacing?: Building['pacing'] }> = [
  { type: 'warrior', name: 'Warrior', cost: 8, obsoletedByTech: 'rifled-infantry', pacing: { band: 'starter', role: 'early-military', impact: 1, scope: 'military', snowball: 1, urgency: 1.2, situationality: 1, unlockBreadth: 1 } },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery', obsoletedByTech: 'tactics', pacing: { band: 'power-spike', role: 'ranged-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  { type: 'scout', name: 'Scout', cost: 6, pacing: { band: 'starter', role: 'early-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { type: 'worker', name: 'Worker', cost: 12 },
  { type: 'settler', name: 'Settler', cost: 24, pacing: { band: 'power-spike', role: 'expansion', impact: 1.25, scope: 'empire', snowball: 1.3, urgency: 1.05, situationality: 1, unlockBreadth: 1.2 } },
  { type: 'swordsman',    name: 'Swordsman',    cost: 50,  techRequired: 'bronze-working',   resourceRequired: ['iron'],   obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',        pacing: { band: 'power-spike', role: 'melee-breakpoint',       impact: 1.2,  scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'pikeman',      name: 'Pikeman',      cost: 70,  techRequired: 'fortification',    obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',                                        pacing: { band: 'power-spike', role: 'anti-cavalry-breakpoint', impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'musketeer',    name: 'Musketeer',    cost: 90,  techRequired: 'tactics',   obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman' },
  { type: 'galley',          name: 'Galley',          cost: 40,  techRequired: 'galleys',            coastalRequired: true, obsoletedByTech: 'navigation', upgradesTo: 'carrack' },
  { type: 'transport',       name: 'Transport',       cost: 45,  techRequired: 'galleys',            coastalRequired: true, obsoletedByTech: 'navigation', upgradesTo: 'carrack' },
  { type: 'carrack',         name: 'Carrack',         cost: 48,  techRequired: 'navigation',         coastalRequired: true, obsoletedByTech: 'triremes', upgradesTo: 'galleon' },
  { type: 'galleon',         name: 'Galleon',         cost: 80,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'caravels', upgradesTo: 'steamship' },
  { type: 'steamship',       name: 'Steamship',       cost: 100, techRequired: 'caravels',           coastalRequired: true, obsoletedByTech: 'ironclad-warships' },
  { type: 'troop_transport', name: 'Troop Transport', cost: 120, techRequired: 'amphibious-warfare', coastalRequired: true },
  { type: 'trireme',         name: 'Trireme',         cost: 70,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'caravels', upgradesTo: 'steamship', pacing: { band: 'power-spike', role: 'naval-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  // S4b — melee
  { type: 'axeman',       name: 'Axeman',       cost: 22,  techRequired: 'stone-weapons',    resourceRequired: ['copper'],         obsoletedByTech: 'fortification', upgradesTo: 'pikeman', pacing: { band: 'power-spike', role: 'early-copper-melee',    impact: 1.1,  scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'spearman',     name: 'Spearman',     cost: 32,  techRequired: 'bronze-working',                                        obsoletedByTech: 'fortification', upgradesTo: 'pikeman', pacing: { band: 'power-spike', role: 'ungated-era2-melee',    impact: 1.05, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'horseman',     name: 'Horseman',     cost: 55,  techRequired: 'horseback-riding', resourceRequired: ['horses'],           obsoletedByTech: 'tank-warfare', upgradesTo: 'tank',                       pacing: { band: 'power-spike', role: 'basic-cavalry',         impact: 1.15, scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'cavalry',      name: 'Cavalry',      cost: 60,  techRequired: 'horseback-riding', resourceRequired: ['horses', 'iron'],   obsoletedByTech: 'tank-warfare', upgradesTo: 'tank',                       pacing: { band: 'power-spike', role: 'heavy-cavalry',         impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'knight',       name: 'Knight',       cost: 80,  techRequired: 'iron-forging',     resourceRequired: ['horses', 'iron'],   obsoletedByTech: 'tank-warfare', upgradesTo: 'tank',                       pacing: { band: 'power-spike', role: 'heavy-cavalry-apex',    impact: 1.25, scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  // S4b — ranged + siege
  { type: 'crossbowman',  name: 'Crossbowman',  cost: 75,  techRequired: 'tactics',          resourceRequired: ['copper'],  obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',        pacing: { band: 'power-spike', role: 'precision-ranged',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'catapult',     name: 'Catapult',     cost: 110, techRequired: 'siege-warfare',    resourceRequired: ['stone'],   obsoletedByTech: 'black-powder', upgradesTo: 'cannon',                      pacing: { band: 'power-spike', role: 'siege-bombardment',    impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'ballista',     name: 'Ballista',     cost: 100, techRequired: 'siege-warfare',    resourceRequired: ['iron'],    obsoletedByTech: 'black-powder', upgradesTo: 'cannon',                      pacing: { band: 'power-spike', role: 'anti-unit-siege',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.15, unlockBreadth: 1 } },
  { type: 'cannon',       name: 'Cannon',       cost: 120, techRequired: 'black-powder',                                      obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner',    pacing: { band: 'power-spike', role: 'gunpowder-siege',      impact: 1.3,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'grenadier',    name: 'Grenadier',    cost: 130, techRequired: 'grenade-warfare',  obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner',                                                    pacing: { band: 'power-spike', role: 'anti-fortification',   impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.3,  unlockBreadth: 1 } },
  { type: 'rifleman',     name: 'Rifleman',     cost: 145, techRequired: 'rifled-infantry',  obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner',                                                     pacing: { band: 'power-spike', role: 'ranged-infantry',      impact: 1.3,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'ironclad',     name: 'Ironclad',     cost: 160, techRequired: 'ironclad-warships', coastalRequired: true,         obsoletedByTech: 'naval-armor', upgradesTo: 'pre_dreadnought',       pacing: { band: 'power-spike', role: 'naval-superiority',    impact: 1.4,  scope: 'military', snowball: 1.3, urgency: 1.2,  situationality: 1.4,  unlockBreadth: 1 } },
  { type: 'machine_gunner', name: 'Machine Gunner', cost: 145, techRequired: 'mass-firepower',   obsoletedByTech: 'armored-tactics',                               pacing: { band: 'power-spike', role: 'ranged-suppression',  impact: 1.35, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'pre_dreadnought', name: 'Pre-Dreadnought', cost: 175, techRequired: 'naval-armor', coastalRequired: true, obsoletedByTech: 'submarine-warfare', upgradesTo: 'submarine', pacing: { band: 'power-spike', role: 'naval-apex',           impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'tank',      name: 'Tank',      cost: 185, techRequired: 'tank-warfare',                                                                                  pacing: { band: 'power-spike', role: 'armored-assault',     impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'submarine', name: 'Submarine', cost: 180, techRequired: 'submarine-warfare', coastalRequired: true,                                                      pacing: { band: 'power-spike', role: 'naval-stealth',        impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'observation_balloon', name: 'Observation Balloon', cost: 90,  techRequired: 'balloon-corps',   pacing: { band: 'power-spike', role: 'air-recon',  impact: 1.2, scope: 'military', snowball: 1.0, urgency: 1.0, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'biplane',             name: 'Biplane',             cost: 200, techRequired: 'air-superiority', obsoletedByTech: 'jet-aviation', upgradesTo: 'jet_fighter', pacing: { band: 'power-spike', role: 'air-strike', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'jet_fighter',         name: 'Jet Fighter',         cost: 300, techRequired: 'jet-aviation',    obsoletedByTech: 'stealth-technology', upgradesTo: 'stealth_bomber', pacing: { band: 'marquee',      role: 'air-apex',   impact: 1.6, scope: 'military', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'carrier',             name: 'Carrier',             cost: 220, techRequired: 'carrier-warfare', coastalRequired: true, pacing: { band: 'power-spike', role: 'naval-projection', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  // Era 11 units
  { type: 'attack_helicopter', name: 'Attack Helicopter', cost: 230, techRequired: 'helicopter-warfare', pacing: { band: 'marquee', role: 'air-assault', impact: 1.55, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'missile_submarine', name: 'Missile Submarine', cost: 250, techRequired: 'nuclear-submarines', coastalRequired: true, pacing: { band: 'marquee', role: 'naval-deterrent', impact: 1.6, scope: 'military', snowball: 1.5, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  // Era 12 units
  { type: 'cyber_unit', name: 'Cyber Unit', cost: 120, techRequired: 'cyber-warfare', pacing: { band: 'marquee', role: 'cyber-saboteur', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'stealth_bomber', name: 'Stealth Bomber', cost: 360, techRequired: 'stealth-technology', trainedFromBuilding: 'stealth_airbase', pacing: { band: 'marquee', role: 'stealth-strike', impact: 1.7, scope: 'military', snowball: 1.5, urgency: 1.3, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'spy_scout', name: 'Scout Agent', cost: 30, techRequired: 'espionage-scouting', obsoletedByTech: 'espionage-informants', upgradesTo: 'spy_informant', pacing: { band: 'power-spike', role: 'first-spy-unit', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_informant', name: 'Informant', cost: 50, techRequired: 'espionage-informants', obsoletedByTech: 'spy-networks', upgradesTo: 'spy_agent', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_agent', name: 'Field Agent', cost: 70, techRequired: 'spy-networks', obsoletedByTech: 'cryptography', upgradesTo: 'spy_operative', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.2, scope: 'military', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'cyber-warfare', upgradesTo: 'spy_hacker' },
  { type: 'spy_hacker', name: 'Cyber Operative', cost: 110, techRequired: 'cyber-warfare' },
  { type: 'scout_hound', name: 'Scout Hound', cost: 36, techRequired: 'lookouts', pacing: { band: 'power-spike', role: 'spy-detection', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'shadow_warden', name: 'Shadow Warden', cost: 36, techRequired: 'lookouts', civTypeRequired: 'persia', replacesUnit: 'scout_hound', pacing: { band: 'power-spike', role: 'unique-spy-detection', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'war_hound', name: 'War Hound', cost: 32, techRequired: 'lookouts', civTypeRequired: 'rome', replacesUnit: 'scout_hound', pacing: { band: 'power-spike', role: 'unique-spy-detection-combat', impact: 1.1, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 } },
  // S5 — trade unit
  { type: 'caravan', name: 'Caravan', cost: 60, techRequired: 'trade-routes' },
  // Resource Accessibility MR 2b — exploration unit
  { type: 'expedition', name: 'Expedition', cost: 18, techRequired: 'foraging' },
];

/**
 * Combat-capable units (UNIT_DEFINITIONS[type].strength > 0) intentionally left without
 * obsoletedByTech, with a reason each. Enforced by the completeness test in
 * tests/systems/city-system.test.ts — a new combat unit added to TRAINABLE_UNITS without
 * either obsoletedByTech or an entry here will fail that test.
 */
export const TERMINAL_COMBAT_UNITS: Partial<Record<UnitType, string>> = {
  tank: 'current top-tier armor, no later replacement in the roster yet',
  submarine: 'current top-tier submarine, no later replacement in the roster yet',
  jet_fighter: 'current air-combat apex, no later replacement in the roster yet',
  carrier: 'current top-tier naval projection, no later replacement in the roster yet',
  attack_helicopter: 'era 11, newest air-assault unit, no later replacement yet',
  missile_submarine: 'era 11, newest naval-deterrent unit, no later replacement yet',
  scout: 'recon unit, strength is a self-defense stat not its primary role, no replacement chain',
  observation_balloon: 'recon unit (air-recon role), strength is a self-defense stat, no replacement chain',
  spy_hacker: 'terminal tier of the espionage chain (spy_operative already obsoletes into this at cyber-warfare), no further replacement yet',
  scout_hound: 'recon/detection unit, strength is a self-defense stat, no replacement chain',
  shadow_warden: 'civ-specific (Persia) recon/detection replacement for scout_hound, same reasoning',
  war_hound: 'civ-specific (Rome) recon/detection replacement for scout_hound, same reasoning',
};

export const SETTLER_COST_BY_ERA: Record<number, number> = {
  1: 16,
  2: 24,
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
const SIEGE_UNIT_TYPES: string[] = ['catapult', 'ballista', 'cannon'];

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
  transport:        '⛴️',
  carrack:          '🚢',
  galleon:          '⛵',
  steamship:        '🛳️',
  troop_transport:  '🛥️',
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
  cannon:      '💣',
  grenadier:   '🧨',
  rifleman:    '🎯',
  ironclad:    '⚓',
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
  // Resource Accessibility MR 2b
  expedition:      '🧭',
  bank:            '🏦',
  stock_exchange:  '📈',
  // National Projects
  sacred_grove:         '🌳',
  tribal_muster_ground: '⚔️',
  communal_stores:      '🏚️',
  grand_bazaar:         '🪙',
  foundry_guild:        '⚒️',
  scribes_hall:         '📜',
  philosophers_circle:  '🏛️',
  road_corps:           '🛤️',
  iron_legion:          '🛡️',
  imperial_archive:     '📚',
  praetorian_legion:    '⚔️',
  royal_mint:           '💰',
  royal_academy:        '🎓',
  artillery_corps_hq:   '💣',
  explorers_guild:      '🧭',
  // era 5 regular buildings
  guildhall:            '🏛️',
  university:           '🎓',
  art_gallery:          '🖼️',
  blast_furnace:        '🔩',
  distillery:           '🍶',
  monastery:            '⛪',
  // era 5 special buildings
  harbour_exchange:     '⚓',
  apothecary_house:     '🌿',
  // era 6 national projects
  military_academy:     '🎖️',
  grand_cipher_bureau:  '🔐',
  colonial_administration: '🗺️',
  // era 6 regular buildings
  natural_history_museum: '🦕',
  surgery_guild:        '⚕️',
  concert_hall:         '🎻',
  star_fort:            '⭐',
  // era 7 regular buildings
  factory:              '🏭',
  steel_mill:           '⚙️',
  field_hospital:       '🏥',
  print_shop:           '📰',
  census_office:        '📋',
  // era 7 national projects
  national_railway:     '🚂',
  grand_arsenal:        '🔫',
  peoples_university:   '📖',
  // era 8 national projects
  world_fair:                  '🎪',
  national_archives_building:  '📚',
  imperial_general_staff:      '⚔️',
  // era 8 regular buildings
  steel_foundry:        '🏭',
  telephone_exchange:   '📞',
  labor_hall:           '✊',
  opera_house:          '🎭',
  bacteriology_lab:     '🔬',
  stock_exchange_tower: '🏢',
  sanatorium:           '🏥',
  power_station:        '⚡',
  exhibition_hall:      '🏛️',
  // era 8 units
  machine_gunner:  '🔫',
  pre_dreadnought: '🚢',
  // era 9 buildings
  oil_refinery:         '🛢️',
  assembly_line:        '🏭',
  radio_station:        '📻',
  airfield:             '✈️',
  film_studio:          '🎬',
  national_insurance:   '🏥',
  hydroelectric_dam:    '⚡',
  research_institute:   '🔬',
  tank_depot:           '🛡️',
  anti_air_battery:     '🔫',
  air_force_command:    '🛫',
  // era 9 national projects
  mobilization_act:     '⚔️',
  state_broadcasting:   '📡',
  national_census:      '📊',
  // era 9 units
  tank:       '🛡️',
  submarine:  '🌊',
  observation_balloon: '🎈',
  biplane:    '✈️',
  jet_fighter: '🛩️',
  carrier:    '🛳️',
  // era 10 regular buildings
  nuclear_arsenal: '☢️',
  central_bank: '🏦',
  atomic_laboratory: '⚛️',
  radar_station: '📡',
  un_delegation: '🕊️',
  rocket_program: '🚀',
  public_hospital: '🏥',
  chemical_plant: '🧪',
  nuclear_power_plant: '⚡',
  television_station: '📺',
  signals_bureau: '📻',
  // era 10 national projects
  manhattan_project: '💣',
  postwar_reconstruction: '🏗️',
  space_program_initiative: '🚀',
  // era 11 regular buildings
  helicopter_base: '🚁',
  missile_silo: '🚀',
  semiconductor_fab: '💻',
  genetic_research_lab: '🔬',
  environmental_agency: '🌿',
  space_center: '🛸',
  agricultural_station: '🌾',
  transplant_hospital: '🏥',
  container_port: '🚢',
  research_network: '🌐',
  surveillance_agency: '🛰️',
  // era 11 national projects
  arms_control_treaty: '🕊️',
  green_revolution_program: '🌾',
  strategic_air_command: '✈️',
  // era 11 units
  attack_helicopter: '🚁',
  missile_submarine: '🌊',
  // Era 12 buildings
  automated_port: '⚓',
  biotech_lab: '🧬',
  broadcast_tower: '📺',
  cyber_defense_center: '🛡️',
  data_center: '🖥️',
  fintech_hub: '💳',
  gene_therapy_clinic: '🧪',
  precision_farm: '🌾',
  signals_hub: '📡',
  smart_grid: '⚡',
  stealth_airbase: '✈️',
  telemedicine_hub: '🏥',
  // Era 12 units
  cyber_unit: '🖥️',
  stealth_bomber: '🛩️',
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

export function getTrainableUnitsForCity(
  city: City,
  completedTechs: string[],
  map: GameMap,
  civType?: string,
  availableResources?: Set<ResourceType>,
): TrainableUnitEntry[] {
  const coastal = isCityCoastal(city, map);
  return getTrainableUnitsForCiv(completedTechs, civType, availableResources)
    .filter(unit => !unit.coastalRequired || coastal)
    .filter(unit => !unit.trainedFromBuilding || (city.buildings ?? []).includes(unit.trainedFromBuilding));
}

export function getDetectionUnitTypeForCiv(civType?: string): UnitType {
  return TRAINABLE_UNITS.find(u => u.civTypeRequired === civType && u.replacesUnit === 'scout_hound')?.type ?? 'scout_hound';
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
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
  };
}

export function isCityCoastal(city: City, map: GameMap): boolean {
  const coordsToCheck = [city.position, ...hexNeighbors(city.position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
    const t = map.tiles[hexKey(wrapped)];
    return t?.terrain === 'ocean' || t?.terrain === 'coast';
  });
}

export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  era?: number,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    if (b.coastalRequired && !coastal) return false;
    if (availableResources !== undefined && b.resourceRequired?.length) {
      if (!b.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    if (b.requiresBuildings?.length) {
      if (!b.requiresBuildings.every((req: string) => city.buildings.includes(req))) return false;
    }
    if (b.nationalProject) {
      const currentEra = era ?? 1;
      if (currentEra < b.nationalProject.homeEra || currentEra > b.nationalProject.homeEra + 1) return false;
      if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
    }
    return true;
  });
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
  /** The coastal-required unit type that was dequeued because the city is no longer coastal, or null. */
  droppedUnit: UnitType | null;
  /** Any production item dequeued because it is no longer available. */
  droppedProductionItem: string | null;
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
  builtNationalProjectKeys?: Set<string>,
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
  let droppedBuilding: string | null = null;
  let droppedUnit: UnitType | null = null;
  let droppedProductionItem: string | null = null;

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
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      if (unit && !trainableTypes.has(unit.type)) {
        droppedProductionItem ??= unit.type;
        return false;
      }
      return trainableTypes.has(item as UnitType);
    });
    if (filtered.length !== newQueue.length) {
      newQueue.length = 0;
      newQueue.push(...filtered);
      if (filtered.length === 0) newProgress = 0;
    }
  }

  // Belt-and-suspenders: dequeue NPs outside their build window
  if (era > 1) {
    const beforeNP = newQueue.length;
    const filteredNP = newQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject) return true;
      return era >= bldg.nationalProject.homeEra && era <= bldg.nationalProject.homeEra + 1;
    });
    if (filteredNP.length !== beforeNP) {
      newQueue.length = 0;
      newQueue.push(...filteredNP);
      if (filteredNP.length === 0) newProgress = 0;
    }
  }

  // Coastal guard: drop the queue head BEFORE accumulating production so no yield is wasted.
  // A building with coastalRequired cannot be built in an inland city; if this city
  // lost coastal access (e.g. map-script edge case), remove the item silently.
  if (newQueue.length > 0) {
    const headBuilding = BUILDINGS[newQueue[0]];
    if (headBuilding?.coastalRequired && !isCityCoastal(city, map)) {
      droppedBuilding = newQueue.shift()!;
      droppedProductionItem = droppedBuilding;
      newProgress = 0;
    }
    const headUnit = TRAINABLE_UNITS.find(unit => unit.type === newQueue[0]);
    if (headUnit?.coastalRequired && !isCityCoastal(city, map)) {
      droppedUnit = newQueue.shift() as UnitType;
      droppedProductionItem = droppedUnit;
      newProgress = 0;
    } else if (headUnit?.trainedFromBuilding && !(city.buildings ?? []).includes(headUnit.trainedFromBuilding)) {
      droppedUnit = newQueue.shift() as UnitType;
      droppedProductionItem = droppedUnit;
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
  };

  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
    droppedBuilding,
    droppedUnit,
    droppedProductionItem,
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
    const isNaval = (['galley', 'trireme', 'transport', 'carrack', 'galleon', 'steamship', 'troop_transport'] as string[]).includes(itemId);
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
