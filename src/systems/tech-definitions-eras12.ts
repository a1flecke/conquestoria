import type { Tech } from '@/core/types';

const ERA_12_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'military', cost: 2780,
    prerequisites: ['icbm-development', 'satellite-surveillance'],
    unlocks: ['Deploy cyber specialists that drain enemy city gold each turn when adjacent; cities with no Cyber Defense Center are fully exposed'],
    unlocksUnits: ['cyber_unit', 'spy_hacker'], era: 12 },
  { id: 'stealth-technology', name: 'Stealth Technology', track: 'military', cost: 2780,
    prerequisites: ['carbon-fiber', 'satellite-surveillance'],
    unlocks: ['Strategic bombers evade radar; they cannot be targeted by ranged attacks unless an enemy Signals Hub is within 2 hexes'],
    unlocksUnits: ['stealth_bomber'], unlocksBuildings: ['stealth_airbase'], era: 12 },

  // ECONOMY (2)
  { id: 'globalization', name: 'Globalization', track: 'economy', cost: 1495,
    prerequisites: ['petrodollar-system', 'stagflation-response'],
    unlocks: ['+1 gold per distinct peacetime trade route partner civilization'],
    unlocksBuildings: ['global_logistics_network'], era: 12 },
  { id: 'digital-economy', name: 'Digital Economy', track: 'economy', cost: 1925,
    prerequisites: ['petrodollar-system', 'container-shipping'],
    unlocks: ['Cities with a fintech hub gain +1 gold per active trade route (sent or received)'],
    unlocksBuildings: ['fintech_hub'], era: 12 },

  // SCIENCE (2)
  { id: 'genomics', name: 'Genomics', track: 'science', cost: 2780,
    prerequisites: ['molecular-biology', 'green-revolution-crops'],
    unlocks: ['Cities produce +1 food for every 3 science they generate per turn'],
    unlocksBuildings: ['biotech_lab'], era: 12 },
  { id: 'cloud-computing', name: 'Cloud Computing', track: 'science', cost: 2780,
    prerequisites: ['integrated-circuits', 'arpanet'],
    unlocks: ['All unresearched science-track techs cost 15% less science to research'],
    unlocksBuildings: ['data_center'], era: 12 },

  // CIVICS (2)
  { id: 'digital-rights', name: 'Digital Rights', track: 'civics', cost: 1330,
    prerequisites: ['civil-rights-legislation', 'arms-control-negotiations'],
    unlocks: ['Each espionage-category building generates +1 science per turn'],
    era: 12 },
  { id: 'network-governance', name: 'Network Governance', track: 'civics', cost: 1925,
    prerequisites: ['civil-rights-legislation', 'arpanet'],
    unlocks: ['Your lowest-science city gains +2 science per turn from empire-wide data sharing'],
    unlocksBuildings: ['planetary_data_grid'], era: 12 },

  // EXPLORATION (2)
  { id: 'gps-navigation', name: 'GPS Navigation', track: 'exploration', cost: 1385,
    prerequisites: ['space-exploration', 'deep-sea-drilling'],
    unlocks: ['Land units in your own territory pay no extra movement cost for hills or forests'],
    era: 12 },
  { id: 'private-spaceflight', name: 'Private Spaceflight', track: 'exploration', cost: 1780,
    prerequisites: ['space-exploration', 'offshore-platforms'],
    unlocks: ['Cities with a space_center generate +3 gold per turn; all newly trained air units gain +1 permanent movement'],
    unlocksBuildings: ['orbital_fabrication_program'], era: 12 },

  // AGRICULTURE (2)
  { id: 'precision-agriculture', name: 'Precision Agriculture', track: 'agriculture', cost: 1495,
    prerequisites: ['green-revolution-crops', 'aquaculture'],
    unlocks: ['Farm tile improvements also yield +1 production in addition to their food'],
    unlocksBuildings: ['precision_farm'], era: 12 },
  { id: 'lab-grown-food', name: 'Lab-Grown Food', track: 'agriculture', cost: 1925,
    prerequisites: ['aquaculture', 'organ-transplantation'],
    unlocks: ['+2 food all cities'],
    era: 12 },

  // MEDICINE (2)
  { id: 'gene-therapy', name: 'Gene Therapy', track: 'medicine', cost: 1780,
    prerequisites: ['organ-transplantation', 'vaccination-campaigns'],
    unlocks: ['Units survive a lethal hit once per cooldown; cooldown resets when the unit rests a full turn in a friendly city'],
    unlocksBuildings: ['gene_therapy_clinic'], era: 12 },
  { id: 'telemedicine', name: 'Telemedicine', track: 'medicine', cost: 1385,
    prerequisites: ['vaccination-campaigns', 'civil-rights-legislation'],
    unlocks: ['Friendly units near a Telemedicine Hub heal +1 HP per turn'],
    unlocksBuildings: ['telemedicine_hub'], era: 12 },

  // MARITIME (2)
  { id: 'autonomous-shipping', name: 'Autonomous Shipping', track: 'maritime', cost: 1925,
    prerequisites: ['container-shipping', 'offshore-platforms'],
    unlocks: ['+1 gold per active trade route empire-wide'],
    unlocksBuildings: ['automated_port'], era: 12 },
  { id: 'deep-ocean-research', name: 'Deep Ocean Research', track: 'maritime', cost: 1495,
    prerequisites: ['container-shipping', 'nuclear-submarines'],
    unlocks: ['Each coastal city can support one additional trade route'],
    era: 12 },

  // METALLURGY (2)
  { id: 'nanomaterials', name: 'Nanomaterials', track: 'metallurgy', cost: 1780,
    prerequisites: ['carbon-fiber', 'precision-engineering'],
    unlocks: ['All units gain +3 strength', 'Reveal Rare Earth Elements resource'],
    era: 12 },
  { id: '3d-printing', name: '3D Printing', track: 'metallurgy', cost: 1925,
    prerequisites: ['precision-engineering', 'megastructures'],
    unlocks: ['Production overflow from completing a build item is added to the next item in the queue'],
    era: 12 },

  // CONSTRUCTION (2)
  { id: 'smart-cities', name: 'Smart Cities', track: 'construction', cost: 2780,
    prerequisites: ['megastructures', 'offshore-platforms'],
    unlocks: ['Cities with both a factory and a semiconductor fab generate +2 production and +1 science per turn from smart-grid integration', 'Reveal Battery Minerals resource'],
    unlocksBuildings: ['smart_grid'], era: 12 },
  { id: 'green-architecture', name: 'Green Architecture', track: 'construction', cost: 1330,
    prerequisites: ['offshore-platforms', 'green-revolution-crops'],
    unlocks: ['Cities with 6 or more buildings pay 10% less building maintenance'],
    era: 12 },

  // COMMUNICATION (2)
  { id: 'internet', name: 'Internet Protocols', track: 'communication', cost: 1710,
    prerequisites: ['arpanet', 'satellite-television'],
    unlocks: ['Unlocks the Cyber Defense Center building for protection against digital warfare'],
    unlocksBuildings: ['cyber_defense_center'], era: 12 },
  { id: 'social-media', name: 'Social Media', track: 'communication', cost: 1330,
    prerequisites: ['satellite-television', 'counterculture'],
    unlocks: ['You can see all competing civilizations\' progress on any wonder you are also building'],
    unlocksBuildings: ['broadcast_tower'], era: 12 },

  // ESPIONAGE (2)
  { id: 'cyber-intelligence', name: 'Cyber Intelligence', track: 'espionage', cost: 1925,
    prerequisites: ['black-ops-programs', 'satellite-surveillance'],
    unlocks: ['Spies stationed in infiltrated cities can reveal the full city production queue'],
    unlocksBuildings: ['signals_hub'], era: 12 },
  { id: 'mass-surveillance', name: 'Mass Surveillance', track: 'espionage', cost: 1780,
    prerequisites: ['black-ops-programs', 'arpanet'],
    unlocks: ['Reveal all unit positions of civilizations you are at war with'],
    era: 12 },

  // PHILOSOPHY (2)
  { id: 'transhumanism', name: 'Transhumanism', track: 'philosophy', cost: 1385,
    prerequisites: ['structuralism', 'postmodernism'],
    unlocks: ['Units at full HP gain +5% combat strength during attacks and defenses'],
    era: 12 },
  { id: 'secular-rationalism', name: 'Secular Rationalism', track: 'philosophy', cost: 1330,
    prerequisites: ['postmodernism', 'civil-rights-legislation'],
    unlocks: ['Each culture-category building generates +1 science per turn'],
    era: 12 },

  // ARTS (2)
  { id: 'digital-art', name: 'Digital Art', track: 'arts', cost: 1495,
    prerequisites: ['pop-art', 'counterculture'],
    unlocks: ['Each wonder you control generates +1 gold per turn empire-wide'],
    era: 12 },
  { id: 'video-games', name: 'Video Games', track: 'arts', cost: 1330,
    prerequisites: ['counterculture', 'petrodollar-system'],
    unlocks: ['Each culture-category building generates +2 gold per turn'],
    era: 12 },

  // SPIRITUALITY (2)
  { id: 'mindfulness-movement', name: 'Mindfulness Movement', track: 'spirituality', cost: 1385,
    prerequisites: ['ecumenical-movement', 'new-age-spirituality'],
    unlocks: ['Units in friendly territory heal at 1.5× the normal rate each turn'],
    era: 12 },
  { id: 'new-secularism', name: 'New Secularism', track: 'spirituality', cost: 1330,
    prerequisites: ['ecumenical-movement', 'structuralism'],
    unlocks: ['Each science-category building generates +1 gold per turn'],
    era: 12 },
];

export const TECH_TREE_ERAS_12 = ERA_12_TECHS;
