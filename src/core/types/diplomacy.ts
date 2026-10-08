// Diplomacy, war and pending-request contracts (#1361). Persisted via DiplomacyState / GameState; shapes are save-stable.
// Contract/data types and the pending-request kind inventory only: no behavior lives here.

// --- Diplomacy ---

export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance'
  | 'offer_vassalage'
  | 'petition_independence'
  | 'release_vassal'
  | 'defend_vassal'
  | 'propose_embargo'
  | 'join_embargo'
  | 'leave_embargo'
  | 'propose_league'
  | 'invite_to_league'
  | 'petition_league'
  | 'leave_league'
  | 'reabsorb_breakaway'
  | 'arms_control_pact'
  | 'demand_tribute';

export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage' | 'arms_control_pact' | 'tribute';

/**
 * #1334: the directional terms of a standalone tribute contract (a strong civilization coercing a weaker, known one
 * into a temporary gold payment without war). Fixed when the demand is made; never recomputed from a later era.
 */
export interface TributeTerms {
  demanderId: string;
  payerId: string;
  goldPerRound: number;
}

/**
 * #1090: canonical here (not in `src/ai/ai-treaty-consent.ts`, which imports it) so this event
 * payload type can reference it without creating a core -> ai dependency. `ai-treaty-consent.ts`
 * is the sole computer of a `TreatyDeclineReason` value; this file only names the shape.
 */
export type TreatyDeclineReason = 'relations-too-strained' | 'strategic-caution' | 'peace-not-acceptable' | 'terms-too-costly';

export interface Treaty {
  type: TreatyType;
  civA: string;
  civB: string;
  turnsRemaining: number;     // -1 = permanent until broken
  goldPerTurn?: number;       // for trade agreements
  // #545 MR6: only set for arms_control_pact -- see computeArmsControlCap in
  // strategic-arsenal-system.ts. Absent on every other treaty type.
  arsenalCap?: number;
  /** #1334: only set for `type === 'tribute'`; `turnsRemaining` counts the payment rounds left. Mirrored on both civs. */
  tribute?: TributeTerms;
}

export interface DiplomaticEvent {
  type: string;               // 'war_declared', 'peace_made', 'treaty_broken', etc.
  turn: number;
  otherCiv: string;
  weight: number;             // decays over time
}

export interface VassalageState {
  overlord: string | null;
  vassals: string[];
  protectionScore: number;
  protectionTimers: Array<{
    attackerCivId: string;
    turnsRemaining: number;
  }>;
  peakCities: number;
  peakMilitary: number;
}

export interface DiplomacyState {
  relationships: Record<string, number>;    // civId -> score (-100 to +100)
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
  treacheryScore: number;
  vassalage: VassalageState;
  /** #545 MR4 spec §11: ids of every civ that has ever struck this civ with a
   * strategic strike. Append-only, never pruned or decayed -- unlike the
   * capped rolling `events` log, a nuclear strike must never be "forgotten"
   * for retaliation-classification purposes. Optional (absent means never
   * struck), matching this codebase's convention for new fields on widely
   * hand-constructed types (e.g. `Civilization.strategicArsenal?`) -- a
   * required field here would break every test file that builds a
   * `DiplomacyState` literal without it. Always read via `?? []`; see
   * strategic-launch-system.ts's isStrategicStrikeRetaliation. */
  strategicStrikesReceivedFrom?: string[];
  /** #988: this civ's own declared purpose for each war it holds, keyed by
   * opponent civ id. Absent map, or a missing key for an opponent this civ is
   * at war with, both mean "no declared goal" (a war can exist without one --
   * white peace stays available either way). Never persist derived
   * satisfaction here; {@link getWarGoalStatus} recomputes it from live state
   * every time. */
  warGoals?: Record<string, WarGoal>;
}

export type WarGoalKind = 'conquer_city' | 'liberate_city' | 'force_vassalage';

export interface WarGoal {
  kind: WarGoalKind;
  opponentCivId: string;
  /** Required for 'conquer_city' and 'liberate_city'; unused for 'force_vassalage'. */
  targetCityId?: string;
  declaredTurn: number;
  /** Bookkeeping for overreach detection (#988) -- every city taken from
   * `opponentCivId` while this goal is active increments this, regardless of
   * whether it was the declared target. Not a history ledger: a per-war
   * counter only, cleared by peace (see `makePeace`). Redeclaring a goal
   * against the same still-at-war opponent deliberately carries this forward
   * rather than resetting it -- see `declareWarGoal`'s doc comment for why. */
  citiesCapturedFromOpponent: number;
  /** One-time guard so exceeding the goal costs reputation exactly once per
   * war, not once per turn it stays exceeded. */
  overreachPenaltyApplied: boolean;
}

export type WarGoalStatus = 'none' | 'active' | 'satisfied' | 'exceeded' | 'abandoned';

export type SettlementTermKind = 'transfer_city' | 'reparations' | 'vassalize' | 'release_vassal';

/**
 * One executable peace term. Every variant maps onto a canonical state
 * transition that already exists elsewhere (`transferCapturedCityOwnership`,
 * plain gold arithmetic, `commitVassalageAgreement`, `releaseVassal`) -- a
 * term the engine cannot enforce must never be constructed (#988).
 */
export interface SettlementTerm {
  kind: SettlementTermKind;
  /** transfer_city only: the city changing hands. */
  cityId?: string;
  /** transfer_city: current owner ceding the city. reparations: the payer. */
  fromCivId?: string;
  /** transfer_city: the recipient. reparations: the payee. */
  toCivId?: string;
  /** reparations only: one-time gold amount. */
  goldAmount?: number;
  /** vassalize / release_vassal: the civ becoming/ceasing to be a vassal. */
  vassalId?: string;
  /** vassalize only: the civ becoming overlord. */
  overlordId?: string;
}

// --- War History (#991) ---

export type WarParticipantSide = 'aggressor' | 'defender';
export type WarLeaveReason = 'peace' | 'eliminated';
export type WarOutcome = 'settled' | 'white-peace' | 'aggressor-eliminated' | 'defender-eliminated';

/** One civ's membership span in a war. A civ dragged in later (vassal, league)
 * gets its own entry with `joinedTurn` after `war.startTurn`. */
export interface WarParticipant {
  civId: string;
  side: WarParticipantSide;
  joinedTurn: number;
  /** Absent while still a combatant. */
  leftTurn?: number;
  leaveReason?: WarLeaveReason;
}

/**
 * A recorded, deterministic fact about a war -- never a heuristic "importance
 * score." Every variant is something the engine can determine exactly at the
 * moment it happens (#991: "a turning point must be defined by rule... not by
 * heuristic scoring, or the record becomes unreproducible"). Plain
 * serializable facts only, matching `GeneralCareerEvent`'s own convention --
 * presentation resolves names/copy later, never stored here.
 */
export type WarHistoryEvent =
  | { type: 'declared'; turn: number; aggressorId: string; defenderId: string }
  | { type: 'participant-joined'; turn: number; civId: string; side: WarParticipantSide }
  | { type: 'participant-left'; turn: number; civId: string; reason: WarLeaveReason }
  | { type: 'participant-eliminated'; turn: number; civId: string }
  | { type: 'city-captured'; turn: number; cityId: string; cityName: string; fromCivId: string; toCivId: string; wasCapital: boolean }
  | { type: 'goal-declared'; turn: number; civId: string; opponentCivId: string; kind: WarGoalKind }
  | { type: 'settlement-signed'; turn: number; termCount: number }
  | { type: 'concluded'; turn: number; outcome: WarOutcome };

/**
 * A persistent, named historical record of one war -- the object #991 exists
 * to create. Distinct from, and never a replacement for, the capped rolling
 * `DiplomaticEvent` log on `DiplomacyState` (#991's own non-goal). Survives
 * elimination of any participant (`historical` in `ELIMINATED_CIV_AREAS`) --
 * a chronicle entry, like `GeneralHistoryEntry`/discovered wonders.
 */
export interface WarRecord {
  id: string;
  /** Deterministic template choice (index into a fixed candidate array) so a
   * viewer missing knowledge of a participant can re-render the SAME chosen
   * template with a redacted name, rather than a different canonical string
   * being computed twice. Never re-rolled. */
  nameTemplateIndex: number;
  /** The two civs at the moment of declaration -- distinct from `participants`,
   * which also carries every later join/leave. */
  originalAggressorId: string;
  originalDefenderId: string;
  startTurn: number;
  /** Absent while the war is ongoing. */
  endTurn?: number;
  participants: WarParticipant[];
  /** Append-only, soft-capped (see `MAX_WAR_HISTORY_EVENTS` in war-history-system.ts). */
  events: WarHistoryEvent[];
  outcome?: WarOutcome;
}

export interface Embargo {
  id: string;
  targetCivId: string;
  participants: string[];
  proposedTurn: number;
}

export interface DefensiveLeague {
  id: string;
  members: string[];
  formedTurn: number;
}

/**
 * The one inventory of pending diplomatic request kinds (#1354 follow-up). The union is derived from it, and the
 * load-time validator table in `src/storage/pending-request-normalization.ts` is typed over the union, so a new kind
 * cannot be added without saying how it is validated when a save is loaded.
 */
export const PENDING_DIPLOMATIC_REQUEST_TYPES = ['peace', 'treaty', 'independence', 'settlement', 'tribute'] as const;

export interface PendingDiplomaticRequest {
  id: string;
  type: typeof PENDING_DIPLOMATIC_REQUEST_TYPES[number];
  treatyType?: TreatyType;        // set when type === 'treaty'
  turnsRemaining?: number;         // treaty duration to sign with (mirrors AI decision: 10 for NAP, -1 otherwise)
  /** #988: set when type === 'settlement' -- a negotiated peace offer with
   * executable terms. An empty array is a valid (if unusual) settlement offer
   * carrying no terms beyond ending the war; plain unconditional white peace
   * keeps using type 'peace' with no terms field at all. */
  terms?: SettlementTerm[];
  /** #1334: set when type === 'tribute' -- the immutable proposed terms (`fromCivId` is the demander, `toCivId` the payer). */
  tribute?: TributeTerms & { rounds: number };
  fromCivId: string;
  toCivId: string;
  turnIssued: number;
}
