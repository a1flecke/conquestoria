/**
 * Load-time normalization of `GameState.pendingDiplomacyRequests` (#1354 follow-up).
 *
 * The request kind is a persisted discriminated union. The validator table below is typed
 * `Record<PendingDiplomaticRequest['type'], ...>` over the canonical inventory, so adding a kind to
 * `PENDING_DIPLOMATIC_REQUEST_TYPES` does not compile until this file says how that kind is validated; a kind that
 * is nowhere in the table (a hand-edited or future save) is dropped, never kept by omission. A hand-written
 * `type !== 'a' && type !== 'b'` allowlist is what silently dropped every settlement offer before, and it is not
 * how this file works.
 *
 * Loading repairs and validates records only. It never accepts, signs, pays, transfers or otherwise decides
 * anything for a player: a request that survives is exactly as pending as it was when it was saved.
 */
import type { PendingDiplomaticRequest, SettlementTerm, SettlementTermKind, TreatyType } from '@/core/types';
import { PENDING_DIPLOMATIC_REQUEST_TYPES } from '@/core/types';
import { CONSENT_TREATY_TYPES, PENDING_DIPLOMATIC_REQUEST_TTL_TURNS } from '@/systems/diplomacy-requests';
import { TRIBUTE_DURATION_ROUNDS, TRIBUTE_MAX_GOLD_PER_ROUND } from '@/systems/diplomacy-tribute';

/** What a kind-specific validator may read about the (already normalized) vassalage graph. */
export interface PendingRequestContext {
  /** vassal id -> overlord id for every verified, bilateral vassalage. */
  vassalagePairs: ReadonlyMap<string, string>;
  /** Normalized roles, by civ id. */
  vassalageRecords: Readonly<Record<string, { overlord: string | null; vassals: readonly string[] }>>;
}

export interface NormalizePendingRequestsInput extends PendingRequestContext {
  requests: unknown;
  turn: number;
  /** A living major civilization. */
  living: (id: unknown) => id is string;
}

type KindValidator = (request: PendingDiplomaticRequest, context: PendingRequestContext) => boolean;

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Structural validity of one serialized settlement term, by kind. Typed over `SettlementTermKind` so a new term kind
 * also fails to compile until it is described. The executor (`validateSettlementTerm`) still owns live gameplay
 * legality when the offer is accepted; load only guarantees the shape is meaningful.
 */
const SETTLEMENT_TERM_VALIDATORS: Record<SettlementTermKind, (term: SettlementTerm) => boolean> = {
  transfer_city: t => text(t.cityId) && text(t.fromCivId) && text(t.toCivId) && t.fromCivId !== t.toCivId,
  reparations: t => text(t.fromCivId) && text(t.toCivId) && t.fromCivId !== t.toCivId
    && Number.isFinite(t.goldAmount) && (t.goldAmount as number) > 0,
  vassalize: t => text(t.vassalId) && text(t.overlordId) && t.vassalId !== t.overlordId,
  release_vassal: t => text(t.vassalId),
};

function isValidSettlementTerm(term: unknown): boolean {
  if (!term || typeof term !== 'object') return false;
  const kind = (term as SettlementTerm).kind;
  if (typeof kind !== 'string' || !Object.hasOwn(SETTLEMENT_TERM_VALIDATORS, kind)) return false;
  return SETTLEMENT_TERM_VALIDATORS[kind](term as SettlementTerm);
}

const VALID_TREATY_REQUEST_TYPES: ReadonlySet<TreatyType> = new Set<TreatyType>([...CONSENT_TREATY_TYPES, 'vassalage']);

/**
 * One validator per request kind. `fromCivId`/`toCivId`, the id, the turn window and de-duplication are common and
 * handled by the caller; these check each kind's own payload.
 */
export const PENDING_REQUEST_VALIDATORS: Record<PendingDiplomaticRequest['type'], KindValidator> = {
  // A bilateral request with no payload beyond the common shape.
  peace: () => true,
  treaty: (request, context) => {
    if (!request.treatyType || !VALID_TREATY_REQUEST_TYPES.has(request.treatyType)) return false;
    if (request.treatyType !== 'vassalage') return true;
    // A vassalage offer cannot be pending for a civ that is already someone's vassal or already has vassals.
    const from = context.vassalageRecords[request.fromCivId];
    const to = context.vassalageRecords[request.toCivId];
    return !!from && !!to && !from.overlord && !to.overlord && from.vassals.length === 0;
  },
  // A petition is meaningful only against the vassal's current, verified overlord.
  independence: (request, context) => context.vassalagePairs.get(request.fromCivId) === request.toCivId,
  // An empty term list is the canonical white-peace settlement (#988) and survives.
  settlement: request => Array.isArray(request.terms) && request.terms.every(isValidSettlementTerm),
  // Immutable terms must name this very pair and stay in range (#1334).
  tribute: request => {
    const terms = request.tribute;
    return terms !== undefined && terms !== null && typeof terms === 'object'
      && terms.demanderId === request.fromCivId && terms.payerId === request.toCivId
      && Number.isInteger(terms.goldPerRound) && terms.goldPerRound >= 1 && terms.goldPerRound <= TRIBUTE_MAX_GOLD_PER_ROUND
      && Number.isInteger(terms.rounds) && terms.rounds >= 1 && terms.rounds <= TRIBUTE_DURATION_ROUNDS;
  },
};

/** The kinds this normalizer knows, for tests that prove the table covers the canonical inventory. */
export const NORMALIZED_PENDING_REQUEST_TYPES: readonly string[] = PENDING_DIPLOMATIC_REQUEST_TYPES;

export function normalizePendingDiplomaticRequests(input: NormalizePendingRequestsInput): PendingDiplomaticRequest[] {
  const { requests, turn, living } = input;
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  const kept: PendingDiplomaticRequest[] = [];
  for (const r of Array.isArray(requests) ? requests as PendingDiplomaticRequest[] : []) {
    if (!r || typeof r.id !== 'string' || !r.id || seenIds.has(r.id)
      || !living(r.fromCivId) || !living(r.toCivId) || r.fromCivId === r.toCivId
      || !Number.isInteger(r.turnIssued) || r.turnIssued > turn || r.turnIssued < 0
      || turn - r.turnIssued >= PENDING_DIPLOMATIC_REQUEST_TTL_TURNS) continue;
    // A kind with no validator (hand-edited or from a newer build) is dropped, never kept by omission.
    if (typeof r.type !== 'string' || !Object.hasOwn(PENDING_REQUEST_VALIDATORS, r.type)) continue;
    if (!PENDING_REQUEST_VALIDATORS[r.type](r, input)) continue;
    const key = JSON.stringify([[r.fromCivId, r.toCivId].sort(), r.type, r.treatyType ?? null]);
    if (seenPairs.has(key)) continue;
    seenIds.add(r.id);
    seenPairs.add(key);
    kept.push({ ...r });
  }
  return kept;
}
