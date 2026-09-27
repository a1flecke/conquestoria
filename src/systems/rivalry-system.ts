/**
 * #989 -- a persistent Rival/Nemesis signal derived entirely from facts
 * already recorded elsewhere. No new persisted `GameState` field, no
 * migration: everything here is a pure query over `state.wars` (#991),
 * `DiplomacyState.events`/`strategicStrikesReceivedFrom` (pre-existing), and
 * the one new event *value* this file's sibling change adds to the already
 * open-ended `DiplomaticEvent.type: string` (`'spy_caught'` -- see
 * `recordSpyCaught` in `diplomacy-system.ts`; that string needs no schema
 * change since the field was never a closed union).
 *
 * Scope, deliberately narrow (#989's own guardrails):
 *  - A rivalry fact is only ever something that actually happened between
 *    EXACTLY this pair of civs -- never a third party's war, never a
 *    reconstructed "importance score". Every fact carries the turn it
 *    happened and (where derived from a war) the war's id, so presentation
 *    can always cite a specific turn/event.
 *  - No RNG anywhere in this file (#989: "Rivalry must be a deterministic
 *    function of recorded history").
 *  - `deriveRivalryFacts`/`classifyRivalry` never redact anything -- they are
 *    meant to be called with `civId` as the OWN civ whose facts these are
 *    (a civ reading its own war/diplomacy history is always entitled to all
 *    of it). Viewer safety for a THIRD PARTY looking at someone else's
 *    rivalry lives entirely in `getRivalryForViewer` below, which is the one
 *    function anything player-facing or AI-facing may call.
 */
import type { GameState, WarRecord } from '@/core/types';
import { hasAllianceTreaty } from '@/systems/diplomacy-system';
import { hasMetCivilization } from '@/systems/discovery-system';

export type RivalryFactType =
  | 'repeated-wars'
  | 'capital-captured'
  | 'capital-lost'
  | 'city-captured'
  | 'city-lost'
  | 'decisive-victory'
  | 'decisive-defeat'
  | 'treaty-broken'
  | 'spy-caught'
  | 'strategic-strike'
  | 'settlement';

export interface RivalryFact {
  type: RivalryFactType;
  turn: number;
  /** Present for every fact derived from a `WarRecord` -- lets presentation
   * link back to the full war conference. Absent for events (#991's `wars`)
   * has no notion of them. */
  warId?: string;
  /** `repeated-wars` only: how many wars this pair has fought, counting this one. */
  warCount?: number;
}

export type RivalryStatus = 'none' | 'rival' | 'cooling' | 'respected-foe' | 'reconciled-ally';

export interface RivalryProfile {
  opponentCivId: string;
  status: RivalryStatus;
  facts: RivalryFact[];
}

/** Facts that count as "hostile" for classification purposes. `settlement` is
 * deliberately excluded -- it marks a war's peaceful resolution, not an
 * escalation. */
const HOSTILE_FACT_WEIGHT: Partial<Record<RivalryFactType, number>> = {
  'repeated-wars': 2,
  'capital-captured': 3,
  'capital-lost': 3,
  'city-captured': 1,
  'city-lost': 1,
  'decisive-victory': 3,
  'decisive-defeat': 3,
  'treaty-broken': 1,
  'spy-caught': 1,
  'strategic-strike': 3,
};

const RIVAL_INTENSITY_THRESHOLD = 4;

function sideOfIn(record: WarRecord, civId: string): 'aggressor' | 'defender' | undefined {
  return record.participants.find(p => p.civId === civId)?.side;
}

/** Only records where `civId` and `opponentCivId` were on OPPOSITE sides --
 * two vassals dragged onto the SAME side of the same war (co-belligerents,
 * never actually fighting each other) must never count as "a war between
 * them", or a loyal vassal/ally would fabricate a hostile rivalry fact
 * against its own overlord/co-belligerent. */
function warsBetween(state: GameState, civId: string, opponentCivId: string): WarRecord[] {
  return Object.values(state.wars ?? {}).filter(record => {
    const mySide = sideOfIn(record, civId);
    const theirSide = sideOfIn(record, opponentCivId);
    return mySide !== undefined && theirSide !== undefined && mySide !== theirSide;
  });
}

/**
 * Every recorded fact between `civId` and `opponentCivId`, in turn order.
 * `civId` is assumed to be the caller's OWN civ -- this reads `state.wars`
 * (global) filtered to records naming both ids, and `civId`'s OWN
 * `DiplomacyState.events`/`strategicStrikesReceivedFrom` (already scoped to
 * that civ's own perspective). Never call this with a `civId` the caller does
 * not control -- use `getRivalryForViewer` for a third-party viewer.
 */
export function deriveRivalryFacts(state: GameState, civId: string, opponentCivId: string): RivalryFact[] {
  const facts: RivalryFact[] = [];
  const records = warsBetween(state, civId, opponentCivId)
    .sort((a, b) => a.startTurn - b.startTurn || a.id.localeCompare(b.id));

  records.forEach((record, index) => {
    // The first war between a pair is not yet "repeated" -- the fact starts
    // at the second war, and each subsequent war between the same pair is
    // its own fresh escalation, with an updated `warCount`.
    if (index >= 1) {
      facts.push({ type: 'repeated-wars', turn: record.startTurn, warId: record.id, warCount: index + 1 });
    }

    for (const event of record.events) {
      if (event.type === 'city-captured') {
        const civCaptured = event.toCivId === civId && event.fromCivId === opponentCivId;
        const civLost = event.toCivId === opponentCivId && event.fromCivId === civId;
        if (civCaptured) {
          facts.push({ type: event.wasCapital ? 'capital-captured' : 'city-captured', turn: event.turn, warId: record.id });
        } else if (civLost) {
          facts.push({ type: event.wasCapital ? 'capital-lost' : 'city-lost', turn: event.turn, warId: record.id });
        }
      } else if (event.type === 'settlement-signed') {
        facts.push({ type: 'settlement', turn: event.turn, warId: record.id });
      }
    }

    if (record.outcome === 'aggressor-eliminated' || record.outcome === 'defender-eliminated') {
      const eliminatedSide = record.outcome === 'aggressor-eliminated' ? 'aggressor' : 'defender';
      if (sideOfIn(record, opponentCivId) === eliminatedSide) {
        facts.push({ type: 'decisive-victory', turn: record.endTurn ?? record.startTurn, warId: record.id });
      } else if (sideOfIn(record, civId) === eliminatedSide) {
        facts.push({ type: 'decisive-defeat', turn: record.endTurn ?? record.startTurn, warId: record.id });
      }
    }
  });

  const ownDiplomacy = state.civilizations[civId]?.diplomacy;
  for (const event of ownDiplomacy?.events ?? []) {
    if (event.otherCiv !== opponentCivId) continue;
    if (event.type === 'treaty_broken') facts.push({ type: 'treaty-broken', turn: event.turn });
    else if (event.type === 'spy_caught') facts.push({ type: 'spy-caught', turn: event.turn });
  }

  if (ownDiplomacy?.strategicStrikesReceivedFrom?.includes(opponentCivId)) {
    // #545's ledger is a set of ids, not individually-timestamped strikes --
    // there is no per-strike turn to cite, so this fact uses the turn the
    // profile is evaluated at (`state.turn`) rather than fabricating one.
    // Still fully attributable: the strike-received fact is real and current.
    facts.push({ type: 'strategic-strike', turn: state.turn });
  }

  return facts.sort((a, b) => a.turn - b.turn);
}

function recencyWeight(fact: RivalryFact, currentTurn: number): number {
  const weight = HOSTILE_FACT_WEIGHT[fact.type];
  if (!weight) return 0;
  const age = currentTurn - fact.turn;
  if (age > 80) return weight * 0.25;
  if (age > 40) return weight * 0.5;
  return weight;
}

function peakIntensity(facts: RivalryFact[]): number {
  return facts.reduce((sum, fact) => sum + (HOSTILE_FACT_WEIGHT[fact.type] ?? 0), 0);
}

function currentIntensity(facts: RivalryFact[], currentTurn: number): number {
  return facts.reduce((sum, fact) => sum + recencyWeight(fact, currentTurn), 0);
}

/**
 * Deterministic status from a fact list (no RNG, no hidden state). `civId` is
 * only used to check the CURRENT alliance/elimination state against
 * `opponentCivId` -- everything else comes from `facts`.
 */
export function classifyRivalry(
  state: GameState,
  civId: string,
  opponentCivId: string,
  facts: RivalryFact[],
): RivalryStatus {
  const peak = peakIntensity(facts);
  if (peak < RIVAL_INTENSITY_THRESHOLD) return 'none';

  const opponent = state.civilizations[opponentCivId];
  if (opponent?.isEliminated) return 'respected-foe';
  if (hasAllianceTreaty(state, civId, opponentCivId)) return 'reconciled-ally';

  const current = currentIntensity(facts, state.turn);
  return current >= RIVAL_INTENSITY_THRESHOLD ? 'rival' : 'cooling';
}

export function getRivalryProfile(state: GameState, civId: string, opponentCivId: string): RivalryProfile {
  const facts = deriveRivalryFacts(state, civId, opponentCivId);
  return { opponentCivId, status: classifyRivalry(state, civId, opponentCivId, facts), facts };
}

/** Every opponent `civId` currently has a non-`'none'` rivalry status with,
 * most-hostile-first. Read-only, no mutation, safe to call every render. */
export function getRivalries(state: GameState, civId: string): RivalryProfile[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  const opponentIds = new Set<string>();
  for (const record of Object.values(state.wars ?? {})) {
    const mySide = sideOfIn(record, civId);
    if (!mySide) continue;
    // Only the OPPOSITE side counts as an opponent -- a vassal or ally
    // dragged onto civId's own side in the same war is a co-belligerent, not
    // a rival, even though it is also a "participant" in this record.
    for (const p of record.participants) if (p.civId !== civId && p.side !== mySide) opponentIds.add(p.civId);
  }
  return [...opponentIds]
    .map(opponentId => getRivalryProfile(state, civId, opponentId))
    .filter(profile => profile.status !== 'none')
    .sort((a, b) => currentIntensity(b.facts, state.turn) - currentIntensity(a.facts, state.turn));
}

// --- Viewer-safe presentation ---

export interface RivalryFactPresentation {
  type: RivalryFactType;
  turn: number;
  text: string;
}

export interface RivalryPresentation {
  opponentCivId: string;
  opponentName: string;
  status: RivalryStatus;
  facts: RivalryFactPresentation[];
}

const FACT_LABEL: Record<RivalryFactType, string> = {
  'repeated-wars': 'Another war between you',
  'capital-captured': 'You captured their capital',
  'capital-lost': 'They captured your capital',
  'city-captured': 'You captured one of their cities',
  'city-lost': 'They captured one of your cities',
  'decisive-victory': 'You decisively defeated them in war',
  'decisive-defeat': 'They decisively defeated you in war',
  'treaty-broken': 'A treaty between you was broken',
  'spy-caught': 'A spy was caught operating between you',
  'strategic-strike': 'They struck you with a strategic weapon',
  settlement: 'A war between you ended in a negotiated settlement',
};

/**
 * The single viewer-safe entry point. `civId` is always the current civ's OWN
 * rivalry (you can only have a rivalry with someone from your own point of
 * view) -- the only thing that needs checking is whether the viewer has met
 * the opponent at all. Every fact here happened directly between `civId` and
 * `opponentCivId`, so if the viewer is `civId` there is nothing left to
 * redact: they were a direct party to every one of these facts by
 * construction (`deriveRivalryFacts` only reads the pair's own war/diplomacy
 * records).
 */
export function getRivalryForViewer(state: GameState, viewerId: string, opponentCivId: string): RivalryPresentation | null {
  if (viewerId === opponentCivId) return null;
  if (!hasMetCivilization(state, viewerId, opponentCivId)) return null;

  const profile = getRivalryProfile(state, viewerId, opponentCivId);
  if (profile.status === 'none') return null;

  return {
    opponentCivId,
    opponentName: state.civilizations[opponentCivId]?.name ?? opponentCivId,
    status: profile.status,
    facts: profile.facts.map(fact => ({ type: fact.type, turn: fact.turn, text: FACT_LABEL[fact.type] })),
  };
}

export function getRivalriesForViewer(state: GameState, viewerId: string): RivalryPresentation[] {
  return getRivalries(state, viewerId)
    .map(profile => getRivalryForViewer(state, viewerId, profile.opponentCivId))
    .filter((p): p is RivalryPresentation => p !== null);
}
