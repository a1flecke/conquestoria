import type { Tech } from '@/core/types';

const ERA_10_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'jet-aviation', name: 'Jet Aviation', track: 'military', cost: 1895,
    prerequisites: ['air-superiority', 'aluminium-smelting'],
    unlocks: ['Swept-wing jet fighters replace biplanes; air power reaches new altitudes and speeds'],
    unlocksUnits: ['jet_fighter'], era: 10 },
  { id: 'nuclear-weapons', name: 'Nuclear Weapons', track: 'military', cost: 1895,
    prerequisites: ['quantum-theory', 'petroleum-industry'],
    unlocks: ['Atomic deterrence reshapes grand strategy'],
    unlocksUnits: ['bomber'], unlocksBuildings: ['nuclear_arsenal', 'manhattan_project'], era: 10 },

  // ECONOMY (2)
  { id: 'keynesian-economics', name: 'Keynesian Economics', track: 'economy', cost: 1310,
    prerequisites: ['welfare-state', 'fordist-manufacturing'],
    unlocks: ['+2 gold all cities; state investment cycles stabilise the economy through boom and bust'],
    unlocksBuildings: ['central_bank', 'postwar_reconstruction'], era: 10 },
  { id: 'consumer-boom', name: 'Consumer Boom', track: 'economy', cost: 1310,
    prerequisites: ['fordist-manufacturing', 'radio-broadcast'],
    unlocks: ['+2 gold in cities with a market; mass-produced goods drive peacetime prosperity'], era: 10 },

  // SCIENCE (2)
  { id: 'nuclear-physics', name: 'Nuclear Physics', track: 'science', cost: 1895,
    prerequisites: ['quantum-theory', 'tungsten-alloys'],
    unlocks: ['+3 science in cities with a research institute; atomic science reaches critical mass', 'Reveal Uranium resource'],
    unlocksBuildings: ['atomic_laboratory'], era: 10 },
  // MR10: re-homed from a stub — nuclear-theory is no longer a legendary-wonder gate.
  // Give it a real effect instead of sitting inert as pure flavor text (see cityFlat
  // row in tech-yield-definitions.ts).
  { id: 'nuclear-theory', name: 'Nuclear Theory', track: 'science', cost: 1895,
    prerequisites: ['quantum-theory'],
    unlocks: ['+2 science empire-wide'], era: 10, countsForEraAdvancement: false },
  { id: 'radar-systems', name: 'Radar Systems', track: 'science', cost: 1310,
    prerequisites: ['radio-broadcast', 'aviation'],
    unlocks: ['+2 science empire-wide; radar coverage accelerates navigation and early-warning networks'],
    unlocksBuildings: ['radar_station'], era: 10 },

  // CIVICS (2)
  { id: 'decolonization', name: 'Decolonization', track: 'civics', cost: 1310,
    prerequisites: ['universal-suffrage', 'propaganda-campaigns'],
    unlocks: ['+2 gold empire-wide; emerging nations pursue self-determination and reshape world order'], era: 10 },
  { id: 'international-institutions', name: 'International Institutions', track: 'civics', cost: 1310,
    prerequisites: ['universal-suffrage', 'welfare-state'],
    unlocks: ['+1 gold +1 science empire-wide; multilateral bodies manage trade, disputes, and humanitarian aid'],
    unlocksBuildings: ['un_delegation'], era: 10 },

  // EXPLORATION (2)
  { id: 'rocketry', name: 'Rocketry', track: 'exploration', cost: 1895,
    prerequisites: ['aerial-survey', 'aluminium-smelting'],
    unlocks: ['+2 science in cities with a research institute; rocket propulsion points toward the upper atmosphere'],
    unlocksBuildings: ['rocket_program', 'space_program_initiative'], era: 10 },
  { id: 'polar-operations', name: 'Polar Operations', track: 'exploration', cost: 1020,
    prerequisites: ['motorized-transport', 'aerial-survey'],
    unlocks: ['+1 food +1 production in tundra and snow tiles; polar expeditions chart strategic resources at the edges of the map'], era: 10 },

  // AGRICULTURE (2)
  { id: 'pesticides', name: 'Pesticides', track: 'agriculture', cost: 1310,
    prerequisites: ['chemical-fertilizers', 'petroleum-industry'],
    unlocks: ['+1 food per farm improvement; synthetic pest control protects harvests at industrial scale'], era: 10 },
  { id: 'mechanized-agriculture', name: 'Mechanized Agriculture', track: 'agriculture', cost: 1310,
    prerequisites: ['large-scale-irrigation', 'motorized-transport'],
    unlocks: ['+2 production in cities with a granary; tractor-powered fields displace draft-animal farming'], era: 10 },

  // MEDICINE (2)
  { id: 'penicillin', name: 'Penicillin', track: 'medicine', cost: 945,
    prerequisites: ['blood-transfusion', 'modern-psychiatry'],
    unlocks: ['Units heal +3 HP per turn in friendly territory; antibiotic medicine transforms survival on and off the battlefield'], era: 10 },
  { id: 'universal-healthcare', name: 'Universal Healthcare', track: 'medicine', cost: 1310,
    prerequisites: ['modern-psychiatry', 'welfare-state'],
    unlocks: ['+2 food all cities; publicly funded clinics raise life expectancy across the empire'],
    unlocksBuildings: ['public_hospital'], era: 10 },

  // PHILOSOPHY (2)
  { id: 'post-colonial-theory', name: 'Post-Colonial Theory', track: 'philosophy', cost: 1310,
    prerequisites: ['existentialism', 'decolonization'],
    unlocks: ['+1 science all cities; critical reassessment of empire opens new intellectual horizons'], era: 10 },
  { id: 'human-rights-framework', name: 'Human Rights Framework', track: 'philosophy', cost: 1310,
    prerequisites: ['pragmatic-empiricism', 'universal-suffrage'],
    unlocks: ['+1 gold all cities; universal rights doctrine legitimises civic investment and social cohesion'], era: 10 },

  // ARTS (2)
  { id: 'abstract-expressionism', name: 'Abstract Expressionism', track: 'arts', cost: 1310,
    prerequisites: ['cinema', 'existentialism'],
    unlocks: ['+2 gold in cities with an art gallery; raw emotional abstraction dominates postwar cultural life'], era: 10 },
  { id: 'rock-and-roll', name: 'Rock and Roll', track: 'arts', cost: 1310,
    prerequisites: ['jazz-age', 'radio-broadcast'],
    unlocks: ['+2 gold in cities with a concert hall; amplified popular music crosses class and cultural boundaries overnight'], era: 10 },

  // MARITIME (2)
  { id: 'carrier-warfare', name: 'Carrier Warfare', track: 'maritime', cost: 1895,
    prerequisites: ['submarine-warfare', 'air-superiority'],
    unlocks: ['Mobile airfields project naval power across oceans; sea control no longer requires fixed shore bases'],
    unlocksUnits: ['carrier', 'destroyer'], era: 10 },
  { id: 'amphibious-assault', name: 'Amphibious Assault', track: 'maritime', cost: 945,
    prerequisites: ['convoy-system', 'tank-warfare'],
    unlocks: ['+3 attack strength for all naval units against coastal cities; coordinated sea-to-land operations rewrite grand strategy'], era: 10 },

  // METALLURGY (2)
  { id: 'titanium-processing', name: 'Titanium Processing', track: 'metallurgy', cost: 1310,
    prerequisites: ['aluminium-smelting', 'tungsten-alloys'],
    unlocks: ['+2 production in cities with a factory; titanium unlocks aerospace frames and precision tooling'], era: 10 },
  { id: 'synthetic-polymers', name: 'Synthetic Polymers', track: 'metallurgy', cost: 1310,
    prerequisites: ['petroleum-industry', 'tungsten-alloys'],
    unlocks: ['+1 production all cities; plastics replace scarce natural materials across manufacturing'],
    unlocksBuildings: ['chemical_plant'], era: 10 },

  // CONSTRUCTION (2)
  { id: 'nuclear-power', name: 'Nuclear Power', track: 'construction', cost: 1895,
    prerequisites: ['nuclear-physics', 'hydroelectric-power'],
    unlocks: ['Atomic reactors generate electricity without fuel costs; the nuclear power plant already provides ample production on its own'],
    unlocksBuildings: ['nuclear_power_plant'], era: 10 },
  { id: 'highway-network', name: 'Highway Network', track: 'construction', cost: 1310,
    prerequisites: ['motorized-transport', 'steel-skyscrapers'],
    unlocks: ['+2 gold empire-wide; interstate highway networks slash transit costs and connect distant cities'],
    unlocksUnits: ['freight_convoy'], era: 10 },

  // COMMUNICATION (2)
  { id: 'television', name: 'Television', track: 'communication', cost: 1310,
    prerequisites: ['cinema', 'radio-broadcast'],
    unlocks: ['+2 gold in cities with a film studio or radio station; moving pictures in every living room reshape mass culture'],
    unlocksBuildings: ['television_station'], era: 10 },
  { id: 'electronic-computing', name: 'Electronic Computing', track: 'communication', cost: 1310,
    prerequisites: ['radar-systems', 'quantum-theory'],
    unlocks: ['+3 science in cities with a research institute; stored-program computers accelerate scientific calculation and logistics'], era: 10 },

  // ESPIONAGE (2)
  { id: 'signals-intelligence', name: 'Signals Intelligence', track: 'espionage', cost: 1310,
    prerequisites: ['counterintelligence', 'radar-systems'],
    unlocks: ['Enemy spy mission success reduced -20% empire-wide; intercepted signals expose movements before they happen'],
    unlocksBuildings: ['signals_bureau'], era: 10 },
  { id: 'cold-war-networks', name: 'Cold War Networks', track: 'espionage', cost: 1310,
    prerequisites: ['propaganda-campaigns', 'counterintelligence'],
    unlocks: ['+2 gold empire-wide; shadow networks of assets, couriers, and double agents span the globe'], era: 10 },
  // MR10: re-homed from a stub — digital-surveillance is no longer a legendary-wonder gate.
  { id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 1310,
    prerequisites: ['counterintelligence', 'signals-intelligence'],
    unlocks: ['Satellite Surveillance', 'Misinformation Campaign'], era: 10 },

  // SPIRITUALITY (2)
  { id: 'liberation-theology', name: 'Liberation Theology', track: 'spirituality', cost: 1310,
    prerequisites: ['religious-modernism', 'secular-humanism'],
    unlocks: ['+1 food in cities with a temple; faith-driven reform movements empower the disenfranchised'], era: 10 },
  { id: 'interfaith-council', name: 'Interfaith Council', track: 'spirituality', cost: 905,
    prerequisites: ['secular-humanism', 'religious-modernism'],
    unlocks: ['+1 science in cities with any religion building; cross-tradition dialogue enriches scholarship and civic life'], era: 10 },
];

export const TECH_TREE_ERAS_10: Tech[] = [
  ...ERA_10_TECHS,
];
