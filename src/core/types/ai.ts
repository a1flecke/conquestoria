// AI planning and national-intent contracts (#1361). Persisted via OpponentAIState; shapes are save-stable.
// Contract/data types only: no behavior lives here.
import type { AutonomyCivState } from '../autonomy-state';
import type { HexCoord } from './hex';
import type { ResourceType } from './resources';

export type OpponentChallenge = 'explorer' | 'standard' | 'veteran';

export type AIStrategicRole =
  | 'capture'
  | 'frontline'
  | 'anti-armor'
  | 'ranged'
  | 'siege'
  | 'mobile'
  | 'air-combat'
  | 'air-defense'
  | 'naval-combat'
  | 'transport'
  | 'escort'
  | 'recon'
  | 'detection'
  | 'settlement'
  | 'worker'
  | 'resource-expedition'
  | 'trade'
  | 'espionage'
  | 'missionary';

export type AIStrategicObjective =
  | 'defend'
  | 'recover'
  | 'expand'
  | 'secure-resource'
  | 'raid'
  | 'blockade'
  | 'repel'
  | 'capture'
  | 'support-ally';

export type AIPlanReason =
  | 'urgent-defense'
  | 'nearby-opportunity'
  | 'retaliate-recent-attack'
  | 'continue-active-war'
  | 'alliance-obligation'
  | 'critical-resource'
  | 'no-local-alternative'
  | 'homeland-secure'
  | 'recover-damaged-force'
  | 'modernization-gap'
  | 'camp-defense'
  | 'visible-stampede'
  | 'opportunistic-raid'
  | 'domination-pursuit'
  // #1089: barbarian archetype-specific target selection (predator/warlord); see
  // src/systems/barbarian-archetype.ts.
  | 'predator-hunt'
  | 'warlord-mobilizing';

export type AIPlanPhase =
  | 'scouting'
  | 'mobilizing'
  | 'advancing'
  | 'attacking'
  | 'consolidating'
  | 'withdrawing'
  | 'complete'
  | 'abandoned';

export type AITarget =
  | { kind: 'city'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'unit'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'resource'; resource: ResourceType; position: HexCoord }
  | { kind: 'camp'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'region'; id: string; anchor: HexCoord };

export interface AIStrategicPlan {
  id: string;
  actorId: string;
  objective: AIStrategicObjective;
  target: AITarget;
  theaterId: string;
  phase: AIPlanPhase;
  reasonCodes: AIPlanReason[];
  commitment: number;
  createdTurn: number;
  reconsiderAfterTurn: number;
  expiresAfterTurn: number;
  lastProgressTurn: number;
  rallyPoint?: HexCoord;
  requiredRoles: Partial<Record<AIStrategicRole, number>>;
  supportRoles?: Partial<Record<AIStrategicRole, number>>;
  assignedUnitIds: string[];
}

export interface MajorCivPlanPortfolio {
  primaryPlan: AIStrategicPlan | null;
  defensePlansByCityId: Record<string, AIStrategicPlan>;
  upgradeRoutesByUnitId: Record<string, {
    cityId: string;
    createdTurn: number;
  }>;
  modernizationDemand: number;
  researchTargetTechId: string | null;
  lastPlannedTurn: number;
  lastExecutedTurn: number;
}

export interface CivPressureLedger {
  activeIndependentThreatIds: string[];
  recoveryUntilTurn: number;
  lastResolvedThreatTurn: number | null;
  lastWarningTurnByKey: Record<string, number>;
  lastStrategicAudioTurn: number | null;
}

// #1086: a persistent, long-horizon (dozens of turns) strategic ambition layer above
// MajorCivPlanPortfolio. `recover` is reachable only via a shock override (never chosen
// by ordinary ambition scoring) -- see ai-national-intent.ts.
export type NationalIntent = 'expand' | 'develop' | 'dominate' | 'deter' | 'recover';

export type NationalIntentReason =
  | 'intent-initial-selection'
  | 'intent-shock-recover'
  | 'intent-shock-resolved'
  | 'intent-sustained-evidence'
  | 'intent-hysteresis-retained'
  | 'intent-personality-bias'
  | 'intent-domination-pursuit';

export interface NationalIntentState {
  current: NationalIntent;
  previous: NationalIntent | null;
  selectedTurn: number;
  reconsiderAfterTurn: number;
  shockActive: boolean;
  /** consecutive not-shocked rounds while `current === 'recover'`; 0 otherwise. */
  shockFreeStreak: number;
  reasonCodes: NationalIntentReason[];
}

export interface OpponentAIState {
  version: 1;
  migrationGraceRoundsRemaining: number;
  majorCivs: Record<string, MajorCivPlanPortfolio>;
  barbarianCamps: Record<string, AIStrategicPlan>;
  barbarianHomeCampByUnitId: Record<string, string>;
  minorCivs: Record<string, AIStrategicPlan>;
  pressureByCiv: Record<string, CivPressureLedger>;
  nationalIntentByCiv: Record<string, NationalIntentState>;
  lastPlannedRound: number | null;
  lastProcessedRound: number | null;
  lastFinalizedRound: number | null;
}

/**
 * The AI-owned slice of `GameState` (#1361). `GameState` extends this interface, so every field keeps its name,
 * optionality and persisted representation; consumers that only read AI/opponent state can take this slice (or a
 * `Pick` of it) instead of the whole `GameState`.
 */
export interface AiGameState {
  opponentChallenge?: OpponentChallenge;
  pendingOpponentChallenge?: OpponentChallenge;
  opponentAI?: OpponentAIState;
  autonomyByCiv?: Record<string, AutonomyCivState>;
  networkCivicPressureByCity?: Record<string, number>;
}
