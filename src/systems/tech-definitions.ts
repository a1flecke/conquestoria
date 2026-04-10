import type { Tech } from '@/core/types';

export const TECH_TREE: Tech[] = [
  // === MILITARY TRACK (8 techs, existing) ===
  { id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 20, prerequisites: [], unlocks: ['Warriors deal +2 damage'], era: 1 },
  { id: 'archery', name: 'Archery', track: 'military', cost: 35, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit'], era: 1 },
  { id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Barracks building', 'swordsman'], era: 2 },
  { id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: ['Unlock Stable, mounted units'], era: 2 },
  { id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: ['Unlock Walls building', 'pikeman'], era: 3 },
  { id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: ['Stronger melee units'], era: 3 },
  { id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: ['Unlock Catapult unit'], era: 4 },
  { id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus', 'musketeer'], era: 4 },

  // === ECONOMY TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'gathering', name: 'Gathering', track: 'economy', cost: 15, prerequisites: [], unlocks: ['Unlock Granary building'], era: 1 },
  { id: 'pottery', name: 'Pottery', track: 'economy', cost: 25, prerequisites: ['gathering'], unlocks: ['Unlock Herbalist building'], era: 1 },
  { id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 35, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource'], era: 2 },
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['Farms yield +1 food'], era: 2 },
  { id: 'currency', name: 'Currency', track: 'economy', cost: 60, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building'], era: 3 },
  { id: 'mining-tech', name: 'Advanced Mining', track: 'economy', cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production'], era: 3 },
  { id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 85, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], era: 4 },
  { id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], era: 4 },
  { id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: ['trade-routes', 'banking'], unlocks: ['Late-era supply chains and wonder distribution requirements'], era: 5, countsForEraAdvancement: false },

  // === SCIENCE TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'fire', name: 'Fire', track: 'science', cost: 15, prerequisites: [], unlocks: ['Unlock basic research'], era: 1 },
  { id: 'writing', name: 'Writing', track: 'science', cost: 30, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1 },
  { id: 'wheel', name: 'The Wheel', track: 'science', cost: 40, prerequisites: ['fire'], unlocks: ['Unlock Workshop building'], era: 2 },
  { id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: ['Unlock Archive building'], era: 2 },
  { id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Aqueduct, Forge'], era: 3 },
  { id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: ['Unlock Temple building'], era: 3 },
  { id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: ['Unlock Observatory building'], era: 4 },
  { id: 'medicine', name: 'Medicine', track: 'science', cost: 85, prerequisites: ['philosophy', 'pottery'], unlocks: ['City population grows faster'], era: 4 },
  { id: 'nuclear-theory', name: 'Nuclear Theory', track: 'science', cost: 165, prerequisites: ['astronomy', 'medicine'], unlocks: ['Late-era atomic research and wonder prerequisites'], era: 5, countsForEraAdvancement: false },

  // === CIVICS TRACK (8 techs, existing) ===
  { id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 15, prerequisites: [], unlocks: ['Basic governance'], era: 1 },
  { id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 30, prerequisites: ['tribal-council'], unlocks: ['Unlock Monument building'], era: 1 },
  { id: 'early-empire', name: 'Early Empire', track: 'civics', cost: 45, prerequisites: ['code-of-laws'], unlocks: ['Cities claim +1 tile radius'], era: 2 },
  { id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: ['Unlock Lumbermill, Quarry'], era: 2 },
  { id: 'diplomacy-tech', name: 'Diplomacy', track: 'civics', cost: 65, prerequisites: ['early-empire', 'writing'], unlocks: ['Unlock Non-Aggression Pacts'], era: 3 },
  { id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: ['Unlock Forum building'], era: 3 },
  { id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: ['Unlock Amphitheater building'], era: 4 },
  { id: 'political-philosophy', name: 'Political Philosophy', track: 'civics', cost: 100, prerequisites: ['civil-service', 'philosophy'], unlocks: ['Unlock alliances'], era: 4 },

  // === EXPLORATION TRACK (8 techs, existing) ===
  { id: 'pathfinding', name: 'Pathfinding', track: 'exploration', cost: 15, prerequisites: [], unlocks: ['Scouts get +1 vision'], era: 1 },
  { id: 'cartography', name: 'Cartography', track: 'exploration', cost: 30, prerequisites: ['pathfinding'], unlocks: ['Reveal map edges'], era: 1 },
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 45, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 55, prerequisites: ['sailing', 'fire'], unlocks: ['Units can cross ocean'], era: 2 },
  { id: 'road-building', name: 'Road Building', track: 'exploration', cost: 50, prerequisites: ['wheel', 'pathfinding'], unlocks: ['Workers can build roads'], era: 3 },
  { id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: ['Unlock Harbor building'], era: 3 },
  { id: 'exploration-tech', name: 'Exploration', track: 'exploration', cost: 85, prerequisites: ['celestial-navigation'], unlocks: ['All units +1 vision range'], era: 4 },
  { id: 'military-logistics', name: 'Military Logistics', track: 'exploration', cost: 100, prerequisites: ['road-building', 'tactics'], unlocks: ['Units move +1 on roads'], era: 4 },

  // === AGRICULTURE TRACK (8 techs, new) ===
  { id: 'foraging', name: 'Foraging', track: 'agriculture', cost: 20, prerequisites: [], unlocks: ['Food storage'], era: 1 },
  { id: 'domestication', name: 'Domestication', track: 'agriculture', cost: 25, prerequisites: ['foraging'], unlocks: ['Animal pens'], era: 1 },
  { id: 'crop-rotation', name: 'Crop Rotation', track: 'agriculture', cost: 45, prerequisites: ['domestication', 'irrigation'], unlocks: ['Improved farms'], era: 2 },
  { id: 'granary-design', name: 'Granary Design', track: 'agriculture', cost: 40, prerequisites: ['foraging'], unlocks: ['Granary upgrade'], era: 2 },
  { id: 'fertilization', name: 'Fertilization', track: 'agriculture', cost: 80, prerequisites: ['crop-rotation'], unlocks: ['Fertile fields'], era: 3 },
  { id: 'livestock-breeding', name: 'Livestock Breeding', track: 'agriculture', cost: 85, prerequisites: ['crop-rotation', 'granary-design'], unlocks: ['Ranch'], era: 3 },
  { id: 'selective-breeding', name: 'Selective Breeding', track: 'agriculture', cost: 120, prerequisites: ['livestock-breeding'], unlocks: ['Hybrid crops'], era: 4 },
  { id: 'agricultural-science', name: 'Agricultural Science', track: 'agriculture', cost: 125, prerequisites: ['fertilization', 'livestock-breeding'], unlocks: ['Agricultural lab'], era: 4 },

  // === MEDICINE TRACK (8 techs, new) ===
  { id: 'herbalism', name: 'Herbalism', track: 'medicine', cost: 20, prerequisites: [], unlocks: ['Healer'], era: 1 },
  { id: 'bone-setting', name: 'Bone Setting', track: 'medicine', cost: 25, prerequisites: ['herbalism'], unlocks: ['Field medic'], era: 1 },
  { id: 'sanitation', name: 'Sanitation', track: 'medicine', cost: 45, prerequisites: ['bone-setting'], unlocks: ['Sewers'], era: 2 },
  { id: 'midwifery', name: 'Midwifery', track: 'medicine', cost: 40, prerequisites: ['herbalism'], unlocks: ['Birth rate bonus'], era: 2 },
  { id: 'surgery', name: 'Surgery', track: 'medicine', cost: 85, prerequisites: ['sanitation', 'philosophy'], unlocks: ['Hospital'], era: 3 },
  { id: 'quarantine', name: 'Quarantine', track: 'medicine', cost: 80, prerequisites: ['sanitation'], unlocks: ['Plague defense'], era: 3 },
  { id: 'apothecary', name: 'Apothecary', track: 'medicine', cost: 120, prerequisites: ['surgery'], unlocks: ['Pharmacy'], era: 4 },
  { id: 'anatomy', name: 'Anatomy', track: 'medicine', cost: 130, prerequisites: ['surgery', 'quarantine'], unlocks: ['Medical school'], era: 4 },

  // === PHILOSOPHY TRACK (8 techs, new) ===
  { id: 'oral-tradition', name: 'Oral Tradition', track: 'philosophy', cost: 20, prerequisites: [], unlocks: ['Storyteller'], era: 1 },
  { id: 'mythology', name: 'Mythology', track: 'philosophy', cost: 25, prerequisites: ['oral-tradition'], unlocks: ['Shrine'], era: 1 },
  { id: 'ethics', name: 'Ethics', track: 'philosophy', cost: 45, prerequisites: ['mythology', 'writing'], unlocks: ['Ethical code'], era: 2 },
  { id: 'rhetoric', name: 'Rhetoric', track: 'philosophy', cost: 50, prerequisites: ['oral-tradition'], unlocks: ['Forum'], era: 2 },
  { id: 'logic', name: 'Logic', track: 'philosophy', cost: 85, prerequisites: ['ethics', 'rhetoric'], unlocks: ['School of thought'], era: 3 },
  { id: 'metaphysics', name: 'Metaphysics', track: 'philosophy', cost: 80, prerequisites: ['ethics'], unlocks: ['Great thinker'], era: 3 },
  { id: 'humanism', name: 'Humanism', track: 'philosophy', cost: 125, prerequisites: ['logic', 'metaphysics'], unlocks: ['Enlightenment'], era: 4 },
  { id: 'natural-philosophy', name: 'Natural Philosophy', track: 'philosophy', cost: 120, prerequisites: ['logic'], unlocks: ['Empiricism'], era: 4 },

  // === ARTS TRACK (8 techs, new) ===
  { id: 'cave-painting', name: 'Cave Painting', track: 'arts', cost: 20, prerequisites: [], unlocks: ['Art gallery'], era: 1 },
  { id: 'storytelling', name: 'Storytelling', track: 'arts', cost: 25, prerequisites: ['cave-painting'], unlocks: ['Bard'], era: 1 },
  { id: 'pottery-arts', name: 'Pottery Arts', track: 'arts', cost: 40, prerequisites: ['storytelling', 'pottery'], unlocks: ['Kiln'], era: 2 },
  { id: 'music', name: 'Music', track: 'arts', cost: 45, prerequisites: ['storytelling'], unlocks: ['Concert hall'], era: 2 },
  { id: 'sculpture', name: 'Sculpture', track: 'arts', cost: 80, prerequisites: ['pottery-arts'], unlocks: ['Statue'], era: 3 },
  { id: 'drama', name: 'Drama', track: 'arts', cost: 85, prerequisites: ['music', 'pottery-arts'], unlocks: ['Amphitheater'], era: 3 },
  { id: 'theater', name: 'Theater', track: 'arts', cost: 120, prerequisites: ['drama'], unlocks: ['Opera house'], era: 4 },
  { id: 'architecture-arts', name: 'Architecture Arts', track: 'arts', cost: 130, prerequisites: ['sculpture', 'drama'], unlocks: ['Grand monument'], era: 4 },

  // === MARITIME TRACK (8 techs, new) ===
  { id: 'rafts', name: 'Rafts', track: 'maritime', cost: 20, prerequisites: [], unlocks: ['Raft'], era: 1 },
  { id: 'fishing', name: 'Fishing', track: 'maritime', cost: 25, prerequisites: ['rafts'], unlocks: ['Fishing boat'], era: 1 },
  { id: 'galleys', name: 'Galleys', track: 'maritime', cost: 45, prerequisites: ['fishing', 'sailing'], unlocks: ['Galley'], era: 2 },
  { id: 'navigation', name: 'Navigation', track: 'maritime', cost: 50, prerequisites: ['galleys'], unlocks: ['Navigator'], era: 2 },
  { id: 'triremes', name: 'Triremes', track: 'maritime', cost: 85, prerequisites: ['navigation'], unlocks: ['Trireme'], era: 3 },
  { id: 'harbor-building', name: 'Harbor Building', track: 'maritime', cost: 80, prerequisites: ['galleys'], unlocks: ['Harbor'], era: 3 },
  { id: 'caravels', name: 'Caravels', track: 'maritime', cost: 125, prerequisites: ['triremes', 'harbor-building'], unlocks: ['Caravel'], era: 4 },
  { id: 'naval-warfare', name: 'Naval Warfare', track: 'maritime', cost: 130, prerequisites: ['triremes'], unlocks: ['Warship'], era: 4 },

  // === METALLURGY TRACK (8 techs, new) ===
  { id: 'copper-working', name: 'Copper Working', track: 'metallurgy', cost: 20, prerequisites: [], unlocks: ['Copper tools'], era: 1 },
  { id: 'smelting', name: 'Smelting', track: 'metallurgy', cost: 25, prerequisites: ['copper-working'], unlocks: ['Furnace'], era: 1 },
  { id: 'bronze-casting', name: 'Bronze Casting', track: 'metallurgy', cost: 45, prerequisites: ['smelting', 'bronze-working'], unlocks: ['Bronze armor'], era: 2 },
  { id: 'tool-making', name: 'Tool Making', track: 'metallurgy', cost: 40, prerequisites: ['smelting'], unlocks: ['Improved tools'], era: 2 },
  { id: 'iron-smelting', name: 'Iron Smelting', track: 'metallurgy', cost: 85, prerequisites: ['bronze-casting'], unlocks: ['Iron ore'], era: 3 },
  { id: 'alloys', name: 'Alloys', track: 'metallurgy', cost: 80, prerequisites: ['bronze-casting', 'tool-making'], unlocks: ['Alloy weapons'], era: 3 },
  { id: 'steel-forging', name: 'Steel Forging', track: 'metallurgy', cost: 125, prerequisites: ['iron-smelting', 'alloys'], unlocks: ['Steel weapons'], era: 4 },
  { id: 'armor-craft', name: 'Armor Craft', track: 'metallurgy', cost: 120, prerequisites: ['iron-smelting'], unlocks: ['Plate armor'], era: 4 },

  // === CONSTRUCTION TRACK (8 techs, new) ===
  { id: 'mud-brick', name: 'Mud Brick', track: 'construction', cost: 20, prerequisites: [], unlocks: ['Basic walls'], era: 1 },
  { id: 'thatching', name: 'Thatching', track: 'construction', cost: 25, prerequisites: ['mud-brick'], unlocks: ['Shelter'], era: 1 },
  { id: 'masonry', name: 'Masonry', track: 'construction', cost: 45, prerequisites: ['thatching'], unlocks: ['Stone walls'], era: 2 },
  { id: 'foundations', name: 'Foundations', track: 'construction', cost: 40, prerequisites: ['mud-brick'], unlocks: ['Sturdy buildings'], era: 2 },
  { id: 'aqueducts', name: 'Aqueducts', track: 'construction', cost: 85, prerequisites: ['masonry', 'engineering'], unlocks: ['Water system'], era: 3 },
  { id: 'arches', name: 'Arches', track: 'construction', cost: 80, prerequisites: ['masonry', 'foundations'], unlocks: ['Grand buildings'], era: 3 },
  { id: 'fortresses', name: 'Fortresses', track: 'construction', cost: 125, prerequisites: ['arches'], unlocks: ['Fortress'], era: 4 },
  { id: 'city-planning', name: 'City Planning', track: 'construction', cost: 130, prerequisites: ['aqueducts', 'arches'], unlocks: ['Planned city'], era: 4 },

  // === COMMUNICATION TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'drums', name: 'Drums', track: 'communication', cost: 20, prerequisites: [], unlocks: ['Signal drums'], era: 1 },
  { id: 'smoke-signals', name: 'Smoke Signals', track: 'communication', cost: 25, prerequisites: ['drums'], unlocks: ['Watchtower'], era: 1 },
  { id: 'pictographs', name: 'Pictographs', track: 'communication', cost: 45, prerequisites: ['smoke-signals', 'writing'], unlocks: ['Record keeping'], era: 2 },
  { id: 'messengers', name: 'Messengers', track: 'communication', cost: 40, prerequisites: ['smoke-signals'], unlocks: ['Messenger post'], era: 2 },
  { id: 'courier-networks', name: 'Courier Networks', track: 'communication', cost: 80, prerequisites: ['messengers', 'pictographs'], unlocks: ['Postal service'], era: 3 },
  { id: 'ciphers', name: 'Ciphers', track: 'communication', cost: 85, prerequisites: ['pictographs'], unlocks: ['Encoded messages'], era: 3 },
  { id: 'printing', name: 'Printing', track: 'communication', cost: 120, prerequisites: ['courier-networks'], unlocks: ['Newspaper'], era: 4 },
  { id: 'diplomats', name: 'Diplomats', track: 'communication', cost: 130, prerequisites: ['courier-networks', 'ciphers'], unlocks: ['Embassy'], era: 4 },
  { id: 'mass-media', name: 'Mass Media', track: 'communication', cost: 150, prerequisites: ['printing', 'diplomats'], unlocks: ['Global broadcasts and late-era cultural coordination'], era: 5, countsForEraAdvancement: false },

  // === ESPIONAGE TRACK (8 techs — M4a stages 1-2, expanded in later milestones) ===
  { id: 'espionage-scouting', name: 'Scouting Networks', track: 'espionage', cost: 40, prerequisites: [], unlocks: ['Recruit spies', 'Passive city surveillance', 'Scout Area mission', 'Monitor Troops mission'], era: 1 },
  { id: 'lookouts', name: 'Lookouts', track: 'espionage', cost: 25, prerequisites: ['espionage-scouting'], unlocks: ['Lookout tower'], era: 1 },
  { id: 'espionage-informants', name: 'Informant Rings', track: 'espionage', cost: 80, prerequisites: ['espionage-scouting'], unlocks: ['Gather Intel mission', 'Identify Resources mission', 'Monitor Diplomacy mission', 'Second spy slot'], era: 2 },
  { id: 'disguise', name: 'Disguise', track: 'espionage', cost: 40, prerequisites: ['lookouts'], unlocks: ['Spy disguise'], era: 2 },
  { id: 'spy-networks', name: 'Spy Networks', track: 'espionage', cost: 85, prerequisites: ['espionage-informants', 'disguise'], unlocks: ['Spy ring'], era: 3 },
  { id: 'sabotage', name: 'Sabotage', track: 'espionage', cost: 80, prerequisites: ['espionage-informants'], unlocks: ['Saboteur'], era: 3 },
  { id: 'cryptography', name: 'Cryptography', track: 'espionage', cost: 125, prerequisites: ['spy-networks'], unlocks: ['Cipher bureau'], era: 4 },
  { id: 'counter-intelligence', name: 'Counter-Intelligence', track: 'espionage', cost: 130, prerequisites: ['spy-networks', 'sabotage'], unlocks: ['Security agency'], era: 4 },
  { id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 175, prerequisites: ['cryptography', 'counter-intelligence'], unlocks: ['Satellite Surveillance', 'Misinformation Campaign'], era: 5 },
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], era: 5 },

  // === SPIRITUALITY TRACK (8 techs, new) ===
  { id: 'animism', name: 'Animism', track: 'spirituality', cost: 20, prerequisites: [], unlocks: ['Spirit shrine'], era: 1 },
  { id: 'burial-rites', name: 'Burial Rites', track: 'spirituality', cost: 25, prerequisites: ['animism'], unlocks: ['Burial ground'], era: 1 },
  { id: 'shamanism', name: 'Shamanism', track: 'spirituality', cost: 45, prerequisites: ['burial-rites', 'tribal-council'], unlocks: ['Shaman'], era: 2 },
  { id: 'sacred-sites', name: 'Sacred Sites', track: 'spirituality', cost: 40, prerequisites: ['burial-rites'], unlocks: ['Holy site'], era: 2 },
  { id: 'temples', name: 'Temples', track: 'spirituality', cost: 85, prerequisites: ['shamanism', 'sacred-sites'], unlocks: ['Grand temple'], era: 3 },
  { id: 'priesthood', name: 'Priesthood', track: 'spirituality', cost: 80, prerequisites: ['shamanism'], unlocks: ['Priest'], era: 3 },
  { id: 'pilgrimages', name: 'Pilgrimages', track: 'spirituality', cost: 120, prerequisites: ['temples'], unlocks: ['Pilgrimage route'], era: 4 },
  { id: 'theology-tech', name: 'Theology', track: 'spirituality', cost: 130, prerequisites: ['temples', 'priesthood'], unlocks: ['Cathedral'], era: 4 },
];

export function getEraAdvancementTechs(era: number): Tech[] {
  return TECH_TREE.filter(tech => tech.era === era && tech.countsForEraAdvancement !== false);
}
