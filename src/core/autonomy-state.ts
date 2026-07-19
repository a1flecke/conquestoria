import type { HexCoord } from './types';

export type NetworkPlanTarget =
  | { kind: 'city'; cityId: string }
  | { kind: 'unit'; unitId: string }
  | { kind: 'formation'; unitIds: string[] }
  | { kind: 'route'; routeId: string }
  | { kind: 'zone'; center: HexCoord; radius: number };

export type NetworkPlanStatus =
  | 'preparing'
  | 'active'
  | 'paused'
  | 'recovering'
  | 'completed'
  | 'canceled';

export type NetworkPlanDefinitionId =
  | 'harden'
  | 'exploit'
  | 'fabrication-sprint'
  | 'research-mesh'
  | 'logistics-routing'
  | 'survey-grid'
  | 'guardian-screen'
  | 'swarm-strike';

export type NetworkPlanSource =
  | { kind: 'unit'; unitId: string }
  | { kind: 'city'; cityId: string };

export type AutonomyPostureId = 'safeguarded' | 'integrated' | 'accelerated';

export interface NetworkPlan {
  id: string;
  ownerCivId: string;
  definitionId: NetworkPlanDefinitionId;
  sourceUnitId?: string;
  /** MR4 source form; sourceUnitId remains for schema-3 compatibility until migration normalizes it. */
  source?: NetworkPlanSource;
  target: NetworkPlanTarget;
  status: NetworkPlanStatus;
  createdTurn: number;
  nextResolutionTurn: number;
  warnedTurn: number | null;
  effectState?: {
    cdcDelayApplied?: boolean;
    hardenCharges?: number;
  };
}

export interface NetworkViewerDetection {
  planId: string;
  detectedTurn: number;
  sourceIdentityKnown: boolean;
  sourcePositionKnown: boolean;
}

export interface AutonomyCivState {
  plans: Record<string, NetworkPlan>;
  detections: Record<string, NetworkViewerDetection>;
  posture: AutonomyPostureId;
  pendingPosture: { id: AutonomyPostureId; appliesOnTurn: number } | null;
  surgeRecoveryUntilTurn: number | null;
  surgeCooldownUntilTurn: number | null;
}

export function createEmptyAutonomyCivState(): AutonomyCivState {
  return {
    plans: {},
    detections: {},
    posture: 'integrated',
    pendingPosture: null,
    surgeRecoveryUntilTurn: null,
    surgeCooldownUntilTurn: null,
  };
}
