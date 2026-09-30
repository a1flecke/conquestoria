import type { Building } from '@/core/types';

/**
 * The static building / national-project catalog (#1008).
 *
 * Pure data: no rules, no state, no imports beyond the `Building` shape. Split
 * out of `city-system.ts` so catalog consumers stop depending on the cost,
 * availability, turn and presentation code that used to share its module.
 */
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
  barracks: { id: 'barracks', name: 'Barracks', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10, description: 'Training ground. New land units start with +10 experience.', techRequired: null, pacing: { band: 'starter', role: 'military-enabler', impact: 1, scope: 'city', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1.05 } },
  walls: { id: 'walls', name: 'Walls', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 60, description: 'Defends the city', techRequired: 'fortification' },
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains light mounted and handler units. Horsemen, Cavalry, Armored Cars, and Beast Handlers cost 15% less here.', techRequired: 'horseback-riding', obsoletedByTech: 'tank-warfare' },

  // Culture
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center. +1 happiness in this city (reduces unrest pressure). Halves the rate at which a foreign faith can pull this city toward defecting.', techRequired: 'philosophy', happiness: 1 },
  monument: { id: 'monument', name: 'Monument', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 30, description: 'Commemorates your civilization', techRequired: 'code-of-laws', pacing: { band: 'infrastructure', role: 'early-culture', impact: 1.05, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture. +1 happiness in this city (reduces unrest pressure).', techRequired: 'drama-poetry', happiness: 1 },
  shrine: { id: 'shrine', name: 'Shrine', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 8, description: 'Place of worship', techRequired: null, pacing: { band: 'starter', role: 'early-science', impact: 1, scope: 'city', snowball: 1.1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  forum: { id: 'forum', name: 'Forum', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 70, description: 'Public gathering place', techRequired: 'civil-service', pacing: { band: 'infrastructure', role: 'civic-economy', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  // #919 MR2 — administration ladder rung 1. Effect is a dedicated negative unrest
  // row (UNREST_RELIEF_SOURCES in faction-system.ts), not a happiness field.
  courthouse: { id: 'courthouse', name: 'Courthouse', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 55, techRequired: 'magistracy', description: "Seat of provincial law. Cuts this city's unrest pressure from distance to the capital and from empire overextension (a courthoused city still carries a little).", pacing: { band: 'infrastructure', role: 'stability', impact: 1.05, scope: 'city', snowball: 1.05, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 } },
  'military-administration': { id: 'military-administration', name: 'Military Administration', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 45, techRequired: 'civil-service', description: "Reduces this city's unrest from war and newly captured cities without removing either pressure.", pacing: { band: 'infrastructure', role: 'stability', impact: 1.05, scope: 'city', snowball: 1, urgency: 1.15, situationality: 1.35, unlockBreadth: 1 } },
  regional_capital: { id: 'regional_capital', name: 'Regional Capital', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 160, techRequired: 'political-philosophy', description: 'A second administrative seat. Cities nearer this Regional Capital carry less distance pressure.', uniquePerEmpire: true, nationalProject: { homeEra: 4, milestone: true }, cannotBuildInCapital: true, pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 } },

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
    productionCost: 108,
    description: "Raises this city's counter-intelligence score by 20 each turn (max 100). Bonus halves when digital-surveillance era is reached.",
    techRequired: 'political-intelligence',
    defensiveEspionageAiValue: 40,
    pacing: { band: 'infrastructure', role: 'counter-intelligence', impact: 1.15, scope: 'city', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 },
  },
  'security-bureau': {
    id: 'security-bureau', name: 'Security Bureau', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 120,
    description: 'Raises counter-intelligence (CI) by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves when Signals Intelligence is researched.',
    techRequired: 'cold-war-networks',
    defensiveEspionageAiValue: 40,
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
    productionCost: 54,
    description: 'Pasture and breeding grounds. +2 food per turn.',
    techRequired: 'animal-husbandry',
    resourceRequired: ['horses'],
   
    pacing: { band: 'power-spike', role: 'horse-food', impact: 1.1, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
  'cavalry-academy': {
    id: 'cavalry-academy', name: 'Cavalry Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 55,
    description: 'Trains heavy mounted and elephant units. Chariots, Knights, Cuirassiers, and War Elephants cost 15% less here.',
    techRequired: 'horseback-riding',
    resourceRequired: ['horses'],
    obsoletedByTech: 'tank-warfare',
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
    description: 'Siege engine fabrication. Reduces Catapult, Ballista, and Trebuchet training cost by 20% in this city.',
    techRequired: 'siege-warfare',
    resourceRequired: ['stone'],
    obsoletedByTech: 'black-powder',
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
    description: 'Central mustering ground. +1 production empire-wide. Era 1–2 melee units train 10% cheaper empire-wide.',
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
  sacred_council: {
    id: 'sacred_council', name: 'Sacred Council', category: 'culture',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 120,
    description: 'Founds your empire\'s own faith — you\'ll name it and pick a boon afterward. One-time — permanent effect, never fades. Requires a Temple.',
    techRequired: 'philosophy', requiresBuildings: ['temple'],
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 3, milestone: true },
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
    description: 'Central cannon command. +2 production empire-wide. Siege-class units train 10% cheaper empire-wide.',
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
    description: 'Central officer training command. +3 production empire-wide. Gunpowder-class units train 10% cheaper empire-wide.',
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
    description: 'Monastic community of scholars. +1 science, +1 gold, +1 happiness in this city (reduces unrest pressure).',
    techRequired: 'monastic-orders',
    happiness: 1,
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
    description: 'Grand music hall draws wealthy patrons. +3 gold, +1 happiness in this city (reduces unrest pressure).',
    techRequired: 'baroque-music',
    happiness: 1,
  },
  star_fort: {
    id: 'star_fort', name: 'Star Fort', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 125,
    description: 'Angled bastion fortress. +3 production. City walls gain +5 garrison defense.',
    techRequired: 'fortification-engineering',
  },
  bunker: {
    id: 'bunker', name: 'Bunker', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 175,
    description: 'Reinforced shelter. +8 city defense; naval and air bombardment deal 15% less damage. Supersedes Star Fort.',
    techRequired: 'reinforced-concrete', requiresBuildings: ['walls'],
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
    description: 'Iron smelting via Bessemer process. +3 production. Iron-requiring units train 10% cheaper in this city.',
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
  coastal_battery: {
    id: 'coastal_battery', name: 'Coastal Battery', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 170,
    description: 'Naval defense +8. First naval hit each turn returns 20% damage (max 12). Also lets this city detect hidden enemy submarines within 1 hex.',
    techRequired: 'naval-armor', coastalRequired: true,
  },

  /* === ERA 9 REGULAR BUILDINGS === */
  oil_refinery: {
    id: 'oil_refinery', name: 'Oil Refinery', category: 'production',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 185,
    description: 'Petroleum extraction and refining. +3 production per turn.',
    techRequired: 'petroleum-industry', resourceRequired: ['oil'],
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
    description: 'Aviation base. Hosts 3 Biplanes, Jet Fighters, Bombers, or Recon Aircraft (4 after Air Force Command). +2 production per turn.',
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
    description: 'Armored vehicle maintenance base. Armored Car, Tank, Mechanized Infantry, and Main Battle Tank cost 10% less here and heal +5 more in this city. +2 production per turn.',
    techRequired: 'tank-warfare',
  },
  anti_air_battery: {
    id: 'anti_air_battery', name: 'Anti-Air Battery', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 170,
    description: 'Flak guns on city rooftops. All city defenders gain +8 defense strength against air unit attacks.',
    techRequired: 'air-superiority',
    airDefenseProvider: { radius: 0, defenseModifier: 8, stackingGroup: 'ground-air-defense' },
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
    description: 'Centralised aviation command. +3 production and +2 science empire-wide. Your air units gain +4 strength when attacking.',
    techRequired: 'air-superiority',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 9 },
    civYieldBonus: { production: 3, science: 2 },
  },

  /* === ERA 10 REGULAR BUILDINGS === */
  nuclear_arsenal: {
    id: 'nuclear_arsenal', name: 'Nuclear Arsenal', category: 'military',
    // #545: raised 3 -> 9, absorbing the +6 Manhattan Project can no longer
    // carry now that it's a milestone NP (see that definition below) —
    // era-10's combined production total across the two buildings is
    // unchanged, just sourced from this one building instead of two.
    yields: { food: 0, production: 9, gold: 0, science: 0 }, productionCost: 195,
    description: 'Atomic weapon stockpile. +9 production per turn.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
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
    description: 'Early-warning radar array. +2 science per turn. Combined with a Coastal Battery, extends this city\'s hidden-submarine detection range from 1 to 2 hexes.',
    techRequired: 'radar-systems',
    pacing: { band: 'infrastructure', role: 'defense-science', impact: 1.2, scope: 'city', snowball: 1.2, urgency: 1.0, situationality: 1.2, unlockBreadth: 1 },
  },
  sam_site: {
    id: 'sam_site', name: 'SAM Site', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 195,
    description: 'Surface-to-Air Missile (SAM) site protects friendly defenders within 2 hexes from air attacks. +12 defense strength against air attacks.',
    techRequired: 'radar-systems', requiredTechs: ['rocketry'],
    requiresBuildings: ['anti_air_battery', 'radar_station'],
    airDefenseProvider: { radius: 2, defenseModifier: 12, stackingGroup: 'ground-air-defense', requiresCompletedBuildingIds: ['radar_station'] },
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
    techRequired: 'nuclear-power', resourceRequired: ['uranium'],
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
    id: 'manhattan_project', name: 'Atomic Weapons Program', category: 'military',
    // #545: milestone NP (permanent, one-time trigger) — no civYieldBonus per
    // .claude/rules/game-balance.md's "Milestone National Projects" (matches
    // sacred_council's exact pattern). The +6 production this building used to
    // carry moved to nuclear_arsenal (see that definition above) so era-10's
    // combined production total across the two buildings is unchanged.
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 310,
    description: 'One-time atomic weapons program. Permanent effect, never fades — establishes your empire\'s capacity to develop a strategic arsenal.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10, milestone: true },
  },
  warhead: {
    id: 'warhead', name: 'Warhead', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 260,
    // #545: illustrative cost, tunable in the balance-pass MR per spec §1. Repeatable
    // (consumedOnCompletion) -- producing it adds 1 warhead to the empire-wide
    // strategicArsenal (turn-manager.ts's completion hook), capped by
    // getStrategicArsenalCapacity (arsenalCapacityGated). No launch capability is
    // implied by this description yet -- that's MR3 (strike) + MR4 (launch UX).
    description: 'A live nuclear warhead added to your empire\'s strategic arsenal. Requires Manhattan Project and available capacity (Nuclear Arsenal, Missile Silo). Not a per-city stockpile -- any eligible platform can draw from your empire\'s shared pool.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    // marquee (not power-spike): a rare, momentous production choice per spec Goal 1
    // ("never tactical spam"), matching manhattan_project's own band -- power-spike's
    // narrower turn window doesn't fit this item's 260 cost at era 10 (pacing-audit.test.ts
    // flagged it as a slow outlier under power-spike during MR2 execution).
    pacing: { band: 'marquee', role: 'strategic-arsenal', impact: 1.5, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 },
    consumedOnCompletion: true, arsenalCapacityGated: true,
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
    description: 'Dedicated operations base for up to 2 Attack Helicopters. +3 production per turn.',
    techRequired: 'helicopter-warfare',
    pacing: { band: 'power-spike', role: 'air-military-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 },
  },
  missile_silo: {
    id: 'missile_silo', name: 'Missile Silo', category: 'military',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 215,
    // #545: +1 arsenal capacity already wired in MR1's ARSENAL_CAPACITY_SOURCES.
    // strategicLaunchPlatform is new this MR -- fixed, unlimited-range, discoverable
    // location (spec §3's "Reach" role; redundancy comes from building more than one).
    description: 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity. Once your empire has a warhead, this silo can launch it at any discovered city you\'re at war with, at unlimited range.',
    techRequired: 'icbm-development',
    pacing: { band: 'power-spike', role: 'strategic-deterrent', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.2, situationality: 1.2, unlockBreadth: 1 },
    strategicLaunchPlatform: { range: 'unlimited' },
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
  // #992: the "launch" stage of the First Satellite world race
  // (world-race-definitions.ts). A milestone NP -- see game-balance.md's
  // "Milestone National Projects" -- so it never expires and carries no
  // civYieldBonus/cityYieldBonus of its own; the race's one-time winner
  // reward is applied directly by world-race-system.ts at the moment a
  // winner is decided, not as an ongoing yield. requiresBuildings gates it on
  // space_program_initiative (the existing era-10 rocketry national project)
  // already being built -- reusing that building as the race's "component"
  // stage instead of inventing a parallel one. resourceRequired makes
  // blockading/denying aluminum a real, already-generic counterplay lever.
  first_satellite_launch: {
    id: 'first_satellite_launch', name: 'First Satellite Launch', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 380,
    description: 'A committed attempt to place the world\'s first satellite into orbit. Whichever civilization completes this first wins the race; every other in-progress attempt is stood down with a partial refund.',
    techRequired: 'space-exploration',
    requiresBuildings: ['space_program_initiative'],
    resourceRequired: ['aluminum'],
    pacing: { band: 'marquee', role: 'world-race', impact: 1.6, scope: 'empire', snowball: 1.3, urgency: 1.4, situationality: 1.4, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 11, milestone: true },
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
    description: 'Autonomous logistics yields +1 gold per active trade route empire-wide. Coastal cities only.',
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
    description: 'Blocks adjacent cyber-unit gold drains (65%, +10% with Signals Hub). Reduces enemy spy mission success in this city.',
    techRequired: 'internet',
  },

  data_center: {
    id: 'data_center', name: 'Data Center', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 3 },
    productionCost: 200,
    description: 'High-performance computing cluster. Requires a Semiconductor Fab.',
    techRequired: 'cloud-computing',
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
    description: 'The only facility capable of training and basing up to 2 Stealth Bombers. Requires Stealth Technology research.',
    techRequired: 'stealth-technology',
  },

  telemedicine_hub: {
    id: 'telemedicine_hub', name: 'Telemedicine Hub', category: 'food',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 180,
    description: 'Remote medical care. With Telemedicine tech, friendly units within 3 hexes of this city heal +1 extra HP per turn.',
    techRequired: 'telemedicine',
  },

  /* === ERA 12 NATIONAL PROJECTS === */
  // MR11: era-12 civs previously had zero national projects to start (era-11 NPs fade
  // by era 13). All three: single yield type, civYieldBonus total 6 <= 9 (era 7+ ceiling),
  // no cityYieldBonus, uniquePerEmpire, homeEra 12.
  planetary_data_grid: {
    id: 'planetary_data_grid', name: 'Planetary Data Grid', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 6 }, productionCost: 320,
    description: 'Unified global research network. +6 science empire-wide.',
    techRequired: 'network-governance',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 12 },
    civYieldBonus: { science: 6 },
  },
  global_logistics_network: {
    id: 'global_logistics_network', name: 'Global Logistics Network', category: 'economy',
    yields: { food: 0, production: 0, gold: 6, science: 0 }, productionCost: 320,
    description: 'Automated worldwide freight coordination. +6 gold empire-wide.',
    techRequired: 'globalization',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 12 },
    civYieldBonus: { gold: 6 },
  },
  orbital_fabrication_program: {
    id: 'orbital_fabrication_program', name: 'Orbital Fabrication Program', category: 'production',
    yields: { food: 0, production: 6, gold: 0, science: 0 }, productionCost: 320,
    description: 'Zero-gravity manufacturing initiative. +6 production empire-wide.',
    techRequired: 'private-spaceflight',
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 12 },
    civYieldBonus: { production: 6 },
  },

  /* === ERA 13 BUILDINGS AND NATIONAL PROJECTS === */
  network_operations_center: { id: 'network_operations_center', name: 'Network Operations Center', category: 'science', yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 224, description: 'Coordinates empire networks. Capacity follows the diminishing empire rule.', techRequired: 'general-purpose-ai', pacing: { band: 'infrastructure', role: 'network-capacity', impact: 1.2, scope: 'empire', snowball: 1.2, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  ai_safety_institute: { id: 'ai_safety_institute', name: 'AI Safety Institute', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 196, description: '+2 science and +1 Network Capacity for your empire.', techRequired: 'algorithmic-accountability', pacing: { band: 'specialist', role: 'network-defense', impact: 1.2, scope: 'empire', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  drone_fabricator: { id: 'drone_fabricator', name: 'Drone Fabricator', category: 'production', yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 336, description: 'Builds and coordinates autonomous drones.', techRequired: 'autonomous-weapons-systems', pacing: { band: 'marquee', role: 'drone-enabler', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  electronic_warfare_array: { id: 'electronic_warfare_array', name: 'Electronic Warfare Array', category: 'military', yields: { food: 0, production: 1, gold: 0, science: 1 }, productionCost: 224, description: '+1 production and +1 science.', techRequired: 'adversarial-ai', pacing: { band: 'infrastructure', role: 'network-counter', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  civic_media_forum: { id: 'civic_media_forum', name: 'Civic Media Forum', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 196, description: '+1 gold and +1 science.', techRequired: 'digital-democracy', pacing: { band: 'core', role: 'civic-defense', impact: 1.15, scope: 'city', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 } },
  vertical_farm: { id: 'vertical_farm', name: 'Vertical Farm', category: 'food', yields: { food: 4, production: 0, gold: 0, science: 0 }, productionCost: 196, description: '+4 food. Closed-Loop Food Systems adds another +1 food.', techRequired: 'vertical-agriculture', pacing: { band: 'core', role: 'late-food', impact: 1.2, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1, unlockBreadth: 1 } },
  neural_rehabilitation_center: { id: 'neural_rehabilitation_center', name: 'Neural Rehabilitation Center', category: 'food', yields: { food: 1, production: 0, gold: 0, science: 2 }, productionCost: 224, description: 'Nearby units heal +5 HP per owner turn from Precision Gene Editing.', techRequired: 'precision-gene-editing', pacing: { band: 'infrastructure', role: 'unit-recovery', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 } },
  ocean_robotics_yard: { id: 'ocean_robotics_yard', name: 'Ocean Robotics Yard', category: 'production', yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 336, description: 'Coastal autonomous-vessel construction yard.', techRequired: 'ocean-robotics', coastalRequired: true, pacing: { band: 'marquee', role: 'autonomous-naval', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.25, unlockBreadth: 1 } },
  circular_fabricator: { id: 'circular_fabricator', name: 'Circular Fabricator', category: 'production', yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 224, description: 'Supplies one missing local advanced-material soft advantage for the active item.', techRequired: 'programmable-materials', pacing: { band: 'infrastructure', role: 'material-substitution', impact: 1.2, scope: 'city', snowball: 1.15, urgency: 1, situationality: 1.2, unlockBreadth: 1 } },
  modular_arcology: { id: 'modular_arcology', name: 'Modular Arcology', category: 'food', yields: { food: 2, production: 2, gold: 0, science: 0 }, productionCost: 336, description: 'Dense modular housing and production. Requires a Transplant Hospital and Factory.', techRequired: 'modular-arcologies', requiresBuildings: ['transplant_hospital', 'factory'], pacing: { band: 'marquee', role: 'dense-city', impact: 1.35, scope: 'city', snowball: 1.2, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  carbon_capture_grid: { id: 'carbon_capture_grid', name: 'Carbon Capture Grid', category: 'production', yields: { food: 2, production: 2, gold: 0, science: 0 }, productionCost: 224, description: 'Restorative industrial infrastructure. Requires a Factory and Environmental Agency.', techRequired: 'carbon-negative-infrastructure', requiresBuildings: ['factory', 'environmental_agency'], pacing: { band: 'infrastructure', role: 'restorative-industry', impact: 1.2, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  immersive_arts_lab: { id: 'immersive_arts_lab', name: 'Immersive Arts Lab', category: 'culture', yields: { food: 0, production: 0, gold: 3, science: 1 }, happiness: 1, productionCost: 196, description: 'Interactive arts studio. +3 gold, +1 science, and +1 happiness; Immersive Worlds adds another +1 science.', techRequired: 'co-creative-arts', pacing: { band: 'specialist', role: 'culture-science', impact: 1.15, scope: 'city', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  national_ai_assurance_program: { id: 'national_ai_assurance_program', name: 'National AI Assurance Program', category: 'science', yields: { food: 0, production: 0, gold: 0, science: 6 }, productionCost: 392, description: 'A temporary empire-wide +6 science program with +2 Network Capacity.', techRequired: 'algorithmic-accountability', uniquePerEmpire: true, nationalProject: { homeEra: 13 }, civYieldBonus: { science: 6 }, pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  circular_manufacturing_network: { id: 'circular_manufacturing_network', name: 'Circular Manufacturing Network', category: 'production', yields: { food: 0, production: 6, gold: 0, science: 0 }, productionCost: 392, description: 'A temporary empire-wide production program. Choose one advanced material substitution when completed.', techRequired: 'molecular-fabrication', uniquePerEmpire: true, nationalProject: { homeEra: 13 }, civYieldBonus: { production: 6 }, pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  mars_robotics_initiative: { id: 'mars_robotics_initiative', name: 'Mars Robotics Initiative', category: 'science', yields: { food: 0, production: 0, gold: 3, science: 3 }, productionCost: 392, description: 'A temporary empire-wide +3 gold and +3 science program.', techRequired: 'mars-mission-architecture', uniquePerEmpire: true, nationalProject: { homeEra: 13 }, civYieldBonus: { gold: 3, science: 3 }, pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  // #986: the "launch" stage of the Interstellar Colony world race (Science Victory) --
  // see world-race-definitions.ts. Reuses mars_robotics_initiative above as its "component"
  // stage rather than inventing a parallel one, mirroring first_satellite_launch's own
  // reuse of space_program_initiative.
  interstellar_launch_program: {
    id: 'interstellar_launch_program', name: 'Interstellar Launch Program', category: 'science',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 400,
    description: 'A committed attempt to establish humanity\'s first permanent extraterrestrial colony. Whichever civilization completes this first wins a Science Victory; every other in-progress attempt is stood down with a partial refund.',
    techRequired: 'mars-mission-architecture',
    requiresBuildings: ['mars_robotics_initiative'],
    resourceRequired: ['uranium'],
    pacing: { band: 'marquee', role: 'world-race', impact: 1.7, scope: 'empire', snowball: 1.3, urgency: 1.5, situationality: 1.4, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 13, milestone: true },
  },
};
