import type { Tech } from '@/core/types';

const ERA_11_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'helicopter-warfare', name: 'Helicopter Warfare', track: 'military', cost: 1305,
    prerequisites: ['jet-aviation', 'carrier-warfare'],
    unlocks: ['Attack helicopters provide close air support and troop transport; air cavalry transforms combined-arms doctrine'],
    unlocksUnits: ['attack_helicopter'], unlocksBuildings: ['helicopter_base'], era: 11 },
  { id: 'icbm-development', name: 'ICBM Development', track: 'military', cost: 1305,
    prerequisites: ['nuclear-weapons', 'rocketry'],
    unlocks: ['Intercontinental ballistic missiles carry nuclear warheads across continents; mutual deterrence reshapes grand strategy'],
    unlocksBuildings: ['missile_silo', 'strategic_air_command'], era: 11 },

  // ECONOMY (2)
  { id: 'stagflation-response', name: 'Stagflation Response', track: 'economy', cost: 905,
    prerequisites: ['keynesian-economics', 'consumer-boom'],
    unlocks: ['+3 gold all cities; oil shocks and stagflation force monetary discipline and structural economic reform'], era: 11 },
  { id: 'petrodollar-system', name: 'Petrodollar System', track: 'economy', cost: 705,
    prerequisites: ['consumer-boom', 'highway-network'],
    unlocks: ['+2 gold per trade route empire-wide; oil-denominated exchange anchors the global financial system'], era: 11 },

  // SCIENCE (2)
  { id: 'integrated-circuits', name: 'Integrated Circuits', track: 'science', cost: 1305,
    prerequisites: ['electronic-computing', 'titanium-processing'],
    unlocks: ['+3 science in cities with a research institute; miniaturised transistors on silicon multiply computing power a thousandfold'],
    unlocksBuildings: ['semiconductor_fab'], era: 11 },
  { id: 'molecular-biology', name: 'Molecular Biology', track: 'science', cost: 1305,
    prerequisites: ['nuclear-physics', 'penicillin'],
    unlocks: ['+2 science empire-wide; the double helix unlocks breakthroughs in medicine, agriculture, and materials science'],
    unlocksBuildings: ['genetic_research_lab'], era: 11 },

  // CIVICS (2)
  { id: 'arms-control-negotiations', name: 'Arms Control Negotiations', track: 'civics', cost: 905,
    prerequisites: ['decolonization', 'international-institutions'],
    unlocks: ['+2 gold empire-wide; superpowers agree to arsenal limits, opening a decade of diplomatic thaw'],
    unlocksBuildings: ['arms_control_treaty'], era: 11 },
  { id: 'civil-rights-legislation', name: 'Civil Rights Legislation', track: 'civics', cost: 905,
    prerequisites: ['human-rights-framework', 'universal-healthcare'],
    unlocks: ['+2 food all cities; equal rights movements reshape democratic societies and expand civic participation'],
    unlocksBuildings: ['environmental_agency'], era: 11 },

  // EXPLORATION (2)
  { id: 'space-exploration', name: 'Space Exploration', track: 'exploration', cost: 1305,
    prerequisites: ['rocketry', 'radar-systems'],
    unlocks: ['Humans and satellites leave Earth; the space race reshapes science, strategy, and national prestige'],
    unlocksBuildings: ['space_center'], era: 11 },
  { id: 'deep-sea-drilling', name: 'Deep-Sea Drilling', track: 'exploration', cost: 705,
    prerequisites: ['polar-operations', 'synthetic-polymers'],
    unlocks: ['+1 food +2 gold empire-wide; engineering platforms tap oil and mineral reserves on the ocean floor'], era: 11 },

  // AGRICULTURE (2)
  { id: 'green-revolution-crops', name: 'Green Revolution Crops', track: 'agriculture', cost: 905,
    prerequisites: ['pesticides', 'mechanized-agriculture'],
    unlocks: ['+2 food per farm improvement; high-yield dwarf wheat and rice strains dramatically increase caloric output per acre'],
    unlocksBuildings: ['agricultural_station', 'green_revolution_program'], era: 11 },
  { id: 'aquaculture', name: 'Aquaculture', track: 'agriculture', cost: 705,
    prerequisites: ['mechanized-agriculture', 'polar-operations'],
    unlocks: ['+2 food all cities; fish farming and mariculture extend food supply beyond natural ocean stocks'], era: 11 },

  // MEDICINE (2)
  { id: 'organ-transplantation', name: 'Organ Transplantation', track: 'medicine', cost: 650,
    prerequisites: ['penicillin', 'universal-healthcare'],
    unlocks: ['Units heal +3 HP per turn in friendly cities; surgical transplant techniques save lives previously considered lost'],
    unlocksBuildings: ['transplant_hospital'], era: 11 },
  { id: 'vaccination-campaigns', name: 'Vaccination Campaigns', track: 'medicine', cost: 705,
    prerequisites: ['universal-healthcare', 'liberation-theology'],
    unlocks: ['+2 food all cities; mass immunization eliminates ancient diseases and raises life expectancy globally'], era: 11 },

  // PHILOSOPHY (2)
  { id: 'structuralism', name: 'Structuralism', track: 'philosophy', cost: 905,
    prerequisites: ['post-colonial-theory', 'human-rights-framework'],
    unlocks: ['+2 science empire-wide; systematic analysis reveals hidden patterns in language, culture, and society'], era: 11 },
  { id: 'postmodernism', name: 'Postmodernism', track: 'philosophy', cost: 625,
    prerequisites: ['post-colonial-theory', 'abstract-expressionism'],
    unlocks: ['+1 gold per culture building empire-wide; suspicion of grand narratives opens space for pluralism and cultural diversity'], era: 11 },

  // ARTS (2)
  { id: 'pop-art', name: 'Pop Art', track: 'arts', cost: 705,
    prerequisites: ['abstract-expressionism', 'consumer-boom'],
    unlocks: ['+2 gold in cities with an art gallery; mass-production aesthetics cross the boundary between commerce and fine art'], era: 11 },
  { id: 'counterculture', name: 'Counterculture', track: 'arts', cost: 905,
    prerequisites: ['rock-and-roll', 'liberation-theology'],
    unlocks: ['+2 gold in cities with a concert hall; youth rebellion drives music, cinema, and fashion revolution'], era: 11 },

  // MARITIME (2)
  { id: 'nuclear-submarines', name: 'Nuclear Submarines', track: 'maritime', cost: 1305,
    prerequisites: ['carrier-warfare', 'nuclear-power'],
    unlocks: ['Nuclear reactors allow indefinite underwater range; submarine-launched ballistic missiles extend strategic deterrence beneath the seas'],
    unlocksUnits: ['missile_submarine'], era: 11 },
  { id: 'container-shipping', name: 'Container Shipping', track: 'maritime', cost: 705,
    prerequisites: ['amphibious-assault', 'highway-network'],
    unlocks: ['Standardised steel containers slash global freight costs; intermodal networks connect factory floors to markets worldwide'],
    unlocksBuildings: ['container_port'], era: 11 },

  // METALLURGY (2)
  { id: 'carbon-fiber', name: 'Carbon Fibre', track: 'metallurgy', cost: 650,
    prerequisites: ['titanium-processing', 'synthetic-polymers'],
    unlocks: ['+2 strength all military units; lightweight carbon composite forges stronger aircraft frames and armored vehicles'], era: 11 },
  { id: 'precision-engineering', name: 'Precision Engineering', track: 'metallurgy', cost: 905,
    prerequisites: ['titanium-processing', 'electronic-computing'],
    unlocks: ['+2 production in cities with a factory; computer-controlled machining achieves tolerances impossible by hand'], era: 11 },

  // CONSTRUCTION (2)
  { id: 'megastructures', name: 'Megastructures', track: 'construction', cost: 1305,
    prerequisites: ['nuclear-power', 'highway-network'],
    unlocks: ['+2 production all cities; precast concrete enables monolithic civic megaprojects and modular housing at unprecedented scale'], era: 11 },
  { id: 'offshore-platforms', name: 'Offshore Platforms', track: 'construction', cost: 905,
    prerequisites: ['nuclear-power', 'polar-operations'],
    unlocks: ['+2 gold +1 production empire-wide; fixed drilling platforms transform shallow-sea resource extraction into industrial-scale operations'], era: 11 },

  // COMMUNICATION (2)
  { id: 'arpanet', name: 'ARPANET', track: 'communication', cost: 1305,
    prerequisites: ['electronic-computing', 'radar-systems'],
    unlocks: ['Packet-switched networks connect research institutions across continents; the first internet accelerates scientific collaboration'],
    unlocksBuildings: ['research_network'], era: 11 },
  { id: 'satellite-television', name: 'Satellite Television', track: 'communication', cost: 905,
    prerequisites: ['television', 'rocketry'],
    unlocks: ['+2 gold in cities with a film studio or radio station; geosynchronous satellites deliver broadcast to remote audiences worldwide'], era: 11 },

  // ESPIONAGE (2)
  { id: 'satellite-surveillance', name: 'Satellite Surveillance', track: 'espionage', cost: 1305,
    prerequisites: ['signals-intelligence', 'rocketry'],
    unlocks: ['Spy satellites photograph denied territory from orbit; ground forces can no longer move unseen in daylight'],
    unlocksBuildings: ['surveillance_agency'], era: 11 },
  { id: 'black-ops-programs', name: 'Black Ops Programs', track: 'espionage', cost: 905,
    prerequisites: ['cold-war-networks', 'signals-intelligence'],
    unlocks: ['+2 gold empire-wide; intelligence agencies fund coups, sabotage, and proxy conflicts across the world'], era: 11 },

  // SPIRITUALITY (2)
  { id: 'ecumenical-movement', name: 'Ecumenical Movement', track: 'spirituality', cost: 705,
    prerequisites: ['liberation-theology', 'interfaith-council'],
    unlocks: ['+1 science +1 food empire-wide; Christian and inter-faith reconciliation movements build civic bridges across traditions'], era: 11 },
  { id: 'new-age-spirituality', name: 'New Age Spirituality', track: 'spirituality', cost: 705,
    prerequisites: ['interfaith-council', 'rock-and-roll'],
    unlocks: ['+2 gold in cities with a temple or monastery; eastern philosophy and nature mysticism enter western popular culture'], era: 11 },
];

export const TECH_TREE_ERAS_11: Tech[] = [
  ...ERA_11_TECHS,
];
