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

/**
 * A hostile operation that landed on a civ, kept on the VICTIM's own espionage record (#419 PR 2).
 * `tracedTurn` is set once the victim holds evidence naming the actor (a detected threat or a captured spy);
 * until then the actor is stored but never surfaced. `usedTurn` is set when the victim has gone public about it.
 */
export interface OperationIncident {
  id: string;
  actorCivId: string;
  targetCivId: string;
  cityId: string | null;
  missionType: OperationMissionType;
  landedTurn: number;
  tracedTurn?: number;
  usedTurn?: number;
}

/** A victim told the world who struck them (Go public). */
export interface WentPublicEvent {
  /** The victim who went public. */
  civId: string;
  /** The civ they named. */
  culpritCivId: string;
  /** Treaty partners of the culprit whose relationship soured (capped by expose_scandal's rule). */
  partnerCivIds: string[];
  missionType: OperationMissionType;
}

/** Evidence arrived (after the strike) that names who ran an operation. Delivered to the victim only. */
export interface IncidentTracedEvent {
  /** The victim, who now holds the evidence. */
  civId: string;
  incidentId: string;
  actorCivId: string;
  missionType: OperationMissionType;
  cityId: string | null;
}
