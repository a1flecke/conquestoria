import type { MinorCivDefinition } from '@/core/types';

export const MINOR_CIV_DEFINITIONS: MinorCivDefinition[] = [
  // === MILITARISTIC ===
  {
    id: 'sparta',
    name: 'Sparta',
    archetype: 'militaristic',
    description: 'Warrior city-state, respects strength',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 15 },
    color: '#c62828',
  },
  {
    id: 'valyria',
    name: 'Valyria',
    archetype: 'militaristic',
    description: 'Dragonforged warriors of legend',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 12 },
    color: '#b71c1c',
  },
  {
    id: 'numantia',
    name: 'Numantia',
    archetype: 'militaristic',
    description: 'Unconquerable hill fortress',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 18 },
    color: '#d84315',
  },
  {
    id: 'gondolin',
    name: 'Gondolin',
    archetype: 'militaristic',
    description: 'Hidden elven stronghold',
    allyBonus: { type: 'free_unit', unitType: 'scout', everyNTurns: 10 },
    color: '#1565c0',
  },

  // === MERCANTILE ===
  {
    id: 'carthage',
    name: 'Carthage',
    archetype: 'mercantile',
    description: 'Trading hub of the ancient world',
    allyBonus: { type: 'gold_per_turn', amount: 5 },
    color: '#f9a825',
  },
  {
    id: 'zanzibar',
    name: 'Zanzibar',
    archetype: 'mercantile',
    description: 'Island spice trading post',
    allyBonus: { type: 'gold_per_turn', amount: 4 },
    color: '#ff8f00',
  },
  {
    id: 'samarkand',
    name: 'Samarkand',
    archetype: 'mercantile',
    description: 'Jewel of the Silk Road',
    allyBonus: { type: 'gold_per_turn', amount: 6 },
    color: '#e65100',
  },
  {
    id: 'petra',
    name: 'Petra',
    archetype: 'mercantile',
    description: 'Rose-red city of caravans',
    allyBonus: { type: 'gold_per_turn', amount: 4 },
    color: '#bf360c',
  },

  // === CULTURAL ===
  {
    id: 'alexandria',
    name: 'Alexandria',
    archetype: 'cultural',
    description: 'Center of knowledge and learning',
    allyBonus: { type: 'science_per_turn', amount: 3 },
    color: '#6a1b9a',
  },
  {
    id: 'delphi',
    name: 'Delphi',
    archetype: 'cultural',
    description: "Oracle's seat, font of wisdom",
    allyBonus: { type: 'science_per_turn', amount: 2 },
    color: '#4a148c',
  },
  {
    id: 'timbuktu',
    name: 'Timbuktu',
    archetype: 'cultural',
    description: 'Great library of the sands',
    allyBonus: { type: 'production_per_turn', amount: 2 },
    color: '#4e342e',
  },
  {
    id: 'avalon',
    name: 'Avalon',
    archetype: 'cultural',
    description: 'Mystical isle of ancient knowledge',
    allyBonus: { type: 'production_per_turn', amount: 3 },
    color: '#00695c',
  },
];
