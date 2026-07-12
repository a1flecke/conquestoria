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

export type NetworkPlanDefinitionId = 'harden' | 'exploit';

export interface NetworkPlan {
  id: string;
  ownerCivId: string;
  definitionId: NetworkPlanDefinitionId;
  sourceUnitId: string;
  target: NetworkPlanTarget;
  status: NetworkPlanStatus;
  createdTurn: number;
  nextResolutionTurn: number;
  warnedTurn: number | null;
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
}

export function createEmptyAutonomyCivState(): AutonomyCivState {
  return { plans: {}, detections: {} };
}
