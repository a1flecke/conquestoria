import type { HexCoord } from './types';

export const PIRATE_STATE_VERSION = 1;

export type PirateFactionId = `pirate-${number}`;
export type PirateBehavior = 'patrolling' | 'raiding' | 'blockading';
export type PirateMaritimeStage = 1 | 2 | 3 | 4 | 5;
export type PirateIntelLevel = 'rumor' | 'sighted' | 'tracked';
export const PIRATE_RELOCATION_DIRECTIONS = [
  'north', 'north-east', 'south-east', 'south', 'south-west', 'north-west',
] as const;
export type PirateRelocationDirection = (typeof PIRATE_RELOCATION_DIRECTIONS)[number];

export interface PirateSuppressionRecord {
  regionKey: string;
  amount: number;
  expiresAfterRound: number;
}

export interface PiratePressureState {
  value: number;
  suppression: PirateSuppressionRecord[];
}

export interface PirateRelocationPlan {
  plannedRound: number;
  resolvesOnRound: number;
  direction: PirateRelocationDirection;
  path: HexCoord[];
}

export interface PirateRelocationState {
  planned: PirateRelocationPlan | null;
  lastRelocatedRound: number | null;
}

export type PirateHeadquarters =
  | {
      kind: 'coastal-enclave';
      position: HexCoord;
      integrity: number;
      maxIntegrity: number;
    }
  | {
      kind: 'deep-sea-flotilla';
      flagshipUnitId: string;
      relocation: PirateRelocationState;
    };

export interface PirateTributeRecord {
  paidRound: number;
  protectedUntilRound: number;
}

export interface PirateDemandRecord {
  demandedRound: number;
  lastReminderRound: number | null;
  quotedCost: number;
}

export interface PirateContractState {
  employerId: string;
  targetId: string;
  startedRound: number;
  expiresAfterRound: number;
  successfulRaidCount: number;
  exposed: boolean;
  exposureResolvedRaidKeys: string[];
}

export interface PirateIntentState {
  kind: 'patrol' | 'raid' | 'blockade';
  targetCivId?: string;
  targetCityId?: string;
  targetUnitId?: string;
  plannedRound: number;
}

export interface PirateTransitionGuards {
  emittedEventKeys: string[];
  lastDemandReminderRoundByCiv?: Record<string, number>;
  lastBehaviorTransitionRound?: number;
  lastStageReinforcementRound?: number;
  lastFlagshipAttackedRound?: number;
}

export interface PirateFactionState {
  id: PirateFactionId;
  name: string;
  spawnedRound: number;
  behavior: PirateBehavior;
  maritimeStage: PirateMaritimeStage;
  notoriety: number;
  shipIds: string[];
  headquarters: PirateHeadquarters;
  tributeByCiv: Record<string, PirateTributeRecord>;
  demandByCiv: Record<string, PirateDemandRecord>;
  contract: PirateContractState | null;
  intent: PirateIntentState | null;
  transitionGuards: PirateTransitionGuards;
}

export interface PirateIntelRegion {
  center: HexCoord;
  radius: number;
}

export interface PirateHeadquartersIntel {
  kind: PirateHeadquarters['kind'];
  position: HexCoord;
  observedRound: number;
  integrityBand?: 'healthy' | 'worn' | 'damaged' | 'critical';
}

export interface PirateFactionIntel {
  factionId: PirateFactionId;
  level: PirateIntelLevel;
  discoveredRound: number;
  lastUpdatedRound: number;
  approximateRegion?: PirateIntelRegion;
  lastKnownHeadquarters?: PirateHeadquartersIntel;
  knownBehavior?: PirateBehavior;
  knownMaritimeStage?: PirateMaritimeStage;
  observedUnitIds?: string[];
  plannedRelocationDirection?: PirateRelocationPlan['direction'];
}

export type PirateHistoryEntry =
  | {
      id: string;
      kind: 'destroyed';
      factionId: PirateFactionId;
      factionName: string;
      round: number;
      headquartersKind: PirateHeadquarters['kind'];
      lastKnownPosition?: HexCoord;
      destroyedByOwnerId: string | null;
      bountyAwarded: number;
      reason: 'combat' | 'enclave-assault' | 'missing-flagship' | 'migration-repair';
    }
  | {
      id: string;
      kind: 'contract-resolved';
      factionId: PirateFactionId;
      factionName: string;
      round: number;
      employerId: string;
      targetId: string;
      exposed: boolean;
      successfulRaidCount: number;
      outcome: 'expired' | 'faction-destroyed' | 'employer-eliminated' | 'target-eliminated';
    };

export interface PirateState {
  version: number;
  factions: Record<string, PirateFactionState>;
  history: PirateHistoryEntry[];
  pressure: PiratePressureState;
  intelByCiv: Record<string, Record<string, PirateFactionIntel>>;
  nextSpawnCheckTurn: number;
  activatedTurn: number | null;
  activationWarningDeliveredByCiv: Record<string, boolean>;
}

export function createEmptyPirateState(): PirateState {
  return {
    version: PIRATE_STATE_VERSION,
    factions: {},
    history: [],
    pressure: { value: 0, suppression: [] },
    intelByCiv: {},
    nextSpawnCheckTurn: 0,
    activatedTurn: null,
    activationWarningDeliveredByCiv: {},
  };
}
