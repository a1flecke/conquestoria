import type { UnitDefinition, UnitType, Unit, HexCoord, GameMap, CivBonusEffect, VisibilityState, IdCounters } from '@/core/types';
import {
  hexKey,
  hexNeighbors,
  hexDistance,
  getWrappedHexNeighbors,
  wrappedHexDistance,
  wrapHexCoord,
} from './hex-utils';
import { isRiverBetween } from './river-system';
import { PIRATE_HULL_DEFINITIONS, type PirateHullType } from './pirate-definitions';

function createPirateUnitDefinition(
  type: PirateHullType,
  attackProfile: UnitDefinition['attackProfile'],
): UnitDefinition {
  const hull = PIRATE_HULL_DEFINITIONS[type];
  return {
    type,
    name: hull.name,
    movementPoints: hull.movementPoints,
    visionRange: hull.visionRange,
    strength: hull.strength,
    canFoundCity: false,
    canBuildImprovements: false,
    productionCost: 0,
    domain: 'naval',
    attackProfile,
  };
}

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  settler: {
    type: 'settler', name: 'Settler', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: true,
    canBuildImprovements: false, productionCost: 24,
  },
  worker: {
    type: 'worker', name: 'Worker', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: true, productionCost: 12,
  },
  scout: {
    type: 'scout', name: 'Scout', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 6,
  },
  warrior: {
    type: 'warrior', name: 'Warrior', movementPoints: 2,
    visionRange: 2, strength: 10, canFoundCity: false,
    canBuildImprovements: false, productionCost: 8,
  },
  archer: {
    type: 'archer', name: 'Archer', movementPoints: 2,
    visionRange: 2, strength: 15, canFoundCity: false,
    canBuildImprovements: false, productionCost: 35,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
  swordsman: {
    type: 'swordsman', name: 'Swordsman', movementPoints: 2,
    visionRange: 2, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 50,
  },
  pikeman: {
    type: 'pikeman', name: 'Pikeman', movementPoints: 2,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
  },
  musketeer: {
    type: 'musketeer', name: 'Musketeer', movementPoints: 2,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
  },
  galley: {
    type: 'galley', name: 'Galley', movementPoints: 3,
    visionRange: 3, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 40,
    domain: 'naval',
  },
  trireme: {
    type: 'trireme', name: 'Trireme', movementPoints: 4,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
    domain: 'naval',
  },
  transport: {
    type: 'transport', name: 'Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 45,
    domain: 'naval',
    cargoCapacity: 2,
  },
  carrack: {
    type: 'carrack', name: 'Carrack', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 48,
    domain: 'naval',
    cargoCapacity: 3,
  },
  galleon: {
    type: 'galleon', name: 'Galleon', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
    domain: 'naval',
    cargoCapacity: 4,
  },
  steamship: {
    type: 'steamship', name: 'Steamship', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    domain: 'naval',
    cargoCapacity: 5,
  },
  troop_transport: {
    type: 'troop_transport', name: 'Troop Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'naval',
    cargoCapacity: 6,
  },
  // Pirate hulls are spawned by pirate ecology and can never be city-trained.
  pirate_galley: createPirateUnitDefinition(
    'pirate_galley',
    { kind: 'melee', range: 1, targets: ['unit'] },
  ),
  pirate_corsair: createPirateUnitDefinition(
    'pirate_corsair',
    { kind: 'melee', range: 1, targets: ['unit'] },
  ),
  pirate_frigate: createPirateUnitDefinition(
    'pirate_frigate',
    { kind: 'ranged', range: 2, targets: ['unit'] },
  ),
  pirate_ironclad: createPirateUnitDefinition(
    'pirate_ironclad',
    { kind: 'ranged', range: 2, targets: ['unit'] },
  ),
  pirate_fast_attack_craft: createPirateUnitDefinition(
    'pirate_fast_attack_craft',
    { kind: 'ranged', range: 2, targets: ['unit'] },
  ),
  pirate_mothership: createPirateUnitDefinition(
    'pirate_mothership',
    { kind: 'ranged', range: 2, targets: ['unit'] },
  ),
  spy_scout: {
    type: 'spy_scout', name: 'Scout Agent', movementPoints: 2,
    visionRange: 2, strength: 3, canFoundCity: false,
    canBuildImprovements: false, productionCost: 30,
  },
  spy_informant: {
    type: 'spy_informant', name: 'Informant', movementPoints: 2,
    visionRange: 2, strength: 4, canFoundCity: false,
    canBuildImprovements: false, productionCost: 50,
  },
  spy_agent: {
    type: 'spy_agent', name: 'Field Agent', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
  },
  spy_operative: {
    type: 'spy_operative', name: 'Operative', movementPoints: 3,
    visionRange: 3, strength: 6, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
  },
  spy_hacker: {
    type: 'spy_hacker', name: 'Cyber Operative', movementPoints: 2,
    visionRange: 2, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
  },
  scout_hound: {
    type: 'scout_hound', name: 'Scout Hound', movementPoints: 3,
    visionRange: 3, strength: 8, canFoundCity: false,
    canBuildImprovements: false, productionCost: 36,
    spyDetectionChance: 0.35,
  },
  shadow_warden: {
    type: 'shadow_warden', name: 'Shadow Warden', movementPoints: 3,
    visionRange: 4, strength: 6, canFoundCity: false,
    canBuildImprovements: false, productionCost: 36,
    spyDetectionChance: 0.50,
  },
  war_hound: {
    type: 'war_hound', name: 'War Hound', movementPoints: 4,
    visionRange: 3, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 32,
    spyDetectionChance: 0.30,
  },
  // S4b — new unit definitions
  axeman: {
    type: 'axeman', name: 'Axeman', movementPoints: 2,
    visionRange: 2, strength: 18, canFoundCity: false,
    canBuildImprovements: false, productionCost: 22,
  },
  spearman: {
    type: 'spearman', name: 'Spearman', movementPoints: 2,
    visionRange: 2, strength: 20, canFoundCity: false,
    canBuildImprovements: false, productionCost: 32,
  },
  horseman: {
    type: 'horseman', name: 'Horseman', movementPoints: 3,
    visionRange: 2, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 55,
    cargoSize: 2,
  },
  cavalry: {
    type: 'cavalry', name: 'Cavalry', movementPoints: 3,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 60,
    cargoSize: 2,
  },
  knight: {
    type: 'knight', name: 'Knight', movementPoints: 3,
    visionRange: 2, strength: 45, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
    cargoSize: 2,
  },
  crossbowman: {
    type: 'crossbowman', name: 'Crossbowman', movementPoints: 2,
    visionRange: 3, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 75,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
  catapult: {
    type: 'catapult', name: 'Catapult', movementPoints: 1,
    visionRange: 2, strength: 20, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
    cargoSize: 3,
  },
  ballista: {
    type: 'ballista', name: 'Ballista', movementPoints: 2,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit'] },
    cargoSize: 3,
  },
  cannon: {
    type: 'cannon', name: 'Cannon', movementPoints: 2,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
  },
  grenadier: {
    type: 'grenadier', name: 'Grenadier', movementPoints: 2,
    visionRange: 2, strength: 32, canFoundCity: false,
    canBuildImprovements: false, productionCost: 130,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 1, targets: ['unit', 'city'] },
  },
  rifleman: {
    type: 'rifleman', name: 'Rifleman', movementPoints: 2,
    visionRange: 2, strength: 38, canFoundCity: false,
    canBuildImprovements: false, productionCost: 145,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  ironclad: {
    type: 'ironclad', name: 'Ironclad', movementPoints: 2,
    visionRange: 2, strength: 42, canFoundCity: false,
    canBuildImprovements: false, productionCost: 160,
    domain: 'naval',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  machine_gunner: {
    type: 'machine_gunner', name: 'Machine Gunner', movementPoints: 2,
    visionRange: 2, strength: 44, canFoundCity: false,
    canBuildImprovements: false, productionCost: 145,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  pre_dreadnought: {
    type: 'pre_dreadnought', name: 'Pre-Dreadnought', movementPoints: 4,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 175,
    domain: 'naval',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  tank: {
    type: 'tank', name: 'Tank', movementPoints: 3,
    visionRange: 2, strength: 58, canFoundCity: false,
    canBuildImprovements: false, productionCost: 185,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  submarine: {
    type: 'submarine', name: 'Submarine', movementPoints: 4,
    visionRange: 2, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 180,
    domain: 'naval',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  observation_balloon: {
    type: 'observation_balloon', name: 'Observation Balloon',
    movementPoints: 1, visionRange: 4, strength: 6,
    canFoundCity: false, canBuildImprovements: false, productionCost: 90,
    domain: 'air',
  },
  biplane: {
    type: 'biplane', name: 'Biplane',
    movementPoints: 4, visionRange: 3, strength: 34,
    canFoundCity: false, canBuildImprovements: false, productionCost: 200,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  jet_fighter: {
    type: 'jet_fighter', name: 'Jet Fighter',
    movementPoints: 6, visionRange: 3, strength: 50,
    canFoundCity: false, canBuildImprovements: false, productionCost: 300,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  carrier: {
    type: 'carrier', name: 'Carrier',
    movementPoints: 4, visionRange: 3, strength: 30,
    canFoundCity: false, canBuildImprovements: false, productionCost: 220,
    domain: 'naval',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  // Era 11 units
  attack_helicopter: {
    type: 'attack_helicopter', name: 'Attack Helicopter',
    movementPoints: 5, visionRange: 3, strength: 40,
    canFoundCity: false, canBuildImprovements: false, productionCost: 230,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  missile_submarine: {
    type: 'missile_submarine', name: 'Missile Submarine',
    movementPoints: 5, visionRange: 3, strength: 45,
    canFoundCity: false, canBuildImprovements: false, productionCost: 250,
    domain: 'naval',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
  },
  // S5 — trade unit
  caravan: {
    type: 'caravan', name: 'Caravan', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 60,
    domain: 'land',
  },
  // Resource Accessibility MR 2b — exploration unit
  expedition: {
    type: 'expedition', name: 'Expedition', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 18,
    domain: 'land',
    terrainCostOverrides: { hills: 1, mountain: 1 },
  },
  // Legendary Beasts — not trainable; spawned by beast-system.ts only
  beast_boar: {
    type: 'beast_boar', name: 'Giant Boar', movementPoints: 2,
    visionRange: 2, strength: 18, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_wolf: {
    type: 'beast_wolf', name: 'Dire Wolf', movementPoints: 3,
    visionRange: 2, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_basilisk: {
    type: 'beast_basilisk', name: 'Emerald Basilisk', movementPoints: 2,
    visionRange: 2, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_sea_serpent: {
    type: 'beast_sea_serpent', name: 'Sea Serpent', movementPoints: 3,
    visionRange: 3, strength: 38, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0, domain: 'naval',
  },
  beast_wurm: {
    type: 'beast_wurm', name: 'Dune Wurm', movementPoints: 2,
    visionRange: 2, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_roc: {
    type: 'beast_roc', name: 'Storm Roc', movementPoints: 4,
    visionRange: 3, strength: 34, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_hydra: {
    type: 'beast_hydra', name: 'Swamp Hydra', movementPoints: 1,
    visionRange: 2, strength: 36, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_dragon: {
    type: 'beast_dragon', name: 'Ancient Dragon', movementPoints: 3,
    visionRange: 3, strength: 120, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
  // Era 12 units
  cyber_unit: {
    type: 'cyber_unit', name: 'Cyber Unit', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'land',
    // strength 0: capturable economic saboteur, not a combatant — no attackProfile
  },
  stealth_bomber: {
    type: 'stealth_bomber', name: 'Stealth Bomber', movementPoints: 5,
    visionRange: 3, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 360,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
  },
};

const VIKING_MOBILITY_UNITS = new Set<UnitType>(['scout', 'warrior', 'archer', 'swordsman']);

export function createUnit(
  type: UnitType,
  owner: string,
  position: HexCoord,
  counters: IdCounters,
  bonusEffect?: CivBonusEffect,
): Unit {
  const movementBonus =
    bonusEffect?.type === 'naval_raiding' && VIKING_MOBILITY_UNITS.has(type)
      ? bonusEffect.movementBonus
      : 0;
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `unit-${counters.nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints + movementBonus,
    movementBonus: movementBonus || undefined,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    chargesRemaining: type === 'worker' ? 2 : undefined,
    isResting: false,
    cargoUnitIds: definition.cargoCapacity !== undefined ? [] : undefined,
  };
}

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: Math.max(0, unit.movementPointsLeft - cost),
    hasMoved: true,
    isFortified: undefined,
  };
}

export function resetUnitTurn(unit: Unit): Unit {
  const { skippedTurn: _skippedTurn, ...rest } = unit;
  const base: Unit = {
    ...rest,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
  if (base.workerTask) {
    return { ...base, movementPointsLeft: 0, hasActed: true };
  }
  return base;
}

// --- Healing constants ---
export const HEAL_PASSIVE = 5;    // HP/turn when idle (didn't move or act)
export const HEAL_RESTING = 15;   // HP/turn when player explicitly rests
export const HEAL_IN_CITY = 20;   // HP/turn when in a friendly city
export const HEAL_IN_TERRITORY = 10; // HP/turn when in friendly territory

export function canHeal(unit: Unit): boolean {
  return unit.health < 100;
}

export function healUnit(
  unit: Unit,
  inFriendlyCity: boolean,
  inFriendlyTerritory: boolean,
  bonus?: { flat: number; mult: number },
): Unit {
  if (unit.health >= 100) return unit;

  let healAmount: number;
  if (inFriendlyCity) {
    healAmount = HEAL_IN_CITY;
  } else if (unit.isResting) {
    healAmount = HEAL_RESTING;
  } else if (inFriendlyTerritory) {
    healAmount = HEAL_IN_TERRITORY;
  } else if (!unit.hasMoved && !unit.hasActed) {
    healAmount = HEAL_PASSIVE;
  } else {
    return unit; // moved or acted without resting — no heal
  }

  if (bonus) {
    // Flat tech/NP bonuses stack first; the single multiplier (mindfulness-movement) applies last.
    healAmount = Math.round((healAmount + bonus.flat) * bonus.mult);
  }

  return { ...unit, health: Math.min(100, unit.health + healAmount) };
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasActed: true,   // resting uses the action for the turn
    movementPointsLeft: 0,
  };
}

export const UNIT_DESCRIPTIONS: Record<UnitType, string> = {
  settler: 'Civilian unit that can found new cities',
  worker: 'Civilian unit that builds tile improvements. Workers have 2 action charges by default and are used up after spending the last charge.',
  scout: 'Fast exploration unit with extended vision',
  warrior: 'Basic melee fighter — your first line of defense',
  archer: 'Ranged unit that attacks from a distance',
  swordsman: 'Stronger melee fighter, requires Bronze Working',
  pikeman: 'Anti-cavalry specialist, requires Fortification',
  musketeer: 'Gunpowder infantry, requires Tactics',
  galley: 'Coastal vessel for exploration and early naval patrols',
  trireme: 'Warship with strong naval combat capabilities',
  transport:        'Civilian ship that carries up to 2 land units between coasts. Cannot attack.',
  carrack:          'Successor to the Transport. Carries up to 3 land units across coasts and oceans.',
  galleon:          'Successor to the Carrack. Broader hull, carries up to 4 land units.',
  steamship:        'Steam-powered successor to the Galleon. Carries up to 5 land units reliably.',
  troop_transport:  'Military-grade vessel. Carries up to 6 land units across any ocean.',
  pirate_galley: 'An improvised oared raider that preys on early coastal traffic. Pirate-only and never city-trainable.',
  pirate_corsair: 'A swift lateen-rigged xebec built to overtake merchants and escape heavier patrols.',
  pirate_frigate: 'A captured broadside frigate refitted for long-range piracy while older corsairs remain in service.',
  pirate_ironclad: 'An armored steam raider combining industrial protection with the mobility of an outlaw fleet.',
  pirate_fast_attack_craft: 'A modern high-speed strike boat used by breakaway forces and mercenary flotillas.',
  pirate_mothership: 'A converted command vessel that supports modern pirate craft while coordinating older warships.',
  spy_scout: 'Lightly trained scout agent. Move to an enemy city and attempt to infiltrate. Era 1: infiltration and scouting resolve in one action.',
  spy_informant: 'Experienced informant. Infiltrates cities for multi-turn intelligence operations. Unlocks disguise.',
  spy_agent: 'Skilled field operative. Conducts sabotage, tech theft, and disruption missions.',
  spy_operative: 'Elite spy. Capable of high-stakes operations — assassination, forgery, arms smuggling.',
  spy_hacker: 'Cyber operative. Remote and digital warfare missions; hardest to detect.',
  scout_hound: 'Detection unit. Patrols territory and has a 35% chance per turn to reveal disguised or stealthed spy units within vision range.',
  shadow_warden: 'Elite detection unit. 50% chance per turn to reveal disguised spies within vision range. Favored by intelligence-focused civilizations.',
  war_hound: 'Combat-focused detection unit. Weaker spy detection (30%) but formidable in battle. Tears apart lightly-armored spy units.',
  // S4b — new unit descriptions
  axeman:      'Early copper-armed warrior. Strong for the era but outpaced once iron is mastered.',
  spearman:    'Versatile polearm soldier effective against mounted units. No resources required.',
  horseman:    'Swift light cavalry for raids and flanking. Requires Horses.',
  cavalry:     'Heavy cavalry unit combining speed and striking power. Requires Horses and Iron.',
  knight:      'The apex of mounted warfare — armored and devastating. Requires Horses and Iron.',
  crossbowman: 'Precision-ranged unit with a longer reach than Archers. Requires Copper.',
  catapult:    'Slow but devastating siege engine that bombards units and cities. Requires Stone.',
  ballista:    'Long-range bolt-thrower effective against massed units. Requires Iron.',
  cannon:      'Gunpowder siege weapon. High bombard damage against cities and fortifications at range 2. Slow movement.',
  grenadier:   'Grenade-throwing infantry. Bombard range 1, strong vs fortifications and city walls. Good vs entrenched defenders.',
  rifleman:        'Rifled-musket infantry. Accurate ranged unit. Replaces musketeer-class; excels at holding defensive positions.',
  ironclad:        'Armored steam warship. Strongest naval unit of the industrial era. High strength, replaces frigate in fleet roles.',
  machine_gunner:  'Tripod-mounted machine gun crew. Suppressive fire from entrenched positions. High ranged strength; replaces the rifle-era fire support role.',
  pre_dreadnought: 'Armored steam battleship. Long-range guns (range 2), powerful vs coastal cities and fleets. Replaces the ironclad era of naval warfare.',
  tank:       'Armored fighting vehicle. Breaks entrenched positions, high strength, range-1 attack. Obsoletes the machine gunner era of infantry firepower.',
  submarine:  'Undersea warship. Long-range torpedoes (range 2), high naval strength, stealth approach. Replaces pre-dreadnought surface-fleet dominance.',
  observation_balloon: 'Tethered hydrogen balloon used for aerial reconnaissance. Cannot attack. Provides unmatched long-range vision over enemy territory. Extremely fragile.',
  biplane:    'WWI-era fabric-and-wood fighter aircraft. Fast air unit that can attack land and naval targets from altitude. Vulnerable to dedicated anti-air batteries. Obsoleted by monoplane fighters.',
  jet_fighter: 'WWII-era swept-wing jet fighter. Faster and stronger than the biplane; dominates air-to-air and ground-attack roles. Faction roundel on fuselage; afterburner glow marks its passage.',
  carrier:     'Fleet aircraft carrier. Projects air power across oceans from a mobile flight deck. Requires a coastal city to build. High vision range; moderate naval strength.',
  attack_helicopter: 'Cold War attack helicopter. Combines close air support with anti-armour missiles; faster than jet fighters but more vulnerable to ground fire. Ranged air unit.',
  missile_submarine: 'Nuclear-powered ballistic missile submarine. Long-range submarine-launched missiles threaten any city from the deep. Requires a coastal city to build. Longest range of any unit.',
  // S5 — trade unit
  caravan:     'Trade unit. Establish a trade route to generate gold each turn. '
             + 'Once committed, cannot move or act until the route ends (8 round trips base). '
             + 'Cannot attack. Raidable by enemy units in transit.',
  // Resource Accessibility MR 2b
  expedition:  'Civilian explorer. Crosses hills and mountains at full speed. '
             + 'When standing on a resource tile (outside city territory), use '
             + '"Establish Outpost" to plant a flag — the unit is consumed '
             + 'immediately and the outpost completes in 2 turns, granting the '
             + 'resource and charging 2 gold/turn upkeep. Requires Foraging tech.',
  beast_boar: 'A legendary boar of monstrous size. Territorial — it defends its forest den but never wanders far. Slay it to claim its hoard.',
  beast_wolf: 'One of the Dire Wolf Pack. Fast, relentless, and never alone — defeat the whole pack to claim their hoard.',
  beast_basilisk: 'The Emerald Basilisk lies hidden in the jungle until prey wanders close. Approach with overwhelming force.',
  beast_sea_serpent: 'A serpent of the deep ocean. It drags ships under within its hunting waters — only ships and ranged units can fight it.',
  beast_wurm: 'The Dune Wurm swims beneath the sand, invisible until you stand beside it. Bring ranged units and overwhelming force.',
  beast_roc: 'The Storm Roc nests on the high peaks and dives on anything that crosses its skies. It flies over terrain that would stop an army.',
  beast_hydra: 'The Swamp Hydra regrows flesh as fast as you can cut it — 10 health every turn. Strike hard and finish it in one assault.',
  beast_dragon: 'The Ancient Dragon, terror of the volcanic peaks. Its fire breath strikes from 2 hexes away. Slaying it is the deed of a lifetime — the hoard contains everything.',
  cyber_unit: 'A non-combat economic saboteur. Drains −2 gold per turn from adjacent enemy cities lacking a Cyber Defense Center. Strength 0: capturable by any enemy unit that enters its hex (transferred to that civ, not destroyed). Gene Therapy does not apply.',
  stealth_bomber: 'A long-range strategic bomber invisible to standard radar. Cannot be targeted by ranged attacks unless an enemy Signals Hub is within 2 hexes of the bomber. Must be trained at a Stealth Airbase. Range 3, strength 52.',
};

export function getUnmovedUnits(
  units: Record<string, Unit>,
  civId: string,
): Unit[] {
  return Object.values(units).filter(u => u.owner === civId && isUnitAwaitingOrders(u));
}

export function isUnitAwaitingOrders(unit: Unit): boolean {
  return !unit.transportId
    && !unit.hasMoved
    && !unit.hasActed
    && !unit.skippedTurn
    && !unit.isFortified
    && !unit.committedToRouteId
    && !unit.workerTask;
}

export function getMovementCost(terrain: string): number {
  const costs: Record<string, number> = {
    grassland: 1, plains: 1, desert: 1, tundra: 1,
    forest: 2, hills: 2, snow: 2,
    jungle: 2, swamp: 2, volcanic: 2,
    mountain: 4, ocean: Infinity, coast: Infinity,
  };
  return costs[terrain] ?? Infinity;
}

export function getMovementCostForUnit(
  terrain: string,
  domain: 'land' | 'naval' | 'air',
  terrainCostOverrides?: Partial<Record<string, number>>,
): number {
  if (domain === 'air') return 1;
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  if (terrainCostOverrides && terrain in terrainCostOverrides) {
    return terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

export type UnitMovementBlockerCode =
  | 'unknown-tile'
  | 'unexplored'
  | 'impassable-water'
  | 'impassable-terrain'
  | 'requires-galleys'
  | 'requires-celestial-navigation'
  | 'occupied'
  | 'foreign-city'
  | 'unreachable'
  | 'insufficient-movement';

export interface UnitMovementContext {
  completedTechs?: string[];
}

export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const domain = definition?.domain ?? 'land';

  if (domain === 'air') return 1;

  if (domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (unit.type !== 'transport') return 1;
    const completedTechs = context.completedTechs ?? [];
    if (!completedTechs.includes('galleys')) return Infinity;
    if (terrain === 'ocean' && !completedTechs.includes('celestial-navigation')) return Infinity;
    return 1;
  }

  if (definition?.terrainCostOverrides && terrain in definition.terrainCostOverrides) {
    return definition.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

export function getMovementStepCost(
  unit: Unit,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
  context: UnitMovementContext = {},
): number {
  const tile = map.tiles[hexKey(to)];
  if (!tile) return Infinity;

  const terrainCost = getMovementCostForUnitInContext(unit, tile.terrain, context);
  if (terrainCost === Infinity) return Infinity;

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const crossesUnbridgedRiver = domain !== 'naval' && domain !== 'air'
    && !context.completedTechs?.includes('bridge-building')
    && isRiverBetween(map, from, to);
  return terrainCost + (crossesUnbridgedRiver ? 1 : 0);
}

function isPassableForUnit(
  terrain: string,
  domain: 'land' | 'naval' | 'air',
  terrainCostOverrides?: Partial<Record<string, number>>,
): boolean {
  return getMovementCostForUnit(terrain, domain, terrainCostOverrides) < Infinity;
}

function isPassableForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): boolean {
  return getMovementCostForUnitInContext(unit, terrain, context) < Infinity;
}

export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'requires-galleys'
    | 'requires-celestial-navigation'
    | 'occupied'
    | 'unreachable'
    | 'insufficient-movement';
  message: string;
}

export function getMovementBlockerReason(
  unit: Unit,
  to: HexCoord,
  map: GameMap,
  options: { visibilityState?: VisibilityState; completedTechs?: string[] } = {},
): MovementBlockerReason | null {
  if (options.visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }

  const target = map.wrapsHorizontally ? wrapHexCoord(to, map.width) : to;
  const tile = map.tiles[hexKey(target)];
  if (!tile) {
    return { code: 'unknown-tile', message: 'Too far away to spot.' };
  }

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  if (!isPassableForUnitInContext(unit, tile.terrain, { completedTechs: options.completedTechs })) {
    if (unit.type === 'transport' && (tile.terrain === 'coast' || tile.terrain === 'ocean') && !options.completedTechs?.includes('galleys')) {
      return { code: 'requires-galleys', message: 'Need Galleys to sail a Transport.' };
    }
    if (unit.type === 'transport' && tile.terrain === 'ocean') {
      return { code: 'requires-celestial-navigation', message: 'Need Celestial Navigation to cross ocean.' };
    }
    if (domain === 'naval') {
      return { code: 'impassable-terrain', message: 'Naval units cannot move on land.' };
    }
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    }
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }

  const path = findPath(unit.position, target, map, domain, { unit, completedTechs: options.completedTechs });
  if (!path) {
    return { code: 'unreachable', message: 'No passable route to that tile.' };
  }

  const pathCost = path.slice(1).reduce(
    (total, coord, index) => total + getMovementStepCost(
      unit,
      map,
      path[index]!,
      coord,
      { completedTechs: options.completedTechs },
    ),
    0,
  );

  // Forced march: a unit can always move to an adjacent passable tile with ≥1 move remaining.
  const isAdjacentMove = path.length === 2;
  if (isAdjacentMove && unit.movementPointsLeft >= 1) {
    return null;
  }

  if (pathCost > unit.movementPointsLeft) {
    return { code: 'insufficient-movement', message: 'Not enough movement left this turn.' };
  }

  return null;
}

function normalizeOccupants(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string | string[]>,
  unitOwners?: Record<string, string>,
  hostileOwners?: Set<string>,
  options: UnitMovementContext = {},
): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, map.width)
      : hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassableForUnitInContext(unit, tile.terrain, options)) continue;

      const cost = getMovementStepCost(unit, map, current.coord, neighbor, options);
      const remaining = current.remaining - cost;

      // Forced march: if this is a direct neighbor of the start position and the unit
      // has ≥1 movement remaining, allow entry even when the tile cost exceeds remaining points.
      const isFromStartPosition = hexKey(current.coord) === hexKey(unit.position);
      const forcedMarch = isFromStartPosition && current.remaining >= 1 && remaining < 0;

      if (remaining < 0 && !forcedMarch) continue;

      const effectiveRemaining = forcedMarch ? 0 : remaining;

      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      if (occupants.length > 0) {
        const isNeutralOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          return Boolean(owner) && owner !== unit.owner
            && hostileOwners !== undefined && !hostileOwners.has(owner!);
        };
        const isHostileOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          if (!owner || owner === unit.owner) return false;
          return hostileOwners !== undefined ? hostileOwners.has(owner) : true;
        };

        if (occupants.some(isNeutralOccupant)) continue;

        if (occupants.some(isHostileOccupant)) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
          continue;
        }
      }

      const prevRemaining = visited.get(key) ?? -1;
      if (effectiveRemaining > prevRemaining) {
        visited.set(key, effectiveRemaining);
        reachable.push(neighbor);
        if (effectiveRemaining > 0) {
          queue.push({ coord: neighbor, remaining: effectiveRemaining });
        }
      }
    }
  }

  return reachable;
}

export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air' = 'land',
  options: UnitMovementContext & { unit?: Unit } = {},
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  const canEnter = options.unit
    ? isPassableForUnitInContext(options.unit, toTile?.terrain ?? '', options)
    : Boolean(toTile && isPassableForUnit(toTile.terrain, domain));
  if (!toTile || !canEnter) return null;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  openSet.add(startKey);
  coords.set(startKey, from);

  while (openSet.size > 0) {
    // Find node with lowest f score
    let currentKey = '';
    let lowestF = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const heuristic = map.wrapsHorizontally
        ? wrappedHexDistance(coord, to, map.width)
        : hexDistance(coord, to);
      const f = (gScore.get(key) ?? Infinity) + heuristic;
      if (f < lowestF) {
        lowestF = f;
        currentKey = key;
      }
    }

    // Reached destination — reconstruct path
    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const currentCoord = coords.get(currentKey)!;

    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(currentCoord, map.width)
      : hexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile) continue;
      const stepCost = options.unit
        ? getMovementStepCost(options.unit, map, currentCoord, neighbor, options)
        : getMovementCostForUnit(tile.terrain, domain);
      if (stepCost === Infinity) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }

  return null;
}
