import type { Tech } from '@/core/types';

export const TECH_TREE_ERAS_1_4: Tech[] = [
  // === MILITARY TRACK (8 techs, existing) ===
  { id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 4, prerequisites: [], unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource'], unlocksUnits: ['axeman'], unlocksBuildings: ['bronze-workshop', 'armory', 'tribal_muster_ground'], era: 1, pacing: { band: 'starter', role: 'foundational-military', impact: 1.05, scope: 'military', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1 } },
  { id: 'archery', name: 'Archery', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: [], unlocksUnits: ['archer'], era: 1 },
  { id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: ['Reveal Iron resource'], unlocksUnits: ['spearman', 'swordsman'], unlocksBuildings: ['foundry_guild'], era: 2 },
  { id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: [], unlocksUnits: ['horseman', 'cavalry'], unlocksBuildings: ['stable', 'cavalry-academy'], era: 2 },
  { id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: [], unlocksUnits: ['pikeman'], unlocksBuildings: ['walls'], era: 3 },
  { id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: [], unlocksUnits: ['knight'], unlocksBuildings: ['iron-foundry', 'war-academy', 'iron_legion'], era: 3 },
  { id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: [], unlocksUnits: ['catapult', 'ballista'], unlocksBuildings: ['siege-workshop'], era: 4 },
  { id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus'], unlocksUnits: ['crossbowman'], unlocksBuildings: ['praetorian_legion'], era: 4 },

  // === ECONOMY TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'gathering', name: 'Gathering', track: 'economy', cost: 4, prerequisites: [], unlocks: ['Foundational economy knowledge', 'Reveal Stone resource'], unlocksBuildings: ['communal_stores'], era: 1, pacing: { band: 'starter', role: 'foundational-economy', impact: 1, scope: 'empire', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1.05 } },
  { id: 'pottery', name: 'Pottery', track: 'economy', cost: 10, prerequisites: ['gathering'], unlocks: ['Foundational ceramics knowledge', 'Reveal Wine resource', 'Reveal Salt resource'], era: 1 },
  { id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 12, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource', 'Reveal Sheep resource'], unlocksBuildings: ['ranch', 'grand_bazaar'], era: 2 },
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['River farms yield +1 production', 'Reveal Silk resource'], era: 2 },
  { id: 'currency', name: 'Currency', track: 'economy', cost: 60, prerequisites: ['pottery'], unlocks: ['Reveal Incense resource', 'Reveal Gold resource'], unlocksBuildings: ['marketplace'], era: 3 },
  { id: 'mining-tech', name: 'Advanced Mining', track: 'economy', cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production', 'Reveal Gems resource', 'Reveal Silver resource'], era: 3 },
  { id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 85, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], unlocksUnits: ['caravan'], era: 4 },
  { id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], unlocksBuildings: ['bank', 'royal_mint'], era: 4 },

  // === SCIENCE TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'fire', name: 'Fire', track: 'science', cost: 4, prerequisites: [], unlocks: ['Unlock basic research'], era: 1, pacing: { band: 'starter', role: 'foundational-science', impact: 1, scope: 'empire', snowball: 1.15, urgency: 1.1, situationality: 1, unlockBreadth: 1.1 } },
  { id: 'writing', name: 'Writing', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: [], unlocksBuildings: ['library'], era: 1 },
  { id: 'wheel', name: 'The Wheel', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: ['Foundational mechanics knowledge'], unlocksBuildings: ['caravanserai'], era: 2 },
  { id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: [], unlocksBuildings: ['archive', 'scribes_hall'], era: 2 },
  { id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: [], unlocksBuildings: ['aqueduct', 'forge'], era: 3 },
  { id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: [], unlocksBuildings: ['temple', 'philosophers_circle'], era: 3 },
  { id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: [], unlocksBuildings: ['observatory'], era: 4 },
  { id: 'medicine', name: 'Medicine', track: 'science', cost: 85, prerequisites: ['philosophy', 'pottery'], unlocks: ['City population grows faster'], era: 4 },

  // === CIVICS TRACK (8 techs, existing) ===
  { id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 4, prerequisites: [], unlocks: ['Basic governance'], era: 1, pacing: { band: 'starter', role: 'foundational-civics', impact: 1, scope: 'empire', snowball: 1, urgency: 1, situationality: 1, unlockBreadth: 1.05 } },
  { id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 10, prerequisites: ['tribal-council'], unlocks: [], unlocksBuildings: ['monument'], era: 1 },
  { id: 'early-empire', name: 'Early Empire', track: 'civics', cost: 45, prerequisites: ['code-of-laws'], unlocks: ['Cities claim +1 tile radius'], era: 2 },
  { id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: [], unlocksBuildings: ['lumbermill', 'quarry-building', 'masonry-works'], era: 2 },
  { id: 'diplomacy-tech', name: 'Diplomacy', track: 'civics', cost: 65, prerequisites: ['early-empire', 'writing'], unlocks: ['Unlock Non-Aggression Pacts'], era: 3 },
  { id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: [], unlocksBuildings: ['forum'], era: 3 },
  { id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: [], unlocksBuildings: ['amphitheater'], era: 4 },
  { id: 'political-philosophy', name: 'Political Philosophy', track: 'civics', cost: 100, prerequisites: ['civil-service', 'philosophy'], unlocks: ['Unlock alliances'], era: 4 },

  // === EXPLORATION TRACK (8 techs, existing) ===
  { id: 'pathfinding', name: 'Pathfinding', track: 'exploration', cost: 4, prerequisites: [], unlocks: ['Scouts get +1 vision'], era: 1, pacing: { band: 'starter', role: 'foundational-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { id: 'cartography', name: 'Cartography', track: 'exploration', cost: 10, prerequisites: ['pathfinding'], unlocks: ['Reveal map edges', 'Reveal Spices resource'], era: 1 },
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 10, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 55, prerequisites: ['sailing', 'fire'], unlocks: ['Units can cross ocean'], era: 2 },
  { id: 'road-building', name: 'Road Building', track: 'exploration', cost: 50, prerequisites: ['wheel', 'pathfinding'], unlocks: ['Workers can build roads'], unlocksBuildings: ['road_corps'], era: 3 },
  { id: 'bridge-building', name: 'Bridge Building', track: 'exploration', cost: 60, prerequisites: ['road-building'], unlocks: ['River crossings cost no extra movement'], era: 3 },
  { id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: [], unlocksBuildings: ['harbor'], era: 3 },
  { id: 'exploration-tech', name: 'Exploration', track: 'exploration', cost: 85, prerequisites: ['celestial-navigation'], unlocks: ['All units +1 vision range'], era: 4 },
  { id: 'military-logistics', name: 'Military Logistics', track: 'exploration', cost: 100, prerequisites: ['road-building', 'tactics'], unlocks: ['Roads cost half movement'], era: 4 },

  // === AGRICULTURE TRACK (8 techs, new) ===
  { id: 'foraging', name: 'Foraging', track: 'agriculture', cost: 5, prerequisites: [], unlocks: ['Food storage', 'Reveal Ivory resource', 'Reveal Furs resource'], unlocksUnits: ['expedition'], era: 1 },
  { id: 'domestication', name: 'Domestication', track: 'agriculture', cost: 10, prerequisites: ['foraging'], unlocks: ['Animal pens', 'Reveal Cattle resource'], era: 1 },
  { id: 'crop-rotation', name: 'Crop Rotation', track: 'agriculture', cost: 45, prerequisites: ['domestication', 'irrigation'], unlocks: ['Improved farms'], era: 2 },
  { id: 'granary-design', name: 'Granary Design', track: 'agriculture', cost: 10, prerequisites: ['foraging'], unlocks: ['Granary upgrade'], unlocksBuildings: ['granary'], era: 2 },
  { id: 'fertilization', name: 'Fertilization', track: 'agriculture', cost: 80, prerequisites: ['crop-rotation'], unlocks: ['Fertile fields'], era: 3 },
  { id: 'livestock-breeding', name: 'Livestock Breeding', track: 'agriculture', cost: 85, prerequisites: ['crop-rotation', 'granary-design'], unlocks: ['Improved cattle and livestock management'], era: 3 },
  { id: 'selective-breeding', name: 'Selective Breeding', track: 'agriculture', cost: 120, prerequisites: ['livestock-breeding'], unlocks: ['Hybrid crops'], era: 4 },
  { id: 'agricultural-science', name: 'Agricultural Science', track: 'agriculture', cost: 125, prerequisites: ['fertilization', 'livestock-breeding'], unlocks: ['Agricultural lab'], era: 4 },

  // === MEDICINE TRACK (8 techs, new) ===
  { id: 'herbalism', name: 'Herbalism', track: 'medicine', cost: 5, prerequisites: [], unlocks: ['Folk medicine traditions'], era: 1 },
  { id: 'bone-setting', name: 'Bone Setting', track: 'medicine', cost: 10, prerequisites: ['herbalism'], unlocks: ['Battlefield care practices'], era: 1 },
  { id: 'sanitation', name: 'Sanitation', track: 'medicine', cost: 45, prerequisites: ['bone-setting'], unlocks: ['Public sanitation practices'], era: 2 },
  { id: 'midwifery', name: 'Midwifery', track: 'medicine', cost: 10, prerequisites: ['herbalism'], unlocks: ['Maternal care traditions'], era: 2 },
  { id: 'surgery', name: 'Surgery', track: 'medicine', cost: 85, prerequisites: ['sanitation', 'philosophy'], unlocks: ['Advanced surgical knowledge'], era: 3 },
  { id: 'quarantine', name: 'Quarantine', track: 'medicine', cost: 80, prerequisites: ['sanitation'], unlocks: ['Disease containment practices'], era: 3 },
  { id: 'apothecary', name: 'Apothecary', track: 'medicine', cost: 120, prerequisites: ['surgery'], unlocks: ['Herbal remedy traditions'], era: 4 },
  { id: 'anatomy', name: 'Anatomy', track: 'medicine', cost: 130, prerequisites: ['surgery', 'quarantine'], unlocks: ['Systematic anatomical study'], era: 4 },

  // === PHILOSOPHY TRACK (8 techs, new) ===
  { id: 'oral-tradition', name: 'Oral Tradition', track: 'philosophy', cost: 5, prerequisites: [], unlocks: ['Oral storytelling traditions'], era: 1 },
  { id: 'mythology', name: 'Mythology', track: 'philosophy', cost: 10, prerequisites: ['oral-tradition'], unlocks: ['Early religious practices and myth-making'], era: 1 },
  { id: 'ethics', name: 'Ethics', track: 'philosophy', cost: 45, prerequisites: ['mythology', 'writing'], unlocks: ['Ethical code'], era: 2 },
  { id: 'rhetoric', name: 'Rhetoric', track: 'philosophy', cost: 10, prerequisites: ['oral-tradition'], unlocks: ['Public speaking and civic discourse'], era: 2 },
  { id: 'logic', name: 'Logic', track: 'philosophy', cost: 85, prerequisites: ['ethics', 'rhetoric'], unlocks: ['Formal logical reasoning'], era: 3 },
  { id: 'metaphysics', name: 'Metaphysics', track: 'philosophy', cost: 80, prerequisites: ['ethics'], unlocks: ['Metaphysical inquiry traditions'], era: 3 },
  { id: 'humanism', name: 'Humanism', track: 'philosophy', cost: 125, prerequisites: ['logic', 'metaphysics'], unlocks: ['Enlightenment'], era: 4 },
  { id: 'natural-philosophy', name: 'Natural Philosophy', track: 'philosophy', cost: 120, prerequisites: ['logic'], unlocks: ['Empiricism'], era: 4 },

  // === ARTS TRACK (8 techs, new) ===
  { id: 'cave-painting', name: 'Cave Painting', track: 'arts', cost: 5, prerequisites: [], unlocks: ['Early visual art traditions'], era: 1 },
  { id: 'storytelling', name: 'Storytelling', track: 'arts', cost: 10, prerequisites: ['cave-painting'], unlocks: ['Oral culture flourishes'], era: 1 },
  { id: 'pottery-arts', name: 'Pottery Arts', track: 'arts', cost: 40, prerequisites: ['storytelling', 'pottery'], unlocks: ['Ceramic craft traditions'], era: 2 },
  { id: 'music', name: 'Music', track: 'arts', cost: 45, prerequisites: ['storytelling'], unlocks: ['Musical traditions'], era: 2 },
  { id: 'sculpture', name: 'Sculpture', track: 'arts', cost: 80, prerequisites: ['pottery-arts'], unlocks: ['Monumental art traditions'], era: 3 },
  { id: 'drama', name: 'Drama', track: 'arts', cost: 85, prerequisites: ['music', 'pottery-arts'], unlocks: ['Formal dramatic performance traditions'], era: 3 },
  { id: 'theater', name: 'Theater', track: 'arts', cost: 120, prerequisites: ['drama'], unlocks: ['Theatrical performance traditions'], era: 4 },
  { id: 'architecture-arts', name: 'Architecture Arts', track: 'arts', cost: 130, prerequisites: ['sculpture', 'drama'], unlocks: ['Monumental architecture traditions'], era: 4 },

  // === MARITIME TRACK (8 techs, new) ===
  { id: 'rafts', name: 'Rafts', track: 'maritime', cost: 5, prerequisites: [], unlocks: ['Basic watercraft traditions'], era: 1 },
  { id: 'fishing', name: 'Fishing', track: 'maritime', cost: 10, prerequisites: ['rafts'], unlocks: [], unlocksBuildings: ['dock'], era: 1 },
  { id: 'galleys', name: 'Galleys', track: 'maritime', cost: 45, prerequisites: ['fishing', 'sailing'], unlocks: [], unlocksUnits: ['galley', 'transport'], era: 2 },
  { id: 'navigation', name: 'Navigation', track: 'maritime', cost: 50, prerequisites: ['galleys'], unlocks: [], unlocksUnits: ['carrack'], era: 2 },
  { id: 'triremes', name: 'Triremes', track: 'maritime', cost: 85, prerequisites: ['navigation'], unlocks: [], unlocksUnits: ['trireme', 'galleon'], era: 3 },
  { id: 'harbor-building', name: 'Harbor Building', track: 'maritime', cost: 80, prerequisites: ['galleys'], unlocks: ['Maritime infrastructure — prerequisite for Caravels'], era: 3 },
  { id: 'caravels', name: 'Caravels', track: 'maritime', cost: 125, prerequisites: ['triremes', 'harbor-building'], unlocks: [], unlocksUnits: ['steamship'], era: 4 },
  { id: 'naval-warfare', name: 'Naval Warfare', track: 'maritime', cost: 130, prerequisites: ['triremes'], unlocks: ['Unlocks advanced naval tactics'], era: 4 },

  // === METALLURGY TRACK (8 techs, new) ===
  { id: 'copper-working', name: 'Copper Working', track: 'metallurgy', cost: 5, prerequisites: [], unlocks: ['Copper tools'], era: 1 },
  { id: 'smelting', name: 'Smelting', track: 'metallurgy', cost: 10, prerequisites: ['copper-working'], unlocks: ['Metalworking traditions'], era: 1 },
  { id: 'bronze-casting', name: 'Bronze Casting', track: 'metallurgy', cost: 45, prerequisites: ['smelting', 'bronze-working'], unlocks: ['Bronze armor'], era: 2 },
  { id: 'tool-making', name: 'Tool Making', track: 'metallurgy', cost: 40, prerequisites: ['smelting'], unlocks: ['Improved tools'], era: 2 },
  { id: 'iron-smelting', name: 'Iron Smelting', track: 'metallurgy', cost: 85, prerequisites: ['bronze-casting'], unlocks: ['Iron ore'], era: 3 },
  { id: 'alloys', name: 'Alloys', track: 'metallurgy', cost: 80, prerequisites: ['bronze-casting', 'tool-making'], unlocks: ['Alloy weapons'], era: 3 },
  { id: 'steel-forging', name: 'Steel Forging', track: 'metallurgy', cost: 125, prerequisites: ['iron-smelting', 'alloys'], unlocks: ['Steel weapons'], era: 4 },
  { id: 'armor-craft', name: 'Armor Craft', track: 'metallurgy', cost: 120, prerequisites: ['iron-smelting'], unlocks: ['Plate armor'], era: 4 },

  // === CONSTRUCTION TRACK (8 techs, new) ===
  { id: 'mud-brick', name: 'Mud Brick', track: 'construction', cost: 5, prerequisites: [], unlocks: ['Early defensive construction'], era: 1 },
  { id: 'thatching', name: 'Thatching', track: 'construction', cost: 10, prerequisites: ['mud-brick'], unlocks: ['Basic shelter-building traditions'], era: 1 },
  { id: 'masonry', name: 'Masonry', track: 'construction', cost: 45, prerequisites: ['thatching'], unlocks: ['Stone construction traditions'], era: 2 },
  { id: 'foundations', name: 'Foundations', track: 'construction', cost: 10, prerequisites: ['mud-brick'], unlocks: ['Structural engineering traditions'], era: 2 },
  { id: 'aqueducts', name: 'Aqueducts', track: 'construction', cost: 85, prerequisites: ['masonry', 'engineering'], unlocks: ['Water management traditions'], era: 3 },
  { id: 'arches', name: 'Arches', track: 'construction', cost: 80, prerequisites: ['masonry', 'foundations'], unlocks: ['Advanced masonry techniques'], era: 3 },
  { id: 'fortresses', name: 'Fortresses', track: 'construction', cost: 125, prerequisites: ['arches'], unlocks: ['Fortified strongpoints doctrine'], era: 4 },
  { id: 'city-planning', name: 'City Planning', track: 'construction', cost: 130, prerequisites: ['aqueducts', 'arches'], unlocks: ['Urban planning traditions'], era: 4 },

  // === COMMUNICATION TRACK (9 techs, with Slice 3 late-era scaffolding) ===
  { id: 'drums', name: 'Drums', track: 'communication', cost: 5, prerequisites: [], unlocks: ['Signal drums'], era: 1 },
  { id: 'smoke-signals', name: 'Smoke Signals', track: 'communication', cost: 10, prerequisites: ['drums'], unlocks: ['Early warning traditions'], era: 1 },
  { id: 'pictographs', name: 'Pictographs', track: 'communication', cost: 45, prerequisites: ['smoke-signals', 'writing'], unlocks: ['Record keeping'], era: 2 },
  { id: 'messengers', name: 'Messengers', track: 'communication', cost: 40, prerequisites: ['smoke-signals'], unlocks: ['Messenger relay traditions'], era: 2 },
  { id: 'courier-networks', name: 'Courier Networks', track: 'communication', cost: 80, prerequisites: ['messengers', 'pictographs'], unlocks: ['Long-distance courier traditions'], era: 3 },
  { id: 'ciphers', name: 'Ciphers', track: 'communication', cost: 85, prerequisites: ['pictographs'], unlocks: ['Encoded messages'], era: 3 },
  { id: 'printing', name: 'Printing', track: 'communication', cost: 120, prerequisites: ['courier-networks'], unlocks: ['Printed media traditions'], unlocksBuildings: ['imperial_archive'], era: 4 },
  { id: 'diplomats', name: 'Diplomats', track: 'communication', cost: 130, prerequisites: ['courier-networks', 'ciphers'], unlocks: ['Formal diplomatic traditions'], era: 4 },

  // === ESPIONAGE TRACK (8 techs — M4a stages 1-2, expanded in later milestones) ===
  { id: 'espionage-scouting', name: 'Scouting Networks', track: 'espionage', cost: 40, prerequisites: [], unlocks: ['Recruit spies', 'Passive city surveillance', 'Scout Area mission', 'Monitor Troops mission'], unlocksUnits: ['spy_scout'], unlocksBuildings: ['safehouse'], era: 1 },
  { id: 'lookouts', name: 'Lookouts', track: 'espionage', cost: 25, prerequisites: ['espionage-scouting'], unlocks: [], unlocksUnits: ['scout_hound'], era: 1 },
  { id: 'espionage-informants', name: 'Informant Rings', track: 'espionage', cost: 80, prerequisites: ['espionage-scouting'], unlocks: ['Gather Intel mission', 'Identify Resources mission', 'Monitor Diplomacy mission', 'Second spy slot'], unlocksUnits: ['spy_informant'], unlocksBuildings: ['intelligence-agency'], era: 2 },
  { id: 'disguise', name: 'Disguise', track: 'espionage', cost: 40, prerequisites: ['lookouts'], unlocks: ['Spy disguise'], era: 2 },
  { id: 'spy-networks', name: 'Spy Networks', track: 'espionage', cost: 85, prerequisites: ['espionage-informants', 'disguise'], unlocks: ['Spy ring'], unlocksUnits: ['spy_agent'], era: 3 },
  { id: 'sabotage', name: 'Sabotage', track: 'espionage', cost: 80, prerequisites: ['espionage-informants'], unlocks: ['Saboteur'], era: 3 },
  { id: 'cryptography', name: 'Cryptography', track: 'espionage', cost: 125, prerequisites: ['spy-networks'], unlocks: ['Cipher bureau'], unlocksUnits: ['spy_operative'], era: 4 },
  { id: 'counter-intelligence', name: 'Counter-Intelligence', track: 'espionage', cost: 130, prerequisites: ['spy-networks', 'sabotage'], unlocks: [], unlocksBuildings: ['security-bureau'], era: 4 },

  // === SPIRITUALITY TRACK (8 techs, new) ===
  { id: 'animism', name: 'Animism', track: 'spirituality', cost: 5, prerequisites: [], unlocks: ['Early spirit-worship traditions'], unlocksBuildings: ['sacred_grove'], era: 1 },
  { id: 'burial-rites', name: 'Burial Rites', track: 'spirituality', cost: 10, prerequisites: ['animism'], unlocks: ['Ancestral burial traditions'], era: 1 },
  { id: 'shamanism', name: 'Shamanism', track: 'spirituality', cost: 45, prerequisites: ['burial-rites', 'tribal-council'], unlocks: ['Shamanic ritual traditions'], era: 2 },
  { id: 'sacred-sites', name: 'Sacred Sites', track: 'spirituality', cost: 40, prerequisites: ['burial-rites'], unlocks: ['Sacred-site veneration traditions'], era: 2 },
  { id: 'temples', name: 'Temples', track: 'spirituality', cost: 85, prerequisites: ['shamanism', 'sacred-sites'], unlocks: ['Organized worship traditions'], era: 3 },
  { id: 'priesthood', name: 'Priesthood', track: 'spirituality', cost: 80, prerequisites: ['shamanism'], unlocks: ['Priestly class traditions'], era: 3 },
  { id: 'pilgrimages', name: 'Pilgrimages', track: 'spirituality', cost: 120, prerequisites: ['temples'], unlocks: ['Pilgrimage traditions'], era: 4 },
  { id: 'theology-tech', name: 'Theology', track: 'spirituality', cost: 130, prerequisites: ['temples', 'priesthood'], unlocks: ['Organized doctrine'], era: 4 },
];

