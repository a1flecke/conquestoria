import type { Tech } from '@/core/types';

const ERA_9_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'tank-warfare', name: 'Tank Warfare', track: 'military', cost: 260,
    prerequisites: ['mass-firepower', 'bessemer-steel'],
    unlocks: ['Armored vehicles break through entrenched lines; land combat transformed'],
    unlocksUnits: ['tank'], unlocksBuildings: ['tank_depot'], era: 9 },
  { id: 'armored-tactics', name: 'Armored Tactics', track: 'military', cost: 265,
    prerequisites: ['tank-warfare', 'general-mobilization'],
    unlocks: ['Combined-arms doctrine; tanks gain +5 strength; machine gunners obsolete'],
    unlocksBuildings: ['mobilization_act'], era: 9 },
  { id: 'air-superiority', name: 'Air Superiority', track: 'military', cost: 275,
    prerequisites: ['aviation', 'general-mobilization'],
    unlocks: ['Biplane fighters can attack land and naval units; anti-aircraft batteries protect ground forces'],
    unlocksUnits: ['biplane'],
    unlocksBuildings: ['anti_air_battery'], era: 9 },

  // ECONOMY (2)
  { id: 'petroleum-industry', name: 'Petroleum Industry', track: 'economy', cost: 265,
    prerequisites: ['industrial-monopoly', 'structural-engineering'],
    unlocks: ['Crude oil extraction and refining; fuel powers the modern economy'],
    unlocksBuildings: ['oil_refinery'], era: 9 },
  { id: 'fordist-manufacturing', name: 'Fordist Manufacturing', track: 'economy', cost: 270,
    prerequisites: ['industrial-monopoly', 'bessemer-steel'],
    unlocks: ['Assembly-line factories multiply industrial output; goods become affordable'],
    unlocksBuildings: ['assembly_line'], era: 9 },

  // SCIENCE (2)
  { id: 'quantum-theory', name: 'Quantum Theory', track: 'science', cost: 275,
    prerequisites: ['engineering-exhibition', 'dialectical-materialism'],
    unlocks: ['+2 science all cities; atomic-scale physics unlocks the next frontier of research'],
    unlocksBuildings: ['research_institute'], era: 9 },
  { id: 'aviation', name: 'Aviation', track: 'science', cost: 280,
    prerequisites: ['structural-engineering', 'aluminium-smelting'],
    unlocks: ['Powered flight achieved; military and civilian aviation begins'],
    unlocksBuildings: ['airfield'], era: 9 },

  // CIVICS (2)
  { id: 'universal-suffrage', name: 'Universal Suffrage', track: 'civics', cost: 265,
    prerequisites: ['labor-rights', 'public-records'],
    unlocks: ['+1 food all cities; democratic legitimacy accelerates civic development'], era: 9 },
  { id: 'welfare-state', name: 'Welfare State', track: 'civics', cost: 270,
    prerequisites: ['labor-rights', 'social-justice'],
    unlocks: ['State-funded insurance and pensions; citizens healthier and more productive'],
    unlocksBuildings: ['national_insurance', 'national_census'], era: 9 },

  // EXPLORATION (2)
  { id: 'motorized-transport', name: 'Motorized Transport', track: 'exploration', cost: 265,
    prerequisites: ['transcontinental-rail', 'petroleum-industry'],
    unlocks: ['Automobiles and trucks reshape logistics; supply chains reach further than ever'], era: 9 },
  { id: 'aerial-survey', name: 'Aerial Survey', track: 'exploration', cost: 260,
    prerequisites: ['imperial-survey', 'aviation'],
    unlocks: ['Aircraft map terrain from above; scouts reveal 50% more territory per turn'], era: 9 },

  // AGRICULTURE (2)
  { id: 'chemical-fertilizers', name: 'Chemical Fertilizers', track: 'agriculture', cost: 265,
    prerequisites: ['scientific-breeding', 'refrigeration'],
    unlocks: ['+2 food per farm improvement; synthetic nitrogen transforms crop yields'], era: 9 },
  { id: 'large-scale-irrigation', name: 'Large-Scale Irrigation', track: 'agriculture', cost: 260,
    prerequisites: ['sanitation-networks', 'refrigeration'],
    unlocks: ['+1 food all cities; engineered irrigation networks feed growing populations'], era: 9 },

  // MEDICINE (2)
  { id: 'blood-transfusion', name: 'Blood Transfusion', track: 'medicine', cost: 270,
    prerequisites: ['antiseptic-surgery', 'public-health-service'],
    unlocks: ['Units heal +4 HP per turn in friendly cities; battlefield survival rates soar'], era: 9 },
  { id: 'modern-psychiatry', name: 'Modern Psychiatry', track: 'medicine', cost: 265,
    prerequisites: ['public-health-service', 'pragmatism'],
    unlocks: ['+1 food all cities with a sanatorium; mental health services reduce social unrest'], era: 9 },

  // PHILOSOPHY (2)
  { id: 'pragmatic-empiricism', name: 'Pragmatic Empiricism', track: 'philosophy', cost: 265,
    prerequisites: ['pragmatism', 'dialectical-materialism'],
    unlocks: ['+2 science cities with a library; evidence-based thinking transforms scholarship'], era: 9 },
  { id: 'existentialism', name: 'Existentialism', track: 'philosophy', cost: 270,
    prerequisites: ['dialectical-materialism', 'grand-opera'],
    unlocks: ['+1 gold per culture building empire-wide; modern philosophy drives creative expression'], era: 9 },

  // ARTS (2)
  { id: 'cinema', name: 'Cinema', track: 'arts', cost: 265,
    prerequisites: ['impressionism', 'grand-opera'],
    unlocks: ['Moving pictures captivate mass audiences; cultural reach extends across borders'],
    unlocksBuildings: ['film_studio'], era: 9 },
  { id: 'jazz-age', name: 'Jazz Age', track: 'arts', cost: 260,
    prerequisites: ['impressionism', 'telephony'],
    unlocks: ['+2 gold per city with an opera house; jazz culture electrifies urban life'], era: 9 },

  // MARITIME (2)
  { id: 'submarine-warfare', name: 'Submarine Warfare', track: 'maritime', cost: 275,
    prerequisites: ['torpedo-warfare', 'naval-armor'],
    unlocks: ['Undersea warfare reshapes naval combat; pre-dreadnoughts obsolete'],
    unlocksUnits: ['submarine'], era: 9 },
  { id: 'convoy-system', name: 'Convoy System', track: 'maritime', cost: 270,
    prerequisites: ['torpedo-warfare', 'transcontinental-rail'],
    unlocks: ['+2 gold per trade route empire-wide; coordinated convoy escorts protect commerce'], era: 9 },

  // METALLURGY (2)
  { id: 'aluminium-smelting', name: 'Aluminium Smelting', track: 'metallurgy', cost: 265,
    prerequisites: ['bessemer-steel', 'structural-engineering'],
    unlocks: ['+1 production all cities; lightweight aluminium enables aviation and modern machinery'], era: 9 },
  { id: 'tungsten-alloys', name: 'Tungsten Alloys', track: 'metallurgy', cost: 270,
    prerequisites: ['bessemer-steel', 'reinforced-concrete'],
    unlocks: ['+2 strength all military units; heat-resistant tungsten forges harder weapons and armor'], era: 9 },

  // CONSTRUCTION (2)
  { id: 'hydroelectric-power', name: 'Hydroelectric Power', track: 'construction', cost: 275,
    prerequisites: ['sanitation-networks', 'reinforced-concrete'],
    unlocks: ['Dammed rivers generate electricity; cities on rivers gain +2 production'],
    unlocksBuildings: ['hydroelectric_dam'], era: 9 },
  { id: 'steel-skyscrapers', name: 'Steel Skyscrapers', track: 'construction', cost: 270,
    prerequisites: ['reinforced-concrete', 'structural-engineering'],
    unlocks: ['+2 production in cities with 6 or more buildings; vertical construction transforms urban density'], era: 9 },

  // COMMUNICATION (2)
  { id: 'radio-broadcast', name: 'Radio Broadcast', track: 'communication', cost: 265,
    prerequisites: ['telephony', 'shorthand-press'],
    unlocks: ['Mass radio reaches every household; empire-wide information flow accelerates'],
    unlocksBuildings: ['radio_station'], era: 9 },
  { id: 'wireless-telegraph', name: 'Wireless Telegraph', track: 'communication', cost: 260,
    prerequisites: ['shorthand-press', 'telephony'],
    unlocks: ['+2 gold empire-wide; wireless signals coordinate commerce and intelligence without cables'], era: 9 },

  // ESPIONAGE (2)
  { id: 'counterintelligence', name: 'Counterintelligence', track: 'espionage', cost: 265,
    prerequisites: ['political-intelligence', 'disinformation-bureau'],
    unlocks: ['Enemy spy missions in your cities suffer -30% success rate; double-agent networks protect secrets'], era: 9 },
  { id: 'propaganda-campaigns', name: 'Propaganda Campaigns', track: 'espionage', cost: 270,
    prerequisites: ['disinformation-bureau', 'radio-broadcast'],
    unlocks: ['+2 gold per city with a film studio or radio station; state media shapes public opinion'],
    unlocksBuildings: ['state_broadcasting'], era: 9 },

  // SPIRITUALITY (2)
  { id: 'religious-modernism', name: 'Religious Modernism', track: 'spirituality', cost: 260,
    prerequisites: ['modernist-theology', 'social-justice'],
    unlocks: ['+1 science in cities with any religion building; faith adapts to the modern world'], era: 9 },
  { id: 'secular-humanism', name: 'Secular Humanism', track: 'spirituality', cost: 265,
    prerequisites: ['social-justice', 'pragmatism'],
    unlocks: ['+1 food all cities; humanist ethics grounds social policy in human welfare'], era: 9 },
];

export const TECH_TREE_ERAS_9: Tech[] = [
  ...ERA_9_TECHS,
];
