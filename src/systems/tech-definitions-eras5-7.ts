import type { Tech } from '@/core/types';

// Relocated stub — same values as original to preserve existing tests.
// MR10 re-homed global-logistics/nuclear-theory/mass-media/digital-surveillance to the
// eras their names actually belong to (see tech-definitions-eras8/9/10.ts) now that
// nothing depends on them as legendary-wonder gates. amphibious-warfare stays era 5 —
// troop_transport timing there is deliberate.
const RELOCATED_STUBS: Tech[] = [
  { id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: ['caravels', 'naval-warfare'], unlocks: [], unlocksUnits: ['troop_transport'], era: 5, countsForEraAdvancement: false },
];

const ERA_5_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'black-powder', name: 'Black Powder', track: 'military', cost: 150,
    prerequisites: ['siege-warfare', 'tactics'],
    unlocks: ['Gunpowder replaces classical siege engines and arms line infantry'],
    unlocksUnits: ['cannon', 'musketeer'], unlocksBuildings: ['artillery_corps_hq'], era: 5 },
  { id: 'professional-army', name: 'Professional Army', track: 'military', cost: 90,
    prerequisites: ['tactics'],
    unlocks: ['Defending units in cities gain +10% strength'], era: 5 },

  // ECONOMY (2)
  { id: 'guilds', name: 'Guilds', track: 'economy', cost: 125,
    prerequisites: ['banking', 'currency'],
    unlocks: ['+1 gold per active trade route'], unlocksBuildings: ['guildhall'], era: 5 },
  // Trade Routes Overhaul (#553): cost raised 100 -> 185 because adding unlocksUnits
  // forces this tech's pacing band to 'marquee' (resolveEraRelativeCostBand in
  // pacing-model.ts), which raises its target research window to 10-16 turns; at cost
  // 100 it resolved in 8 turns, tripping the pacing-audit outlier gate. 185 lands at the
  // window midpoint. See game-balance.md's Pacing Regression Prevention rule.
  { id: 'colonial-trade', name: 'Colonial Trade', track: 'economy', cost: 185,
    prerequisites: ['trade-routes', 'banking'],
    unlocks: ['Trade routes to foreign civs yield +2 gold'], unlocksUnits: ['naval_trader'], era: 5 },

  // SCIENCE (2)
  { id: 'scientific-method', name: 'Scientific Method', track: 'science', cost: 155,
    prerequisites: ['astronomy', 'medicine'],
    unlocks: ['+1 science per library empire-wide'], unlocksBuildings: ['university', 'royal_academy'], era: 5 },
  { id: 'optics', name: 'Optics', track: 'science', cost: 90,
    prerequisites: ['astronomy'],
    unlocks: ['+1 vision range all units'], era: 5 },

  // CIVICS (2)
  { id: 'civic-humanism', name: 'Civic Humanism', track: 'civics', cost: 125,
    prerequisites: ['political-philosophy', 'drama-poetry'],
    unlocks: ['+5% gold empire-wide'], era: 5 },
  { id: 'constitutional-law', name: 'Constitutional Law', track: 'civics', cost: 100,
    prerequisites: ['political-philosophy'],
    unlocks: ['Reduces unrest in newly captured cities'], era: 5 },

  // EXPLORATION (2)
  { id: 'circumnavigation', name: 'Circumnavigation', track: 'exploration', cost: 155,
    prerequisites: ['exploration-tech', 'celestial-navigation'],
    unlocks: ['Scouts reveal uncharted continents faster'],
    unlocksBuildings: ['explorers_guild'], era: 5 },
  { id: 'colonial-charter', name: 'Colonial Charter', track: 'exploration', cost: 125,
    prerequisites: ['exploration-tech', 'military-logistics'],
    unlocks: ['Settlers founding cities on foreign landmasses receive +5 production bonus'], era: 5 },

  // AGRICULTURE (2)
  { id: 'plantation-farming', name: 'Plantation Farming', track: 'agriculture', cost: 100,
    prerequisites: ['agricultural-science', 'irrigation'],
    unlocks: ['Farms yield +1 food'], era: 5 },
  { id: 'distillation', name: 'Distillation', track: 'agriculture', cost: 55,
    prerequisites: ['pottery'],
    unlocks: ['+2 gold from luxury resources'], unlocksBuildings: ['distillery'], era: 5 },

  // MEDICINE (2)
  { id: 'advanced-anatomy', name: 'Advanced Anatomy', track: 'medicine', cost: 90,
    prerequisites: ['anatomy', 'surgery'],
    unlocks: ['Units heal +1 HP faster when idle in friendly territory'], era: 5 },
  { id: 'herbalist-guilds', name: 'Herbalist Guilds', track: 'medicine', cost: 50,
    prerequisites: ['herbalism'],
    unlocks: ['Enables Apothecary House chain building'], unlocksBuildings: ['apothecary_house'], era: 5 },

  // PHILOSOPHY (2)
  { id: 'empiricism', name: 'Empiricism', track: 'philosophy', cost: 100,
    prerequisites: ['natural-philosophy'],
    unlocks: ['+1 science all cities'], era: 5 },
  { id: 'rationalism', name: 'Rationalism', track: 'philosophy', cost: 100,
    prerequisites: ['humanism'],
    unlocks: ['+5% science empire-wide'], era: 5 },

  // ARTS (2)
  { id: 'renaissance-painting', name: 'Renaissance Painting', track: 'arts', cost: 100,
    prerequisites: ['theater'],
    unlocks: ['+1 gold per culture building empire-wide'], unlocksBuildings: ['art_gallery'], era: 5 },
  { id: 'classical-music-form', name: 'Classical Music Form', track: 'arts', cost: 50,
    prerequisites: ['theater'],
    unlocks: ['+1 science per culture building empire-wide'], era: 5 },

  // MARITIME (2)
  { id: 'deep-sea-routes', name: 'Deep-Sea Routes', track: 'maritime', cost: 100,
    prerequisites: ['caravels'],
    unlocks: ['+1 gold per coastal city; naval trade reaches foreign continents'], unlocksBuildings: ['harbour_exchange'], era: 5 },
  { id: 'naval-gunnery', name: 'Naval Gunnery', track: 'maritime', cost: 90,
    prerequisites: ['naval-warfare'],
    unlocks: ['Naval combat units gain +5 strength'], era: 5 },

  // METALLURGY (2)
  { id: 'blast-furnace-tech', name: 'Blast Furnace', track: 'metallurgy', cost: 100,
    prerequisites: ['steel-forging'],
    unlocks: ['+1 production all cities'], unlocksBuildings: ['blast_furnace'], era: 5 },
  { id: 'cannon-casting', name: 'Cannon Casting', track: 'metallurgy', cost: 100,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Cannon production cost reduced by 15%'], era: 5 },

  // CONSTRUCTION (2)
  // MR10: countsForCityMaturity replaces global-logistics/mass-media's role in reaching
  // metropolis at era 5, now that those two stubs moved to eras 8/9.
  { id: 'renaissance-architecture', name: 'Renaissance Architecture', track: 'construction', cost: 100,
    prerequisites: ['engineering', 'arches'],
    unlocks: ['+2 production in cities containing a wonder'], era: 5, countsForCityMaturity: true },
  { id: 'vaulted-ceilings', name: 'Vaulted Ceilings', track: 'construction', cost: 50,
    prerequisites: ['arches'],
    unlocks: ['All building costs reduced by 10%'], era: 5 },

  // COMMUNICATION (2)
  { id: 'printing-press', name: 'Printing Press', track: 'communication', cost: 110,
    prerequisites: ['writing', 'printing'],
    unlocks: ['+1 science per library empire-wide'], era: 5 },
  { id: 'postal-service', name: 'Postal Service', track: 'communication', cost: 100,
    prerequisites: ['road-building'],
    unlocks: ['+1 gold per road tile in your territory (max +10)'], era: 5 },

  // ESPIONAGE (2)
  { id: 'black-chambers', name: 'Black Chambers', track: 'espionage', cost: 155,
    prerequisites: ['cryptography', 'counter-intelligence'],
    unlocks: ['+1 spy slot empire-wide'], era: 5 },
  { id: 'diplomatic-networks', name: 'Diplomatic Networks', track: 'espionage', cost: 100,
    prerequisites: ['counter-intelligence'],
    unlocks: ['Spy missions in foreign capitals have +20% success rate'], era: 5 },

  // SPIRITUALITY (2)
  { id: 'reformation', name: 'Reformation', track: 'spirituality', cost: 100,
    prerequisites: ['theology-tech', 'pilgrimages'],
    unlocks: ['+2 science in cities with a temple'], era: 5 },
  { id: 'monastic-orders', name: 'Monastic Orders', track: 'spirituality', cost: 100,
    prerequisites: ['theology-tech'],
    unlocks: ['+1 science and +1 gold per city with temple'], unlocksBuildings: ['monastery'], era: 5 },
];

const ERA_6_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'rifle-tactics', name: 'Rifle Tactics', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'professional-army'],
    unlocks: ['Musketeer-class units replaced by riflemen'], unlocksBuildings: ['military_academy'], era: 6 },
  { id: 'grenade-warfare', name: 'Grenade Warfare', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'military-logistics'],
    unlocks: ['Grenadier unlocked — anti-fortification specialist'], unlocksUnits: ['grenadier'], era: 6 },

  // ECONOMY (2)
  { id: 'joint-stock-companies', name: 'Joint-Stock Companies', track: 'economy', cost: 185,
    prerequisites: ['guilds', 'colonial-trade'],
    unlocks: ['Stock Exchange unlocked'], unlocksBuildings: ['stock_exchange'], era: 6 },
  { id: 'mercantilism', name: 'Mercantilism', track: 'economy', cost: 120,
    prerequisites: ['colonial-trade', 'banking'],
    unlocks: ['Trade route capacity +1; +5% gold empire-wide'], era: 6 },

  // SCIENCE (2)
  { id: 'natural-history', name: 'Natural History', track: 'science', cost: 185,
    prerequisites: ['scientific-method', 'optics'],
    unlocks: ['+2 science per natural wonder in empire territory'], unlocksBuildings: ['natural_history_museum'], era: 6 },
  { id: 'hydraulics', name: 'Hydraulics', track: 'science', cost: 120,
    prerequisites: ['scientific-method', 'irrigation'],
    unlocks: ['+2 production in river cities'], era: 6 },

  // CIVICS (2)
  { id: 'separation-of-powers', name: 'Separation of Powers', track: 'civics', cost: 60,
    prerequisites: ['constitutional-law'],
    unlocks: ['+1 gold per culture building empire-wide'], era: 6 },
  { id: 'parliamentary-reform', name: 'Parliamentary Reform', track: 'civics', cost: 120,
    prerequisites: ['civic-humanism', 'constitutional-law'],
    unlocks: ['+5% production empire-wide'], era: 6 },

  // EXPLORATION (2)
  { id: 'land-survey', name: 'Land Survey', track: 'exploration', cost: 185,
    prerequisites: ['colonial-charter', 'renaissance-architecture'],
    unlocks: ['+1 food in all cities empire-wide'], era: 6 },
  { id: 'colonial-administration', name: 'Colonial Administration', track: 'exploration', cost: 120,
    prerequisites: ['colonial-charter', 'mercantilism'],
    unlocks: ['Colonial Administration national project available'], unlocksBuildings: ['colonial_administration'], era: 6 },

  // AGRICULTURE (2)
  { id: 'improved-agriculture', name: 'Improved Agriculture', track: 'agriculture', cost: 120,
    prerequisites: ['plantation-farming'],
    unlocks: ['Farms yield +1 food; granaries add +1 food'], era: 6 },
  { id: 'tobacco-trade', name: 'Tobacco Trade', track: 'agriculture', cost: 185,
    prerequisites: ['distillation', 'colonial-trade'],
    unlocks: ['+2 gold per plantation improvement'], era: 6 },

  // MEDICINE (2)
  { id: 'surgical-school', name: 'Surgical School', track: 'medicine', cost: 185,
    prerequisites: ['anatomy', 'advanced-anatomy'],
    unlocks: ['Units in cities heal 2 additional HP per turn'], unlocksBuildings: ['surgery_guild'], era: 6 },
  { id: 'epidemic-control', name: 'Epidemic Control', track: 'medicine', cost: 120,
    prerequisites: ['herbalist-guilds'],
    unlocks: ['City population loss from famine halved'], era: 6 },

  // PHILOSOPHY (2)
  { id: 'enlightenment', name: 'Enlightenment', track: 'philosophy', cost: 185,
    prerequisites: ['empiricism', 'rationalism'],
    unlocks: ['+1 science per two population in cities'], era: 6 },
  { id: 'social-contract', name: 'Social Contract', track: 'philosophy', cost: 120,
    prerequisites: ['rationalism', 'civic-humanism'],
    unlocks: ['+2 gold per city with a market'], era: 6 },

  // ARTS (2)
  { id: 'baroque-music', name: 'Baroque Music', track: 'arts', cost: 60,
    prerequisites: ['classical-music-form'],
    unlocks: ['+1 gold per culture building; morale bonus'], unlocksBuildings: ['concert_hall'], era: 6 },
  { id: 'portrait-art', name: 'Portrait Art', track: 'arts', cost: 120,
    prerequisites: ['renaissance-painting'],
    unlocks: ['+1 gold per art gallery in empire'], era: 6 },

  // MARITIME (2)
  { id: 'trade-winds', name: 'Trade Winds', track: 'maritime', cost: 185,
    prerequisites: ['deep-sea-routes', 'circumnavigation'],
    unlocks: ['Naval units gain +1 movement'], era: 6 },
  { id: 'frigate-construction', name: 'Frigate Construction', track: 'maritime', cost: 180,
    prerequisites: ['naval-gunnery'],
    unlocks: ['Frigate unlocked — fast armed escort'], unlocksUnits: ['frigate'], era: 6 },

  // METALLURGY (2)
  { id: 'precision-casting', name: 'Precision Casting', track: 'metallurgy', cost: 65,
    prerequisites: ['cannon-casting'],
    unlocks: ['Cannon units gain +5 strength; cannon cost -10%'], era: 6 },
  { id: 'steel-plate-armor', name: 'Steel Plate Armor', track: 'metallurgy', cost: 65,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Land melee units gain +3 defense strength'], era: 6 },

  // CONSTRUCTION (2)
  { id: 'fortification-engineering', name: 'Fortification Engineering', track: 'construction', cost: 120,
    prerequisites: ['renaissance-architecture'],
    unlocks: ['Walls provide +5 defense strength to garrison'], unlocksBuildings: ['star_fort'], era: 6 },
  { id: 'aqueduct-expansion', name: 'Aqueduct Expansion', track: 'construction', cost: 120,
    prerequisites: ['vaulted-ceilings', 'hydraulics'],
    unlocks: ['+2 food in all cities with aqueduct'], era: 6 },

  // COMMUNICATION (2)
  { id: 'newspaper-press', name: 'Newspaper Press', track: 'communication', cost: 185,
    prerequisites: ['printing-press', 'postal-service'],
    unlocks: ['+2 science empire-wide'], era: 6 },
  { id: 'courier-network', name: 'Courier Network', track: 'communication', cost: 120,
    prerequisites: ['postal-service'],
    unlocks: ['+1 gold per own city connected by road to your capital'], era: 6 },

  // ESPIONAGE (2)
  { id: 'counter-espionage', name: 'Counter-Espionage', track: 'espionage', cost: 120,
    prerequisites: ['black-chambers'],
    unlocks: ['-25% chance enemy spies succeed against your cities'], unlocksBuildings: ['grand_cipher_bureau'], era: 6 },
  { id: 'propaganda', name: 'Propaganda', track: 'espionage', cost: 120,
    prerequisites: ['diplomatic-networks'],
    unlocks: ['Spy missions to flip loyalties available in foreign cities'], era: 6 },

  // SPIRITUALITY (2)
  { id: 'ecumenical-council', name: 'Ecumenical Council', track: 'spirituality', cost: 120,
    prerequisites: ['reformation'],
    unlocks: ['+2 gold per city with a temple empire-wide'], era: 6 },
  { id: 'missionary-zeal', name: 'Missionary Zeal', track: 'spirituality', cost: 120,
    prerequisites: ['monastic-orders'],
    unlocks: ['Missionaries spread religion to conquered cities faster'], era: 6 },
];

const ERA_7_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'rifled-infantry', name: 'Rifled Infantry', track: 'military', cost: 195,
    prerequisites: ['rifle-tactics', 'precision-casting'],
    unlocks: ['Rifleman replaces musketeer-class infantry — accurate long-range unit'], unlocksUnits: ['rifleman'], era: 7 },
  { id: 'mass-mobilization', name: 'Mass Mobilization', track: 'military', cost: 205,
    prerequisites: ['rifle-tactics', 'parliamentary-reform'],
    unlocks: ['Grand Arsenal national project available'], unlocksBuildings: ['grand_arsenal'], era: 7 },
  { id: 'balloon-corps', name: 'Balloon Corps', track: 'military', cost: 215,
    prerequisites: ['rifle-tactics', 'applied-chemistry'],
    unlocks: ['Observation balloon with 4-hex vision range — double the range of any ground unit'],
    unlocksUnits: ['observation_balloon'], era: 7 },

  // ECONOMY (2)
  { id: 'steam-power', name: 'Steam Power', track: 'economy', cost: 200,
    prerequisites: ['joint-stock-companies', 'precision-casting'],
    unlocks: ['Factory unlocked — steam-driven industrial production building', 'Reveal Coal resource'], unlocksBuildings: ['factory'], era: 7 },
  { id: 'mass-production', name: 'Mass Production', track: 'economy', cost: 210,
    prerequisites: ['mercantilism', 'aqueduct-expansion'],
    unlocks: ['+10% production empire-wide; unit training costs reduced 5%'], era: 7 },

  // SCIENCE (2)
  { id: 'industrialization', name: 'Industrialization', track: 'science', cost: 145,
    prerequisites: ['natural-history', 'hydraulics'],
    unlocks: ['+2 science empire-wide; Peoples University national project available'], unlocksBuildings: ['peoples_university'], era: 7 },
  { id: 'applied-chemistry', name: 'Applied Chemistry', track: 'science', cost: 210,
    prerequisites: ['natural-history', 'precision-casting'],
    unlocks: ['+1 science per production building empire-wide'], era: 7 },

  // CIVICS (2)
  { id: 'nationalism', name: 'Nationalism', track: 'civics', cost: 145,
    prerequisites: ['separation-of-powers', 'parliamentary-reform'],
    unlocks: ['Census Office unlocked'], unlocksBuildings: ['census_office'], era: 7 },
  { id: 'social-reform', name: 'Social Reform', track: 'civics', cost: 205,
    prerequisites: ['parliamentary-reform', 'enlightenment'],
    unlocks: ['+1 gold in cities with a market or guildhall'], era: 7 },

  // EXPLORATION (2)
  { id: 'colonial-railways', name: 'Colonial Railways', track: 'exploration', cost: 145,
    prerequisites: ['land-survey', 'courier-network'],
    unlocks: ['+2 gold per city connected by road to your capital'], era: 7 },
  { id: 'manifest-destiny', name: 'Manifest Destiny', track: 'exploration', cost: 210,
    prerequisites: ['colonial-administration', 'land-survey'],
    unlocks: ['Settlers cost 20% less production; frontier cities founded with +5 food bonus'], era: 7 },

  // AGRICULTURE (2)
  { id: 'mechanized-farming', name: 'Mechanized Farming', track: 'agriculture', cost: 145,
    prerequisites: ['improved-agriculture', 'hydraulics'],
    unlocks: ['Farms yield +1 production in addition to food; granaries add +1 additional food'], era: 7 },
  { id: 'agricultural-machinery', name: 'Agricultural Machinery', track: 'agriculture', cost: 205,
    prerequisites: ['improved-agriculture', 'tobacco-trade'],
    unlocks: ['+2 food per farm improvement'], era: 7 },

  // MEDICINE (2)
  { id: 'field-hospitals', name: 'Field Hospitals', track: 'medicine', cost: 135,
    prerequisites: ['surgical-school', 'epidemic-control'],
    unlocks: ['Field Hospital unlocked — frontline unit healing facility'], unlocksBuildings: ['field_hospital'], era: 7 },
  { id: 'germ-theory', name: 'Germ Theory', track: 'medicine', cost: 205,
    prerequisites: ['epidemic-control', 'enlightenment'],
    unlocks: ['Units heal +2 HP when idle in friendly territory; cities immune to plague population loss'], era: 7 },

  // PHILOSOPHY (2)
  { id: 'utilitarianism', name: 'Utilitarianism', track: 'philosophy', cost: 145,
    prerequisites: ['enlightenment', 'social-contract'],
    unlocks: ['+1 gold per 3 population empire-wide'], era: 7 },
  { id: 'positivism', name: 'Positivism', track: 'philosophy', cost: 210,
    prerequisites: ['enlightenment', 'natural-history'],
    unlocks: ['+2 science empire-wide; universities generate +1 additional science'], era: 7 },

  // ARTS (2)
  { id: 'romanticism', name: 'Romanticism', track: 'arts', cost: 130,
    prerequisites: ['baroque-music', 'portrait-art'],
    unlocks: ['Culture buildings generate +1 gold and +1 science'], era: 7 },
  { id: 'industrial-realism', name: 'Industrial Realism', track: 'arts', cost: 205,
    prerequisites: ['baroque-music', 'newspaper-press'],
    unlocks: ['Culture buildings generate +1 production'], era: 7 },

  // MARITIME (2)
  { id: 'ironclad-warships', name: 'Ironclad Warships', track: 'maritime', cost: 210,
    prerequisites: ['frigate-construction', 'steel-plate-armor'],
    unlocks: ['Ironclad replaces frigate — armored steam-powered warship'], unlocksUnits: ['ironclad'], era: 7 },
  // Trade Routes Overhaul (#553): "Naval trade routes yield +2 gold" is a pre-existing
  // unlock string with no matching TECH_YIELD_MODIFIERS entry — flagged in the design
  // spec's root-cause analysis and explicitly left alone per the spec's Non-goals
  // ("no changes to the trade income formula"). MR1 only makes naval trade routes
  // establishable; the gold-formula honesty gap is a separate, out-of-scope issue.
  // Cost also raised 145 -> 265 for the same unlocksUnits/'marquee'-band pacing reason
  // as colonial-trade above (8 turns -> pacing-audit outlier; 265 lands at the 10-16
  // turn window midpoint for era 7).
  { id: 'steam-navigation', name: 'Steam Navigation', track: 'maritime', cost: 265,
    prerequisites: ['trade-winds', 'joint-stock-companies'],
    unlocks: ['Naval trade routes yield +2 gold; coastal cities gain +1 production from harbours'], unlocksUnits: ['steamship_trader'], era: 7 },

  // METALLURGY (2)
  { id: 'steel-production', name: 'Steel Production', track: 'metallurgy', cost: 130,
    prerequisites: ['steel-plate-armor', 'blast-furnace-tech'],
    unlocks: ['Steel Mill unlocked — advanced iron processing building'], unlocksBuildings: ['steel_mill'], era: 7 },
  { id: 'railway-expansion', name: 'Railway Expansion', track: 'metallurgy', cost: 215,
    prerequisites: ['precision-casting', 'fortification-engineering'],
    unlocks: ['Roads become railways: half movement on roads (does not stack with Military Logistics); National Railway national project available'], unlocksBuildings: ['national_railway'], era: 7 },

  // CONSTRUCTION (2)
  { id: 'urban-planning', name: 'Urban Planning', track: 'construction', cost: 130,
    prerequisites: ['fortification-engineering', 'aqueduct-expansion'],
    unlocks: ['+2 production in cities with 3 or more buildings'], era: 7 },
  { id: 'iron-bridges', name: 'Iron Bridges', track: 'construction', cost: 210,
    prerequisites: ['aqueduct-expansion', 'steel-plate-armor'],
    unlocks: ['+1 gold per river city'], era: 7 },

  // COMMUNICATION (2)
  { id: 'popular-press', name: 'Popular Press', track: 'communication', cost: 130,
    prerequisites: ['newspaper-press', 'baroque-music'],
    unlocks: ['Print Shop unlocked — mass literacy and news distribution building'], unlocksBuildings: ['print_shop'], era: 7 },
  { id: 'electric-telegraph', name: 'Electric Telegraph', track: 'communication', cost: 210,
    prerequisites: ['courier-network', 'newspaper-press'],
    unlocks: ['+1 gold per road connection in trade network; diplomatic vision range increased'], era: 7 },

  // ESPIONAGE (2)
  { id: 'covert-operations', name: 'Covert Operations', track: 'espionage', cost: 145,
    prerequisites: ['counter-espionage', 'propaganda'],
    unlocks: ['+2 spy slots empire-wide; covert missions have +15% success rate'], era: 7 },
  { id: 'secret-police', name: 'Secret Police', track: 'espionage', cost: 210,
    prerequisites: ['counter-espionage', 'separation-of-powers'],
    unlocks: ['Enemy spy missions in your cities have -30% success rate; spy detection bonus'], era: 7 },

  // SPIRITUALITY (2)
  { id: 'secularism', name: 'Secularism', track: 'spirituality', cost: 145,
    prerequisites: ['ecumenical-council', 'enlightenment'],
    unlocks: ['+2 science in cities without a temple'], era: 7 },
  { id: 'social-gospel', name: 'Social Gospel', track: 'spirituality', cost: 205,
    prerequisites: ['missionary-zeal', 'social-contract'],
    unlocks: ['+1 food and +1 gold in cities with a temple; unit healing in cities improved'], era: 7 },
];

export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
  ...ERA_6_TECHS,
  ...ERA_7_TECHS,
];
