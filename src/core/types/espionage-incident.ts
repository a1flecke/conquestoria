// Hostile-operation notice contract (#419). Leaf: imports nothing; used by the diplomacy event family and the espionage notification routes.

/** The spy missions whose successful disruption is announced to both sides. */
export type OperationMissionType =
  | 'cyber_attack'
  | 'misinformation_campaign'
  | 'sabotage_production'
  | 'steal_tech'
  | 'incite_unrest';

/** What actually changed, taken from the mission's own result, so notice text can never drift from the mechanic. */
export type OperationEffect =
  | { kind: 'production-lockout'; turns: number }
  | { kind: 'research-penalty'; turns: number; percent: number }
  | { kind: 'progress-lost'; amount: number }
  | { kind: 'tech-stolen'; techId: string }
  | { kind: 'unrest-injected'; amount: number };

export interface OperationLandedEvent {
  /** The acting civilization. Omniscient: a victim-facing surface must go through `getOperationAttribution` before naming it. */
  civId: string;
  targetCivId: string;
  missionType: OperationMissionType;
  /** The struck city, when the mission is city-scoped. */
  cityId: string | null;
  effect: OperationEffect;
}
