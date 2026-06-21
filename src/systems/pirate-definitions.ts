import type { UnitType } from '@/core/types';
import type { PirateBehavior, PirateMaritimeStage } from '@/core/pirate-state';

export const PIRATE_HULL_TYPES = [
  'pirate_galley',
  'pirate_corsair',
  'pirate_frigate',
  'pirate_ironclad',
  'pirate_fast_attack_craft',
  'pirate_mothership',
] as const satisfies readonly UnitType[];

export type PirateHullType = (typeof PIRATE_HULL_TYPES)[number];
export type PirateSfxFamily =
  | 'oared-raider'
  | 'sail-raider'
  | 'cannon-raider'
  | 'iron-raider'
  | 'fast-attack-raider'
  | 'command-flotilla';

export interface PirateHullDefinition {
  type: PirateHullType;
  name: string;
  introducedAtStage: PirateMaritimeStage;
  strength: number;
  movementPoints: number;
  visionRange: number;
  mapIcon: string;
  spriteId: PirateHullType;
  sfxFamily: PirateSfxFamily;
}

export const PIRATE_HULL_DEFINITIONS: Record<PirateHullType, PirateHullDefinition> = {
  pirate_galley: {
    type: 'pirate_galley', name: 'Pirate Galley', introducedAtStage: 1,
    strength: 14, movementPoints: 3, visionRange: 3,
    mapIcon: 'sail', spriteId: 'pirate_galley', sfxFamily: 'oared-raider',
  },
  pirate_corsair: {
    type: 'pirate_corsair', name: 'Corsair Xebec', introducedAtStage: 2,
    strength: 20, movementPoints: 4, visionRange: 3,
    mapIcon: 'lateen-sail', spriteId: 'pirate_corsair', sfxFamily: 'sail-raider',
  },
  pirate_frigate: {
    type: 'pirate_frigate', name: 'Pirate Frigate', introducedAtStage: 3,
    strength: 28, movementPoints: 4, visionRange: 4,
    mapIcon: 'broadside', spriteId: 'pirate_frigate', sfxFamily: 'cannon-raider',
  },
  pirate_ironclad: {
    type: 'pirate_ironclad', name: 'Ironclad Raider', introducedAtStage: 4,
    strength: 36, movementPoints: 4, visionRange: 4,
    mapIcon: 'iron-hull', spriteId: 'pirate_ironclad', sfxFamily: 'iron-raider',
  },
  pirate_fast_attack_craft: {
    type: 'pirate_fast_attack_craft', name: 'Fast Attack Craft', introducedAtStage: 5,
    strength: 40, movementPoints: 5, visionRange: 5,
    mapIcon: 'fast-craft', spriteId: 'pirate_fast_attack_craft', sfxFamily: 'fast-attack-raider',
  },
  pirate_mothership: {
    type: 'pirate_mothership', name: 'Pirate Mothership', introducedAtStage: 5,
    strength: 46, movementPoints: 4, visionRange: 5,
    mapIcon: 'command-ship', spriteId: 'pirate_mothership', sfxFamily: 'command-flotilla',
  },
};

export interface PirateStageDefinition {
  stage: PirateMaritimeStage;
  triggerTechId: string;
  anchorHull: PirateHullType;
  allowedHulls: readonly PirateHullType[];
  rosterWeights: readonly { hull: PirateHullType; weight: number }[];
  stats: Pick<PirateHullDefinition, 'strength' | 'movementPoints' | 'visionRange'>;
  mapIcon: string;
  spriteId: PirateHullType;
  sfxFamily: PirateSfxFamily;
}

function defineStage(
  stage: PirateMaritimeStage,
  triggerTechId: string,
  anchorHull: PirateHullType,
  rosterWeights: readonly { hull: PirateHullType; weight: number }[],
): PirateStageDefinition {
  const anchor = PIRATE_HULL_DEFINITIONS[anchorHull];
  return {
    stage,
    triggerTechId,
    anchorHull,
    allowedHulls: rosterWeights.map(entry => entry.hull),
    rosterWeights,
    stats: {
      strength: anchor.strength,
      movementPoints: anchor.movementPoints,
      visionRange: anchor.visionRange,
    },
    mapIcon: anchor.mapIcon,
    spriteId: anchor.spriteId,
    sfxFamily: anchor.sfxFamily,
  };
}

export const PIRATE_STAGE_DEFINITIONS = [
  defineStage(1, 'galleys', 'pirate_galley', [
    { hull: 'pirate_galley', weight: 1 },
  ]),
  defineStage(2, 'navigation', 'pirate_corsair', [
    { hull: 'pirate_corsair', weight: 5 },
    { hull: 'pirate_galley', weight: 3 },
  ]),
  defineStage(3, 'triremes', 'pirate_frigate', [
    { hull: 'pirate_frigate', weight: 5 },
    { hull: 'pirate_corsair', weight: 3 },
    { hull: 'pirate_galley', weight: 2 },
  ]),
  defineStage(4, 'caravels', 'pirate_ironclad', [
    { hull: 'pirate_ironclad', weight: 5 },
    { hull: 'pirate_frigate', weight: 3 },
    { hull: 'pirate_corsair', weight: 2 },
  ]),
  defineStage(5, 'amphibious-warfare', 'pirate_mothership', [
    { hull: 'pirate_mothership', weight: 1 },
    { hull: 'pirate_fast_attack_craft', weight: 5 },
    { hull: 'pirate_ironclad', weight: 3 },
    { hull: 'pirate_frigate', weight: 2 },
  ]),
] as const satisfies readonly PirateStageDefinition[];

export const PIRATE_PRESSURE = {
  activationSeed: 4,
  checkInterval: 4,
  threshold: 6,
  cap: 18,
  baseGain: 2,
  tradeRouteGainCap: 2,
  wealthyCityGainCap: 2,
  wealthyGrossGold: 8,
} as const;

export const PIRATE_NOTORIETY = {
  raiding: 2,
  blockading: 5,
  survivalInterval: 8,
} as const;

export const PIRATE_FACTION_CAP_BY_MAP_SIZE = {
  small: 3,
  medium: 4,
  large: 5,
} as const satisfies Record<'small' | 'medium' | 'large', number>;

export const PIRATE_MAX_FLOTILLA_FACTIONS = 2;

export const PIRATE_FLEET_SIZE_BY_BEHAVIOR = {
  patrolling: { min: 1, max: 2 },
  raiding: { min: 2, max: 3 },
  blockading: { min: 3, max: 4 },
} as const satisfies Record<PirateBehavior, { min: number; max: number }>;

export const PIRATE_TRIBUTE_BASE = { patrolling: 15, raiding: 30, blockading: 50 } as const;
export const PIRATE_STAGE_SURCHARGE = [0, 0, 5, 10, 15, 20] as const;
export const PIRATE_PLUNDER_CAP = [0, 5, 8, 12, 16, 20] as const;
export const PIRATE_BOUNTY_BASE = { patrolling: 10, raiding: 25, blockading: 45 } as const;

export const PIRATE_ACTION_RULES = {
  tributeDurationRounds: 15,
  demandReminderRounds: 8,
  contractDurationRounds: 8,
  contractCostMultiplier: 2,
  contractExposureChance: 0.25,
  contractExposureRelationshipPenalty: -30,
  enclaveAssault: {
    baseDamage: 15,
    strengthDivisor: 5,
    maximumDamage: 35,
    counterfireByBehavior: { patrolling: 0, raiding: 8, blockading: 14 },
  },
} as const;

export function getPirateStageDefinition(stage: PirateMaritimeStage): PirateStageDefinition {
  return PIRATE_STAGE_DEFINITIONS[stage - 1];
}

export function getPirateTributeCost(behavior: PirateBehavior, stage: PirateMaritimeStage): number {
  return PIRATE_TRIBUTE_BASE[behavior] + PIRATE_STAGE_SURCHARGE[stage];
}

export function getPirateBounty(behavior: PirateBehavior, stage: PirateMaritimeStage): number {
  return PIRATE_BOUNTY_BASE[behavior] + stage * 5;
}

function createPirateRng(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function drawWeightedHull(
  entries: PirateStageDefinition['rosterWeights'],
  rng: () => number,
): PirateHullType {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let draw = rng() * totalWeight;
  for (const entry of entries) {
    draw -= entry.weight;
    if (draw < 0) return entry.hull;
  }
  return entries[entries.length - 1].hull;
}

export function composePirateFleet(
  stage: PirateMaritimeStage,
  behavior: PirateBehavior,
  seed: string,
): PirateHullType[] {
  const definition = getPirateStageDefinition(stage);
  const sizeRange = PIRATE_FLEET_SIZE_BY_BEHAVIOR[behavior];
  const rng = createPirateRng(`${stage}:${behavior}:${seed}`);
  const size = sizeRange.min + Math.floor(rng() * (sizeRange.max - sizeRange.min + 1));
  const fleet: PirateHullType[] = [definition.anchorHull];
  while (fleet.length < size) fleet.push(drawWeightedHull(definition.rosterWeights, rng));
  return fleet;
}
