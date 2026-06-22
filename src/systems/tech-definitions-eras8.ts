import type { Tech } from '@/core/types';

const ERA_8_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'mass-firepower', name: 'Mass Firepower', track: 'military', cost: 240,
    prerequisites: ['rifled-infantry', 'mass-mobilization'],
    unlocks: ['Machine gunners provide concentrated suppressive fire'],
    unlocksUnits: ['machine_gunner'], era: 8 },
  { id: 'general-mobilization', name: 'General Mobilization', track: 'military', cost: 235,
    prerequisites: ['mass-mobilization'],
    unlocks: ['All cities train military units 15% faster'],
    unlocksBuildings: ['imperial_general_staff'], era: 8 },

  // ECONOMY (2)
  { id: 'finance-capitalism', name: 'Finance Capitalism', track: 'economy', cost: 245,
    prerequisites: ['mass-production', 'steam-power'],
    unlocks: ['Trade route gold +25% empire-wide'], era: 8 },
  { id: 'industrial-monopoly', name: 'Industrial Monopoly', track: 'economy', cost: 240,
    prerequisites: ['mass-production'],
    unlocks: ['+2 gold per city with a market building'],
    unlocksBuildings: ['stock_exchange_tower'], era: 8 },

  // SCIENCE (2)
  { id: 'germ-biology', name: 'Germ Biology', track: 'science', cost: 240,
    prerequisites: ['germ-theory', 'applied-chemistry'],
    unlocks: ['Germ culture techniques unlock disease treatments; units heal faster in cities with medical buildings'],
    unlocksBuildings: ['bacteriology_lab'], era: 8 },
  { id: 'engineering-exhibition', name: 'Engineering Exhibition', track: 'science', cost: 235,
    prerequisites: ['industrialization', 'urban-planning'],
    unlocks: ['International industrial exhibitions showcase national achievements; +1 science empire-wide'],
    unlocksBuildings: ['exhibition_hall', 'world_fair'], era: 8 },

  // CIVICS (2)
  { id: 'labor-rights', name: 'Labor Rights', track: 'civics', cost: 235,
    prerequisites: ['social-reform', 'nationalism'],
    unlocks: ['Workers\' rights reduce unrest; +1 happiness in all cities with a marketplace'],
    unlocksBuildings: ['labor_hall'], era: 8 },
  { id: 'public-records', name: 'Public Records', track: 'civics', cost: 240,
    prerequisites: ['nationalism', 'popular-press'],
    unlocks: ['+1 science empire-wide from improved state documentation and civic transparency'],
    unlocksBuildings: ['national_archives_building'], era: 8 },

  // EXPLORATION (2)
  { id: 'transcontinental-rail', name: 'Transcontinental Rail', track: 'exploration', cost: 245,
    prerequisites: ['colonial-railways', 'railway-expansion'],
    unlocks: ['Continental railway networks halve travel time between cities; +2 gold per rail connection'], era: 8 },
  { id: 'imperial-survey', name: 'Imperial Survey', track: 'exploration', cost: 240,
    prerequisites: ['manifest-destiny', 'electric-telegraph'],
    unlocks: ['Systematic mapping of imperial territory; scouts reveal terrain faster; +1 vision range scouts'], era: 8 },

  // AGRICULTURE (2)
  { id: 'refrigeration', name: 'Refrigeration', track: 'agriculture', cost: 235,
    prerequisites: ['agricultural-machinery'],
    unlocks: ['+2 food per city; food spoilage events eliminated empire-wide'], era: 8 },
  { id: 'scientific-breeding', name: 'Scientific Breeding', track: 'agriculture', cost: 240,
    prerequisites: ['agricultural-machinery', 'mechanized-farming'],
    unlocks: ['+1 food per farm improvement; granary food bonus doubled'], era: 8 },

  // MEDICINE (2)
  { id: 'antiseptic-surgery', name: 'Antiseptic Surgery', track: 'medicine', cost: 240,
    prerequisites: ['field-hospitals', 'germ-biology'],
    unlocks: ['Units in friendly cities heal +3 HP per turn; surgical mortality rates drop'], era: 8 },
  { id: 'public-health-service', name: 'Public Health Service', track: 'medicine', cost: 245,
    prerequisites: ['germ-theory', 'germ-biology'],
    unlocks: ['All cities immune to population-loss plague events; disease spread between cities halved'],
    unlocksBuildings: ['sanatorium'], era: 8 },

  // PHILOSOPHY (2)
  { id: 'dialectical-materialism', name: 'Dialectical Materialism', track: 'philosophy', cost: 240,
    prerequisites: ['positivism', 'utilitarianism'],
    unlocks: ['+2 science in cities with a library; empirical framework advances research'], era: 8 },
  { id: 'pragmatism', name: 'Pragmatism', track: 'philosophy', cost: 235,
    prerequisites: ['positivism'],
    unlocks: ['+5% all city yields; practical philosophy optimizes civic and economic output'], era: 8 },

  // ARTS (2)
  { id: 'impressionism', name: 'Impressionism', track: 'arts', cost: 235,
    prerequisites: ['industrial-realism', 'romanticism'],
    unlocks: ['+1 gold per culture building empire-wide; culture buildings grant +1 science each'], era: 8 },
  { id: 'grand-opera', name: 'Grand Opera', track: 'arts', cost: 240,
    prerequisites: ['industrial-realism'],
    unlocks: ['+2 gold empire-wide; grand opera spreads cultural prestige across borders'],
    unlocksBuildings: ['opera_house'], era: 8 },

  // MARITIME (2)
  { id: 'naval-armor', name: 'Naval Armor', track: 'maritime', cost: 250,
    prerequisites: ['ironclad-warships', 'steam-navigation'],
    unlocks: ['Naval units +5 strength; armored warships dominate coastal waters'],
    unlocksUnits: ['pre_dreadnought'], era: 8 },
  { id: 'torpedo-warfare', name: 'Torpedo Warfare', track: 'maritime', cost: 245,
    prerequisites: ['steam-navigation'],
    unlocks: ['Naval ranged units +8 strength; coastal cities gain +5 defense bonus against naval assault'], era: 8 },

  // METALLURGY (2)
  { id: 'bessemer-steel', name: 'Bessemer Steel', track: 'metallurgy', cost: 255,
    prerequisites: ['steel-production', 'railway-expansion'],
    unlocks: ['+2 production all cities with blast furnace; Bessemer process revolutionizes steel output'],
    unlocksBuildings: ['steel_foundry'], era: 8 },
  { id: 'structural-engineering', name: 'Structural Engineering', track: 'metallurgy', cost: 245,
    prerequisites: ['railway-expansion', 'urban-planning'],
    unlocks: ['+1 production per construction building in cities; structural iron enables modern architecture'],
    unlocksBuildings: ['power_station'], era: 8 },

  // CONSTRUCTION (2)
  { id: 'reinforced-concrete', name: 'Reinforced Concrete', track: 'construction', cost: 250,
    prerequisites: ['urban-planning', 'structural-engineering'],
    unlocks: ['+2 production in cities with 4 or more buildings; iron-reinforced concrete enables taller urban structures'], era: 8 },
  { id: 'sanitation-networks', name: 'Sanitation Networks', track: 'construction', cost: 240,
    prerequisites: ['iron-bridges', 'urban-planning'],
    unlocks: ['+1 food all cities; municipal water and sewage systems transform urban health'], era: 8 },

  // COMMUNICATION (2)
  { id: 'telephony', name: 'Telephony', track: 'communication', cost: 240,
    prerequisites: ['electric-telegraph', 'popular-press'],
    unlocks: ['Voice communication over wire; diplomatic exchanges faster; intelligence networks gain wider reach'],
    unlocksBuildings: ['telephone_exchange'], era: 8 },
  { id: 'shorthand-press', name: 'Shorthand Press', track: 'communication', cost: 235,
    prerequisites: ['popular-press'],
    unlocks: ['+1 science and +1 gold per city; high-speed printing saturates markets with information'], era: 8 },

  // ESPIONAGE (2)
  { id: 'political-intelligence', name: 'Political Intelligence', track: 'espionage', cost: 240,
    prerequisites: ['covert-operations', 'secret-police'],
    unlocks: ['+3 spy slots empire-wide; political intelligence networks improve spy mission success rates by 10%'], era: 8 },
  { id: 'disinformation-bureau', name: 'Disinformation Bureau', track: 'espionage', cost: 235,
    prerequisites: ['secret-police'],
    unlocks: ['Enemy spy missions in your cities have -25% success rate; state disinformation weakens foreign loyalty'], era: 8 },

  // SPIRITUALITY (2)
  { id: 'modernist-theology', name: 'Modernist Theology', track: 'spirituality', cost: 235,
    prerequisites: ['secularism', 'social-gospel'],
    unlocks: ['+2 science in cities with a temple or monastery; faith and reason reconciled'], era: 8 },
  { id: 'social-justice', name: 'Social Justice', track: 'spirituality', cost: 240,
    prerequisites: ['social-gospel'],
    unlocks: ['+1 food and +1 gold per city with any religion building; social gospel drives communal welfare'], era: 8 },
];

export const TECH_TREE_ERAS_8: Tech[] = [
  ...ERA_8_TECHS,
];
