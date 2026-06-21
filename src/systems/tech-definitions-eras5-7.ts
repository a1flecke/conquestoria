import type { Tech } from '@/core/types';

// Relocated stubs — same values as original to preserve existing tests.
// Era fields and prerequisites will be updated when real late-era content lands.
const RELOCATED_STUBS: Tech[] = [
  { id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: ['trade-routes', 'banking'], unlocks: ['Late-era supply chains and wonder distribution requirements'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'nuclear-theory', name: 'Nuclear Theory', track: 'science', cost: 165, prerequisites: ['astronomy', 'medicine'], unlocks: ['Late-era atomic research and wonder prerequisites'], era: 5, countsForEraAdvancement: false },
  { id: 'mass-media', name: 'Mass Media', track: 'communication', cost: 150, prerequisites: ['printing', 'diplomats'], unlocks: ['Global broadcasts and late-era cultural coordination'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 175, prerequisites: ['cryptography', 'counter-intelligence'], unlocks: ['Satellite Surveillance', 'Misinformation Campaign'], era: 5 },
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], unlocksUnits: ['spy_hacker'], era: 5 },
  { id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: ['caravels', 'naval-warfare'], unlocks: [], unlocksUnits: ['troop_transport'], era: 5, countsForEraAdvancement: false },
];

const ERA_5_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'black-powder', name: 'Black Powder', track: 'military', cost: 150,
    prerequisites: ['siege-warfare', 'tactics'],
    unlocks: ['Gunpowder replaces classical siege engines'],
    unlocksUnits: ['cannon'], unlocksBuildings: ['artillery_corps_hq'], era: 5 },
  { id: 'professional-army', name: 'Professional Army', track: 'military', cost: 145,
    prerequisites: ['tactics'],
    unlocks: ['Defending units in cities gain +10% strength'], era: 5 },

  // ECONOMY (2)
  { id: 'guilds', name: 'Guilds', track: 'economy', cost: 150,
    prerequisites: ['banking', 'currency'],
    unlocks: ['+1 gold per active trade route'], unlocksBuildings: ['guildhall'], era: 5 },
  { id: 'colonial-trade', name: 'Colonial Trade', track: 'economy', cost: 145,
    prerequisites: ['trade-routes', 'banking'],
    unlocks: ['Trade routes to foreign civs yield +2 gold'], era: 5 },

  // SCIENCE (2)
  { id: 'scientific-method', name: 'Scientific Method', track: 'science', cost: 155,
    prerequisites: ['astronomy', 'medicine'],
    unlocks: ['+1 science per library empire-wide'], unlocksBuildings: ['university', 'royal_academy'], era: 5 },
  { id: 'optics', name: 'Optics', track: 'science', cost: 150,
    prerequisites: ['astronomy'],
    unlocks: ['+1 vision range all units'], era: 5 },

  // CIVICS (2)
  { id: 'civic-humanism', name: 'Civic Humanism', track: 'civics', cost: 150,
    prerequisites: ['political-philosophy', 'drama-poetry'],
    unlocks: ['+5% gold empire-wide'], era: 5 },
  { id: 'constitutional-law', name: 'Constitutional Law', track: 'civics', cost: 145,
    prerequisites: ['political-philosophy'],
    unlocks: ['Reduces unrest in newly captured cities'], era: 5 },

  // EXPLORATION (2)
  { id: 'circumnavigation', name: 'Circumnavigation', track: 'exploration', cost: 155,
    prerequisites: ['exploration-tech', 'celestial-navigation'],
    unlocks: ['Scouts reveal uncharted continents faster'],
    unlocksBuildings: ['explorers_guild'], era: 5 },
  { id: 'colonial-charter', name: 'Colonial Charter', track: 'exploration', cost: 150,
    prerequisites: ['exploration-tech', 'military-logistics'],
    unlocks: ['Settlers founding cities on foreign landmasses receive +5 production bonus'], era: 5 },

  // AGRICULTURE (2)
  { id: 'plantation-farming', name: 'Plantation Farming', track: 'agriculture', cost: 145,
    prerequisites: ['agricultural-science', 'irrigation'],
    unlocks: ['Farms yield +1 food'], era: 5 },
  { id: 'distillation', name: 'Distillation', track: 'agriculture', cost: 140,
    prerequisites: ['pottery'],
    unlocks: ['+2 gold from luxury resources'], unlocksBuildings: ['distillery'], era: 5 },

  // MEDICINE (2)
  { id: 'advanced-anatomy', name: 'Advanced Anatomy', track: 'medicine', cost: 145,
    prerequisites: ['anatomy', 'surgery'],
    unlocks: ['Units heal +1 HP faster when idle in friendly territory'], era: 5 },
  { id: 'herbalist-guilds', name: 'Herbalist Guilds', track: 'medicine', cost: 140,
    prerequisites: ['herbalism'],
    unlocks: ['Enables Apothecary House chain building'], unlocksBuildings: ['apothecary_house'], era: 5 },

  // PHILOSOPHY (2)
  { id: 'empiricism', name: 'Empiricism', track: 'philosophy', cost: 145,
    prerequisites: ['natural-philosophy'],
    unlocks: ['+1 science all cities'], era: 5 },
  { id: 'rationalism', name: 'Rationalism', track: 'philosophy', cost: 150,
    prerequisites: ['humanism'],
    unlocks: ['+5% science empire-wide'], era: 5 },

  // ARTS (2)
  { id: 'renaissance-painting', name: 'Renaissance Painting', track: 'arts', cost: 145,
    prerequisites: ['theater'],
    unlocks: ['+1 gold per culture building empire-wide'], unlocksBuildings: ['art_gallery'], era: 5 },
  { id: 'classical-music-form', name: 'Classical Music Form', track: 'arts', cost: 150,
    prerequisites: ['theater'],
    unlocks: ['+1 science per culture building empire-wide'], era: 5 },

  // MARITIME (2)
  { id: 'deep-sea-routes', name: 'Deep-Sea Routes', track: 'maritime', cost: 150,
    prerequisites: ['caravels'],
    unlocks: ['+1 gold per coastal city; naval trade reaches foreign continents'], unlocksBuildings: ['harbour_exchange'], era: 5 },
  { id: 'naval-gunnery', name: 'Naval Gunnery', track: 'maritime', cost: 155,
    prerequisites: ['naval-warfare'],
    unlocks: ['Naval combat units gain +5 strength'], era: 5 },

  // METALLURGY (2)
  { id: 'blast-furnace-tech', name: 'Blast Furnace', track: 'metallurgy', cost: 150,
    prerequisites: ['steel-forging'],
    unlocks: ['+1 production all cities'], unlocksBuildings: ['blast_furnace'], era: 5 },
  { id: 'cannon-casting', name: 'Cannon Casting', track: 'metallurgy', cost: 155,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Cannon production cost reduced by 15%'], era: 5 },

  // CONSTRUCTION (2)
  { id: 'renaissance-architecture', name: 'Renaissance Architecture', track: 'construction', cost: 145,
    prerequisites: ['engineering', 'arches'],
    unlocks: ['+2 production in cities containing a wonder'], era: 5 },
  { id: 'vaulted-ceilings', name: 'Vaulted Ceilings', track: 'construction', cost: 150,
    prerequisites: ['arches'],
    unlocks: ['All building costs reduced by 10%'], era: 5 },

  // COMMUNICATION (2)
  { id: 'printing-press', name: 'Printing Press', track: 'communication', cost: 150,
    prerequisites: ['writing', 'printing'],
    unlocks: ['+1 science per library empire-wide'], era: 5 },
  { id: 'postal-service', name: 'Postal Service', track: 'communication', cost: 145,
    prerequisites: ['road-building'],
    unlocks: ['+1 gold per road tile in empire'], era: 5 },

  // ESPIONAGE (2)
  { id: 'black-chambers', name: 'Black Chambers', track: 'espionage', cost: 155,
    prerequisites: ['cryptography', 'counter-intelligence'],
    unlocks: ['+1 spy slot empire-wide'], era: 5 },
  { id: 'diplomatic-networks', name: 'Diplomatic Networks', track: 'espionage', cost: 150,
    prerequisites: ['counter-intelligence'],
    unlocks: ['Spy missions in foreign capitals have +20% success rate'], era: 5 },

  // SPIRITUALITY (2)
  { id: 'reformation', name: 'Reformation', track: 'spirituality', cost: 145,
    prerequisites: ['theology-tech', 'pilgrimages'],
    unlocks: ['+2 science in cities with a temple'], era: 5 },
  { id: 'monastic-orders', name: 'Monastic Orders', track: 'spirituality', cost: 150,
    prerequisites: ['theology-tech'],
    unlocks: ['+1 science and +1 gold per city with temple'], unlocksBuildings: ['monastery'], era: 5 },
];

const ERA_6_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'rifle-tactics', name: 'Rifle Tactics', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'professional-army'],
    unlocks: ['Musketeer-class units replaced by riflemen'], era: 6 },
  { id: 'grenade-warfare', name: 'Grenade Warfare', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'military-logistics'],
    unlocks: ['Grenadier unlocked — anti-fortification specialist'], unlocksUnits: ['grenadier'], era: 6 },

  // ECONOMY (2)
  { id: 'joint-stock-companies', name: 'Joint-Stock Companies', track: 'economy', cost: 185,
    prerequisites: ['guilds', 'colonial-trade'],
    unlocks: ['Stock Exchange unlocked'], unlocksBuildings: ['stock_exchange'], era: 6 },
  { id: 'mercantilism', name: 'Mercantilism', track: 'economy', cost: 180,
    prerequisites: ['colonial-trade', 'banking'],
    unlocks: ['Trade route capacity +1; +5% gold empire-wide'], era: 6 },

  // SCIENCE (2)
  { id: 'natural-history', name: 'Natural History', track: 'science', cost: 185,
    prerequisites: ['scientific-method', 'optics'],
    unlocks: ['+2 science per natural wonder in empire territory'], unlocksBuildings: ['natural_history_museum'], era: 6 },
  { id: 'hydraulics', name: 'Hydraulics', track: 'science', cost: 180,
    prerequisites: ['scientific-method', 'irrigation'],
    unlocks: ['+2 production in river cities'], era: 6 },

  // CIVICS (2)
  { id: 'separation-of-powers', name: 'Separation of Powers', track: 'civics', cost: 185,
    prerequisites: ['constitutional-law'],
    unlocks: ['+1 gold per era-appropriate building empire-wide'], era: 6 },
  { id: 'parliamentary-reform', name: 'Parliamentary Reform', track: 'civics', cost: 180,
    prerequisites: ['civic-humanism', 'constitutional-law'],
    unlocks: ['+5% production empire-wide'], era: 6 },

  // EXPLORATION (2)
  { id: 'land-survey', name: 'Land Survey', track: 'exploration', cost: 185,
    prerequisites: ['colonial-charter', 'renaissance-architecture'],
    unlocks: ['+1 tile yield in settled frontier cities'], era: 6 },
  { id: 'colonial-administration', name: 'Colonial Administration Tech', track: 'exploration', cost: 180,
    prerequisites: ['colonial-charter', 'mercantilism'],
    unlocks: ['Colonial Administration national project available'], era: 6 },

  // AGRICULTURE (2)
  { id: 'improved-agriculture', name: 'Improved Agriculture', track: 'agriculture', cost: 180,
    prerequisites: ['plantation-farming'],
    unlocks: ['Farms yield +1 food; granaries add +1 food'], era: 6 },
  { id: 'tobacco-trade', name: 'Tobacco Trade', track: 'agriculture', cost: 185,
    prerequisites: ['distillation', 'colonial-trade'],
    unlocks: ['+2 gold per plantation improvement'], era: 6 },

  // MEDICINE (2)
  { id: 'surgical-school', name: 'Surgical School', track: 'medicine', cost: 185,
    prerequisites: ['anatomy'],
    unlocks: ['Units in cities heal 2 additional HP per turn'], unlocksBuildings: ['surgery_guild'], era: 6 },
  { id: 'epidemic-control', name: 'Epidemic Control', track: 'medicine', cost: 180,
    prerequisites: ['herbalist-guilds'],
    unlocks: ['City population loss from famine halved'], era: 6 },

  // PHILOSOPHY (2)
  { id: 'enlightenment', name: 'Enlightenment', track: 'philosophy', cost: 185,
    prerequisites: ['empiricism', 'rationalism'],
    unlocks: ['+1 science per two population in cities'], era: 6 },
  { id: 'social-contract', name: 'Social Contract', track: 'philosophy', cost: 180,
    prerequisites: ['rationalism', 'civic-humanism'],
    unlocks: ['+2 gold per city with a market'], era: 6 },

  // ARTS (2)
  { id: 'baroque-music', name: 'Baroque Music', track: 'arts', cost: 185,
    prerequisites: ['classical-music-form'],
    unlocks: ['+1 gold per culture building; morale bonus'], unlocksBuildings: ['concert_hall'], era: 6 },
  { id: 'portrait-art', name: 'Portrait Art', track: 'arts', cost: 180,
    prerequisites: ['renaissance-painting'],
    unlocks: ['+1 gold per art gallery in empire'], era: 6 },

  // MARITIME (2)
  { id: 'trade-winds', name: 'Trade Winds', track: 'maritime', cost: 185,
    prerequisites: ['deep-sea-routes', 'circumnavigation'],
    unlocks: ['Naval units gain +1 movement'], era: 6 },
  { id: 'frigate-construction', name: 'Frigate Construction', track: 'maritime', cost: 180,
    prerequisites: ['naval-gunnery'],
    unlocks: ['Frigate unlocked — fast armed escort'], era: 6 },

  // METALLURGY (2)
  { id: 'precision-casting', name: 'Precision Casting', track: 'metallurgy', cost: 185,
    prerequisites: ['cannon-casting'],
    unlocks: ['Cannon units gain +5 strength; cannon cost -10%'], era: 6 },
  { id: 'steel-plate-armor', name: 'Steel Plate Armor', track: 'metallurgy', cost: 180,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Land melee units gain +3 defense strength'], era: 6 },

  // CONSTRUCTION (2)
  { id: 'fortification-engineering', name: 'Fortification Engineering', track: 'construction', cost: 185,
    prerequisites: ['renaissance-architecture'],
    unlocks: ['Walls provide +5 defense strength to garrison'], unlocksBuildings: ['star_fort'], era: 6 },
  { id: 'aqueduct-expansion', name: 'Aqueduct Expansion', track: 'construction', cost: 180,
    prerequisites: ['vaulted-ceilings', 'hydraulics'],
    unlocks: ['+2 food in all cities with aqueduct'], era: 6 },

  // COMMUNICATION (2)
  { id: 'newspaper-press', name: 'Newspaper Press', track: 'communication', cost: 185,
    prerequisites: ['printing-press', 'postal-service'],
    unlocks: ['+2 science empire-wide; reduces unhappiness from war'], era: 6 },
  { id: 'courier-network', name: 'Courier Network', track: 'communication', cost: 180,
    prerequisites: ['postal-service'],
    unlocks: ['+1 gold per road connection between your cities'], era: 6 },

  // ESPIONAGE (2)
  { id: 'counter-espionage', name: 'Counter-Espionage', track: 'espionage', cost: 185,
    prerequisites: ['black-chambers'],
    unlocks: ['-25% chance enemy spies succeed against your cities'], era: 6 },
  { id: 'propaganda', name: 'Propaganda', track: 'espionage', cost: 180,
    prerequisites: ['diplomatic-networks'],
    unlocks: ['Spy missions to flip loyalties available in foreign cities'], era: 6 },

  // SPIRITUALITY (2)
  { id: 'ecumenical-council', name: 'Ecumenical Council', track: 'spirituality', cost: 185,
    prerequisites: ['reformation'],
    unlocks: ['+2 gold per city with a temple empire-wide'], era: 6 },
  { id: 'missionary-zeal', name: 'Missionary Zeal', track: 'spirituality', cost: 180,
    prerequisites: ['monastic-orders'],
    unlocks: ['Missionaries spread religion to conquered cities faster'], era: 6 },
];

export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
  ...ERA_6_TECHS,
];
