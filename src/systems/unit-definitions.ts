import type { UnitDefinition, UnitType } from '@/core/types';
import { PIRATE_HULL_DEFINITIONS, type PirateHullType } from './pirate-definitions';
import { BARBARIAN_ELIGIBILITY_BY_UNIT } from './barbarian-roster';

/**
 * Static unit catalog (#1010). Pure data plus the pirate-hull helper -- no game
 * state, no movement or legality rule. A dependency-light leaf so the movement
 * modules can import UNIT_DEFINITIONS without pulling in unit-system.ts and
 * reintroducing an import cycle (this also retires the pre-existing
 * unit-system <-> zone-of-control-system cycle).
 */
type UnitDefinitionBase = Omit<UnitDefinition, 'barbarianEligibility'>;

function createPirateUnitDefinition(
  type: PirateHullType,
  attackProfile: UnitDefinition['attackProfile'],
): UnitDefinitionBase {
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
    waterAccess: hull.waterAccess,
    attackProfile,
  };
}

const UNIT_DEFINITION_BASES: Record<UnitType, UnitDefinitionBase> = {
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
  missionary: {
    type: 'missionary', name: 'Missionary', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 16,
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
    // #966: ranged units bombard cities like every other `role: 'ranged'` unit
    // (Rifleman/Machine Gunner/Musketeer/Infantry). Damage/decisive-assault only --
    // ownership still changes solely via the land capture flow (city-capture-system).
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
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
    visionRange: 2, strength: 34, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
    airAssaultPassengerEligible: true,
  },
  galley: {
    type: 'galley', name: 'Galley', movementPoints: 3,
    visionRange: 3, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 40,
    domain: 'naval', waterAccess: 'coastal',
  },
  trireme: {
    type: 'trireme', name: 'Trireme', movementPoints: 4,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
    domain: 'naval', waterAccess: 'ocean',
  },
  transport: {
    type: 'transport', name: 'Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 45,
    domain: 'naval', waterAccess: 'coastal',
    cargoCapacity: 2,
    landSupplyCapacity: 2, projectsLandSupplyRange: 1,
  },
  carrack: {
    type: 'carrack', name: 'Carrack', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 48,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 3,
    landSupplyCapacity: 3, projectsLandSupplyRange: 1,
  },
  galleon: {
    type: 'galleon', name: 'Galleon', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 4,
    landSupplyCapacity: 4, projectsLandSupplyRange: 1,
  },
  steamship: {
    type: 'steamship', name: 'Steamship', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 5,
    landSupplyCapacity: 5, projectsLandSupplyRange: 2,
  },
  troop_transport: {
    type: 'troop_transport', name: 'Troop Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 6,
    landSupplyCapacity: 6, projectsLandSupplyRange: 2,
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
  spy_intelligence_officer: {
    type: 'spy_intelligence_officer', name: 'Intelligence Officer', movementPoints: 3,
    visionRange: 3, strength: 7, canFoundCity: false,
    canBuildImprovements: false, productionCost: 140,
  },
  spy_station_chief: {
    type: 'spy_station_chief', name: 'Station Chief', movementPoints: 3,
    visionRange: 4, strength: 8, canFoundCity: false,
    canBuildImprovements: false, productionCost: 185,
  },
  spy_hacker: {
    type: 'spy_hacker', name: 'Cyber Operative', movementPoints: 2,
    visionRange: 2, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 234,
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
  beast_handler: {
    type: 'beast_handler', name: 'Beast Handler Company', movementPoints: 3,
    visionRange: 3, strength: 24, canFoundCity: false,
    canBuildImprovements: false, productionCost: 72,
    spyDetectionChance: 0.35,
  },
  war_elephant: {
    type: 'war_elephant', name: 'War Elephant Corps', movementPoints: 2,
    visionRange: 2, strength: 43, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
  },
  beast_stampede_herd: {
    type: 'beast_stampede_herd', name: 'Stampede Herd', movementPoints: 2,
    visionRange: 2, strength: 28, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  rogue_handler: {
    type: 'rogue_handler', name: 'Rogue Handler', movementPoints: 3,
    visionRange: 2, strength: 22, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  rogue_elephant: {
    type: 'rogue_elephant', name: 'Rogue Elephant', movementPoints: 2,
    visionRange: 2, strength: 40, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
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
    canBuildImprovements: false, productionCost: 54,
  },
  horseman: {
    type: 'horseman', name: 'Horseman', movementPoints: 3,
    visionRange: 2, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 55,
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  chariot: {
    type: 'chariot', name: 'Chariot', movementPoints: 3,
    visionRange: 2, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 65,
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  cavalry: {
    type: 'cavalry', name: 'Cavalry', movementPoints: 4,
    visionRange: 2, strength: 44, canFoundCity: false,
    canBuildImprovements: false, productionCost: 140,
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  armored_car: {
    type: 'armored_car', name: 'Armored Car', movementPoints: 4,
    visionRange: 3, strength: 48, canFoundCity: false,
    canBuildImprovements: false, productionCost: 168,
  },
  knight: {
    type: 'knight', name: 'Knight', movementPoints: 3,
    visionRange: 2, strength: 45, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  cuirassier: {
    type: 'cuirassier', name: 'Cuirassier', movementPoints: 3,
    visionRange: 2, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 150,
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  crossbowman: {
    type: 'crossbowman', name: 'Crossbowman', movementPoints: 2,
    visionRange: 3, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 75,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] }, // #966
  },
  catapult: {
    type: 'catapult', name: 'Catapult', movementPoints: 1,
    visionRange: 2, strength: 20, canFoundCity: false,
    canBuildImprovements: false, productionCost: 110,
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
    cargoSize: 3,
    landSupplyCost: 3, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  trebuchet: {
    type: 'trebuchet', name: 'Trebuchet', movementPoints: 1,
    visionRange: 2, strength: 27, canFoundCity: false,
    canBuildImprovements: false, productionCost: 125,
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
    cargoSize: 3,
    landSupplyCost: 3, // #544 MR7: contract §10 -- initialized to match cargoSize
    fortificationPenetration: 0.5,
    cityAssaultMultiplier: 1.25,
  },
  ballista: {
    type: 'ballista', name: 'Ballista', movementPoints: 2,
    visionRange: 3, strength: 25, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] }, // #966
    cargoSize: 3,
    landSupplyCost: 3, // #544 MR7: contract §10 -- initialized to match cargoSize
  },
  cannon: {
    type: 'cannon', name: 'Cannon', movementPoints: 2,
    visionRange: 2, strength: 35, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
  },
  artillery: {
    type: 'artillery', name: 'Artillery', movementPoints: 2,
    visionRange: 2, strength: 48, canFoundCity: false,
    canBuildImprovements: false, productionCost: 190,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
    fortificationPenetration: 0.5,
  },
  rocket_artillery: {
    type: 'rocket_artillery', name: 'Rocket Artillery', movementPoints: 2,
    visionRange: 2, strength: 57, canFoundCity: false,
    canBuildImprovements: false, productionCost: 260,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 3, targets: ['unit', 'city'] },
    splash: { damageFraction: 0.25, maxTargets: 2, label: 'Damages up to two nearby visible enemy soldiers' },
    fortificationPenetration: 0.5,
  },
  grenadier: {
    type: 'grenadier', name: 'Grenadier', movementPoints: 2,
    visionRange: 2, strength: 32, canFoundCity: false,
    canBuildImprovements: false, productionCost: 130,
    domain: 'land',
    attackProfile: { kind: 'bombard', range: 1, targets: ['unit', 'city'] },
    fortificationPenetration: 0.5,
    airAssaultPassengerEligible: true,
  },
  marine: {
    type: 'marine', name: 'Marine', movementPoints: 2,
    visionRange: 2, strength: 36, canFoundCity: false,
    canBuildImprovements: false, productionCost: 125,
    domain: 'land',
    attackProfile: { kind: 'melee', range: 1, targets: ['unit', 'city'], targetDomains: ['land'] },
    airAssaultPassengerEligible: true,
  },
  rifleman: {
    type: 'rifleman', name: 'Rifleman', movementPoints: 2,
    visionRange: 2, strength: 46, canFoundCity: false,
    canBuildImprovements: false, productionCost: 145,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    airAssaultPassengerEligible: true,
  },
  frigate: {
    type: 'frigate', name: 'Frigate', movementPoints: 4,
    visionRange: 2, strength: 38, canFoundCity: false,
    canBuildImprovements: false, productionCost: 140,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  ironclad: {
    type: 'ironclad', name: 'Ironclad', movementPoints: 2,
    visionRange: 2, strength: 42, canFoundCity: false,
    canBuildImprovements: false, productionCost: 160,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  machine_gunner: {
    type: 'machine_gunner', name: 'Machine Gunner', movementPoints: 2,
    visionRange: 2, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 145,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    airAssaultPassengerEligible: true,
  },
  infantry: {
    type: 'infantry', name: 'Infantry', movementPoints: 2,
    visionRange: 2, strength: 56, canFoundCity: false,
    canBuildImprovements: false, productionCost: 195,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    airAssaultPassengerEligible: true,
  },
  mechanized_infantry: {
    type: 'mechanized_infantry', name: 'Mechanized Infantry', movementPoints: 3,
    visionRange: 2, strength: 61, canFoundCity: false,
    canBuildImprovements: false, productionCost: 220,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    combinedArms: { provides: ['line-infantry'] },
    airAssaultPassengerEligible: true,
  },
  paratrooper: {
    type: 'paratrooper', name: 'Paratrooper', movementPoints: 2,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 210,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    paradrop: { range: 4, baseKinds: ['airfield'] },
    airAssaultPassengerEligible: true,
  },
  pre_dreadnought: {
    type: 'pre_dreadnought', name: 'Pre-Dreadnought', movementPoints: 4,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 175,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  battleship: {
    type: 'battleship', name: 'Battleship', movementPoints: 4,
    visionRange: 3, strength: 66, canFoundCity: false,
    canBuildImprovements: false, productionCost: 240,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
  },
  missile_cruiser: {
    type: 'missile_cruiser', name: 'Missile Cruiser', movementPoints: 5,
    visionRange: 3, strength: 70, canFoundCity: false,
    canBuildImprovements: false, productionCost: 285,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
    airDefenseProvider: { radius: 1, defenseModifier: 10, stackingGroup: 'ground-air-defense', protectedDomains: ['naval'] },
  },
  tank: {
    type: 'tank', name: 'Tank', movementPoints: 3,
    visionRange: 2, strength: 62, canFoundCity: false,
    canBuildImprovements: false, productionCost: 185,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  },
  main_battle_tank: {
    type: 'main_battle_tank', name: 'Main Battle Tank', movementPoints: 4,
    visionRange: 2, strength: 72, canFoundCity: false,
    canBuildImprovements: false, productionCost: 270,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    combinedArms: { requiresAdjacent: { providerTag: 'line-infantry', multiplier: 1.10, label: 'Combined arms +10%' } },
  },
  anti_tank_gun: {
    type: 'anti_tank_gun', name: 'Anti-Tank Gun', movementPoints: 2,
    visionRange: 2, strength: 43, canFoundCity: false,
    canBuildImprovements: false, productionCost: 170,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] }, // #966
  },
  mobile_aa: {
    type: 'mobile_aa', name: 'Mobile AA', movementPoints: 2,
    visionRange: 2, strength: 32, canFoundCity: false,
    canBuildImprovements: false, productionCost: 175, domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] }, // #966
    airDefenseProvider: { radius: 1, defenseModifier: 8, stackingGroup: 'ground-air-defense' },
  },
  submarine: {
    type: 'submarine', name: 'Submarine', movementPoints: 4,
    visionRange: 2, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 180,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  observation_balloon: {
    type: 'observation_balloon', name: 'Observation Balloon',
    movementPoints: 1, visionRange: 4, strength: 6,
    canFoundCity: false, canBuildImprovements: false, productionCost: 144,
    domain: 'air',
    // #845 review: this unit has no explicit attackProfile, so before the DEFAULT_ATTACK_PROFILE
    // fix it accidentally inherited a land-only restriction; after the fix, an air-domain
    // attacker with no profile of its own falls back to the fully permissive
    // ['land','naval','air'] set (see canAttackUnitDomain). strength: 6 is nonzero (used
    // defensively when the balloon itself is attacked), so without this explicit empty-targets
    // profile it would newly become able to declare attacks -- directly contradicting its own
    // "Cannot attack" description (UNIT_DESCRIPTIONS.observation_balloon). targets: [] makes
    // canAttackByProfileOnMap/canUnitAttackTarget structurally always reject it as an attacker,
    // regardless of domain, matching the description without touching its defensive strength.
    attackProfile: { kind: 'melee', range: 1, targets: [] },
  },
  biplane: {
    type: 'biplane', name: 'Biplane',
    movementPoints: 4, visionRange: 3, strength: 34,
    canFoundCity: false, canBuildImprovements: false, productionCost: 200,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 3, ferryRange: 6, missions: ['strike', 'intercept', 'rebase'], carrierEligible: true },
  },
  wwii_fighter: {
    type: 'wwii_fighter', name: 'World War II Fighter',
    movementPoints: 5, visionRange: 3, strength: 42,
    canFoundCity: false, canBuildImprovements: false, productionCost: 240,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'intercept', 'rebase'], carrierEligible: true, interceptionStrengthMultiplier: 1.2 },
  },
  jet_fighter: {
    type: 'jet_fighter', name: 'Jet Fighter',
    movementPoints: 6, visionRange: 3, strength: 50,
    canFoundCity: false, canBuildImprovements: false, productionCost: 300,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10, missions: ['strike', 'intercept', 'rebase'], carrierEligible: true },
  },
  bomber: {
    type: 'bomber', name: 'Bomber',
    movementPoints: 5, visionRange: 3, strength: 48,
    canFoundCity: false, canBuildImprovements: false, productionCost: 280,
    domain: 'air',
    attackProfile: { kind: 'bombard', range: 3, targets: ['city', 'unit'] },
    airInterceptionDefense: { kind: 'turret-fire', counterDamageMultiplier: 0.25 },
    airOperation: { baseKinds: ['airfield'], operationalRange: 6, ferryRange: 12, missions: ['strike', 'rebase'], carrierEligible: false },
  },
  recon_aircraft: {
    type: 'recon_aircraft', name: 'Recon Aircraft', movementPoints: 5,
    visionRange: 3, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 230, domain: 'air',
    airOperation: { baseKinds: ['airfield'], operationalRange: 5, ferryRange: 10, missions: ['recon', 'rebase'], carrierEligible: false },
  },
  carrier: {
    type: 'carrier', name: 'Carrier',
    movementPoints: 4, visionRange: 3, strength: 45,
    canFoundCity: false, canBuildImprovements: false, productionCost: 220,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    carrierDeckCapacity: 2,
  },
  supercarrier: {
    type: 'supercarrier', name: 'Supercarrier',
    movementPoints: 4, visionRange: 3, strength: 58,
    canFoundCity: false, canBuildImprovements: false, productionCost: 340,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    carrierDeckCapacity: 3,
  },
  destroyer: {
    type: 'destroyer', name: 'Destroyer',
    movementPoints: 5, visionRange: 3, strength: 55,
    canFoundCity: false, canBuildImprovements: false, productionCost: 210,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    detection: { concealedNavalRange: 2 },
  },
  naval_strike_aircraft: {
    type: 'naval_strike_aircraft', name: 'Naval Strike Aircraft',
    movementPoints: 5, visionRange: 3, strength: 38,
    canFoundCity: false, canBuildImprovements: false, productionCost: 235,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    // No 'intercept' mission -- fighters stay the fleet's sole air-defense
    // answer (design spec §4). Range matches WWII Fighter's so the carrier
    // deck-composition choice (spec §6) is about role, not reach.
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: true },
  },
  maritime_patrol_aircraft: {
    type: 'maritime_patrol_aircraft', name: 'Maritime Patrol Aircraft',
    movementPoints: 5, visionRange: 4, strength: 0,
    canFoundCity: false, canBuildImprovements: false, productionCost: 210,
    domain: 'air',
    // No attackProfile -- non-combat, matching Recon Aircraft's precedent.
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10, missions: ['patrol', 'rebase'], carrierEligible: true },
  },
  // Era 11 units
  attack_helicopter: {
    type: 'attack_helicopter', name: 'Attack Helicopter',
    movementPoints: 5, visionRange: 3, strength: 40,
    canFoundCity: false, canBuildImprovements: false, productionCost: 230,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    // operationalRange also doubles as Air Assault's range (see
    // airborne-system.ts's getAirAssaultTargets, which reads this field
    // directly rather than storing a separate number). A future combat
    // rebalance of this value retunes Air Assault range too -- re-run
    // tests/systems/airborne-balance.test.ts's dominance check if you
    // change it.
    airOperation: { baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: false },
    airAssault: { baseKinds: ['helicopter_base'] },
  },
  missile_submarine: {
    type: 'missile_submarine', name: 'Missile Submarine',
    movementPoints: 5, visionRange: 3, strength: 56,
    canFoundCity: false, canBuildImprovements: false, productionCost: 250,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
    // #545: strategic-launch range (4) is deliberately one hex more than the
    // conventional attack range (3) but far short of Missile Silo's unlimited
    // reach -- survivability via concealment (#542's existing SUBMARINE_TYPES
    // machinery, unchanged), not range, is this platform's second-strike value.
    strategicLaunchPlatform: { range: 4 },
  },
  combat_drone: { type: 'combat_drone', name: 'Combat Drone', movementPoints: 6, visionRange: 3, strength: 42, canFoundCity: false, canBuildImprovements: false, productionCost: 224, domain: 'air', attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] }, airOperation: { baseKinds: ['airfield', 'helicopter_base', 'stealth_airbase', 'carrier'], operationalRange: 5, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: true } },
  autonomous_frigate: { type: 'autonomous_frigate', name: 'Autonomous Frigate', movementPoints: 5, visionRange: 3, strength: 60, canFoundCity: false, canBuildImprovements: false, productionCost: 336, domain: 'naval', waterAccess: 'ocean', attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] }, detection: { concealedNavalRange: 3 } },
  exosuit_infantry: { type: 'exosuit_infantry', name: 'Exosuit Infantry', movementPoints: 3, visionRange: 2, strength: 70, canFoundCity: false, canBuildImprovements: false, productionCost: 196, domain: 'land', attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] }, combinedArms: { provides: ['line-infantry'] }, airAssaultPassengerEligible: true },
  propagandist: { type: 'propagandist', name: 'Propagandist', movementPoints: 3, visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false, productionCost: 196, domain: 'land' },
  drone_controller: { type: 'drone_controller', name: 'Drone Controller', movementPoints: 3, visionRange: 3, strength: 0, canFoundCity: false, canBuildImprovements: false, productionCost: 196, domain: 'land' },
  // #544 MR3 — noncombat commander, spawned only by great-general-system.ts (never trainable, productionCost 0).
  // participatesInLandSupply is an explicit override: UNIT_CLASS_BY_TYPE tags it 'civilian', which would
  // otherwise default it out of land supply via unitParticipatesInLandSupply's derivation.
  great_general: { type: 'great_general', name: 'Great General', movementPoints: 3, visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false, productionCost: 0, domain: 'land', participatesInLandSupply: true },
  // S5 — trade unit
  caravan: {
    type: 'caravan', name: 'Caravan', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 60,
    domain: 'land',
  },
  // Trade Routes Overhaul (#553 MR2/4) — Land trade line successors to Caravan.
  merchant_wagon: {
    type: 'merchant_wagon', name: 'Merchant Wagon', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
    domain: 'land',
  },
  freight_convoy: {
    type: 'freight_convoy', name: 'Freight Convoy', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 220,
    domain: 'land',
  },
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line. movementPoints 3 matches
  // the existing civilian-ship convention (transport/carrack/galleon/steamship/
  // troop_transport are all flat 3), not the escalating combat-naval line.
  naval_trader: {
    type: 'naval_trader', name: 'Naval Trader', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 75,
    domain: 'naval', waterAccess: 'ocean',
  },
  steamship_trader: {
    type: 'steamship_trader', name: 'Steamship Trader', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'naval', waterAccess: 'ocean',
  },
  cargo_freighter: {
    type: 'cargo_freighter', name: 'Cargo Freighter', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 170,
    domain: 'naval', waterAccess: 'ocean',
  },
  container_ship: {
    type: 'container_ship', name: 'Container Ship', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 260,
    domain: 'naval', waterAccess: 'ocean',
  },
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line. Air units in this codebase
  // ignore terrain cost (getMovementCostForUnit's domain === 'air' branch always
  // returns 1), so movementPoints scales with era like biplane (4) / jet_fighter (6)
  // rather than staying flat like the land/naval trade lines.
  air_freighter: {
    type: 'air_freighter', name: 'Air Freighter', movementPoints: 4,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 150,
    domain: 'air',
  },
  jet_freighter: {
    type: 'jet_freighter', name: 'Jet Freighter', movementPoints: 5,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 230,
    domain: 'air',
  },
  global_air_cargo: {
    type: 'global_air_cargo', name: 'Global Air Cargo', movementPoints: 6,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 286,
    domain: 'air',
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
    canBuildImprovements: false, productionCost: 0, domain: 'naval', waterAccess: 'ocean',
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
    // #966: consistent with every other `kind: 'ranged'` unit. Inert for beast AI
    // in practice -- beast-system only issues attack orders against units, and a
    // beast owner can never run the city capture flow (no civ / war state).
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
  },
  // Era 12 units
  cyber_unit: {
    type: 'cyber_unit', name: 'Cyber Unit', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 338,
    domain: 'land',
    // strength 0: capturable economic saboteur, not a combatant — no attackProfile
  },
  stealth_bomber: {
    type: 'stealth_bomber', name: 'Stealth Bomber', movementPoints: 5,
    visionRange: 3, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 360,
    domain: 'air',
    attackProfile: { kind: 'bombard', range: 3, targets: ['unit', 'city'] },
    airInterceptionDefense: { kind: 'evasion', incomingDamageMultiplier: 0.65 },
    airOperation: { baseKinds: ['stealth_airbase'], operationalRange: 7, ferryRange: 14, missions: ['strike', 'rebase'], carrierEligible: false },
  },
};

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = Object.fromEntries(
  Object.entries(UNIT_DEFINITION_BASES).map(([type, definition]) => [
    type,
    { ...definition, barbarianEligibility: BARBARIAN_ELIGIBILITY_BY_UNIT[type as UnitType] },
  ]),
) as Record<UnitType, UnitDefinition>;

