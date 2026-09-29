/**
 * War and peace transitions. The public, bilateral entry points are
 * `declareMajorWar` / `makeMajorPeace` (#995); the single-side `declareWar` /
 * `makePeace` are building blocks whose only sanctioned callers are the
 * minor-civ war paths (`minor-civ-actions.ts`, `minor-civ-coalition-system.ts`)
 * -- `tests/app/architecture-boundaries.test.ts` pins that import list and
 * `scripts/check-src-rule-violations.sh` blocks a new call site.
 *
 * Every major-war pair goes through `addWarPair` / `removeMajorWarPair`, the
 * single choke points for war-history (#991) recording, so a caller can never
 * skip the record. `applyVassalageWarConsequences` (bloc propagation, #1054)
 * lives here rather than with vassalage so that vassalage transitions depend
 * on war and never the reverse.
 */
import type { GameState, DiplomacyState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { endMinorCivQuestForWar } from '@/systems/minor-civ-diplomacy';
import { reconcileMinorCivLeagues } from '@/systems/minor-civ-league-system';
import { declareWarRecord, recordParticipantLeft } from '@/systems/war-history-system';
import { modifyRelationship, withDiplomacy } from '@/systems/diplomacy-state';
import { applyTreachery } from '@/systems/diplomacy-treachery';
import { isAtWar } from '@/systems/diplomacy-queries';
import { getActiveVassalIds, hasActiveVassalage, onVassalAttacked } from '@/systems/diplomacy-vassal-rules';

export function resolveOpponentKind(civId: string): 'major' | 'minor' | 'barbarian' {
  if (civId.startsWith('barbarian')) return 'barbarian';
  if (MINOR_CIV_DEFINITIONS.some(d => d.id === civId)) return 'minor';
  return 'major';
}

export function recordMilitaryAttack(
  state: DiplomacyState,
  attackerCivId: string,
  turn: number,
): DiplomacyState {
  const withoutDuplicate = state.events.filter(event =>
    event.type !== 'military_attacked'
    || event.otherCiv !== attackerCivId
    || event.turn !== turn);
  const newAttack = {
    type: 'military_attacked',
    turn,
    otherCiv: attackerCivId,
    weight: 1,
  } as const;
  const retainedAttacks = new Set(
    [
      ...withoutDuplicate.filter(event => event.type === 'military_attacked'),
      newAttack,
    ]
      .sort((left, right) =>
        left.turn - right.turn || left.otherCiv.localeCompare(right.otherCiv))
      .slice(-12),
  );
  const defended = state.vassalage?.overlord && state.vassalage.overlord !== attackerCivId
    ? onVassalAttacked(state, attackerCivId) : state;
  return {
    ...defended,
    events: [
      ...withoutDuplicate.filter(event =>
        event.type !== 'military_attacked' || retainedAttacks.has(event)),
      ...(retainedAttacks.has(newAttack) ? [newAttack] : []),
    ],
  };
}

/**
 * SINGLE-SIDE war-state write — a building block, not a transition. Writing
 * major↔major war state through this directly leaves the other side out of
 * sync (#995). Use {@link declareMajorWar} for major civs; the minor-civ war
 * paths (`minor-civ-actions.ts`, `minor-civ-coalition-system.ts`) update both
 * sides themselves and are the only sanctioned external callers.
 * `scripts/check-src-rule-violations.sh` blocks a new one.
 */
export function declareWar(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
  isVoluntary: boolean = true,
): DiplomacyState {
  let updated = {
    ...state,
    atWarWith: state.atWarWith.includes(targetCivId)
      ? [...state.atWarWith]
      : [...state.atWarWith, targetCivId],
    events: [...state.events],
  };
  updated = modifyRelationship(updated, targetCivId, -50);
  updated.events.push({
    type: 'war_declared',
    turn,
    otherCiv: targetCivId,
    weight: 1,
  });
  // If voluntary, apply treachery for each broken treaty (excluding vassalage)
  if (isVoluntary) {
    const brokenTreaties = state.treaties.filter(t =>
      (t.civA === targetCivId || t.civB === targetCivId) && t.type !== 'vassalage'
    );
    for (const treaty of brokenTreaties) {
      updated = applyTreachery(updated, treaty.type);
    }
  }
  return state.vassalage.overlord && targetCivId !== state.vassalage.overlord && !state.atWarWith.includes(targetCivId)
    ? onVassalAttacked(updated, targetCivId) : updated;
}

/**
 * SINGLE-SIDE peace-state write — the mirror of {@link declareWar} and, like it,
 * a building block, not a transition. Use {@link makeMajorPeace} for major civs
 * (#995). Same sanctioned-caller list and source-rule guard.
 */
export function makePeace(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  // #988: this side's own declared war goal against targetCivId does not
  // survive the war it was declared for -- a fresh war starts clean, and
  // status can never be queried against a goal from a prior, already-ended
  // conflict.
  let warGoals = state.warGoals;
  if (warGoals?.[targetCivId]) {
    const { [targetCivId]: _cleared, ...rest } = warGoals;
    warGoals = rest;
  }
  let newState: DiplomacyState = {
    ...state,
    vassalage: { ...state.vassalage, protectionTimers: state.vassalage.protectionTimers.filter(t => t.attackerCivId !== targetCivId) },
    atWarWith: state.atWarWith.filter(id => id !== targetCivId),
    events: [...state.events],
    warGoals,
  };
  newState = modifyRelationship(newState, targetCivId, 10);
  newState.events.push({
    type: 'peace_made',
    turn,
    otherCiv: targetCivId,
    weight: 1,
  });
  return newState;
}

/** Effect-level bilateral war; forced joins may involve a city-state. */
export function addWarPair(state: GameState, attackerId: string, defenderId: string, voluntary: boolean, bus?: EventBus): GameState {
  const attacker = state.civilizations[attackerId];
  const defender = state.civilizations[defenderId] ?? state.minorCivs?.[defenderId];
  if (!attacker || !defender || attackerId === defenderId) return state;
  let next = state;
  if (!isAtWar(attacker.diplomacy, defenderId)) {
    const diplomacy = declareWar(attacker.diplomacy, defenderId, state.turn, voluntary);
    next = withDiplomacy(next, attackerId, { ...diplomacy, treaties: diplomacy.treaties.filter(t => t.civA !== defenderId && t.civB !== defenderId) });
  }
  if (!isAtWar(defender.diplomacy, attackerId)) {
    const declared = declareWar(defender.diplomacy, attackerId, state.turn, false);
    const diplomacy = { ...declared, treaties: declared.treaties.filter(t => t.civA !== attackerId && t.civB !== attackerId) };
    if (next.civilizations[defenderId]) next = withDiplomacy(next, defenderId, diplomacy);
    else {
      const ended = endMinorCivQuestForWar({ ...next.minorCivs[defenderId], diplomacy }, attackerId, state.turn);
      next = { ...next, minorCivs: { ...next.minorCivs, [defenderId]: ended.minor } };
      if (ended.brokenChainId) bus?.emit('minor-civ:alliance-broken', { minorCivId: defenderId, majorCivId: attackerId, chainId: ended.brokenChainId, state: next });
    }
  }
  // #991: a persistent named war record -- major-vs-major only (see
  // war-history-system.ts's own scope note); a minor-civ/city-state defender
  // never gets one. `addWarPair` is the single choke point for every
  // major-civ bilateral war pair (voluntary declaration, vassal drag-in), so
  // hooking here covers all of them without a caller-by-caller wiring.
  if (next.civilizations[defenderId]) {
    next = declareWarRecord(next, attackerId, defenderId, state.turn);
  }
  return next;
}

/**
 * Effect-level bilateral peace between two MAJOR civilizations — the mirror of
 * {@link addWarPair}. Clears the pair from BOTH sides' `atWarWith` (and the
 * matching vassal protection timers, via `makePeace`) in one mutation, so a
 * caller can never write one side and forget the other (#995). Idempotent when
 * neither side is at war with the other. Does no vassalage reconciliation and no
 * consent/eligibility checks — {@link makeMajorPeace} is the public entry point.
 */
function removeMajorWarPair(state: GameState, aId: string, bId: string): GameState {
  const a = state.civilizations[aId];
  const b = state.civilizations[bId];
  if (!a || !b || aId === bId) return state;
  let next = state;
  // #991: record BOTH directions leaving the same war record before mutating
  // diplomacy state -- recordParticipantLeft reads isAtWar-equivalent war-record
  // membership, not `atWarWith`, so order relative to the makePeace calls below
  // does not matter, but doing it first keeps this function's own bilateral
  // isAtWar checks meaningful (a war-goal/settlement hook elsewhere may already
  // have concluded the record without touching atWarWith).
  if (isAtWar(a.diplomacy, bId)) next = recordParticipantLeft(next, aId, bId, state.turn);
  if (isAtWar(b.diplomacy, aId)) next = recordParticipantLeft(next, bId, aId, state.turn);
  if (isAtWar(a.diplomacy, bId)) next = withDiplomacy(next, aId, makePeace(next.civilizations[aId].diplomacy, bId, state.turn));
  if (isAtWar(next.civilizations[bId].diplomacy, aId)) {
    next = withDiplomacy(next, bId, makePeace(next.civilizations[bId].diplomacy, aId, state.turn));
  }
  return next;
}

/** The civs a peace signed by `civId` speaks for: itself plus its active vassals. */
function warBlocMembers(state: GameState, civId: string): string[] {
  return state.civilizations[civId] ? [civId, ...getActiveVassalIds(state, civId)] : [];
}

/**
 * The public bilateral peace transition between two MAJOR civilizations — the
 * mirror of {@link declareMajorWar}. Callers must use this (or an
 * `acceptDiplomaticRequest`-style flow that wraps it) rather than the
 * module-private single-side `makePeace`. No-ops if either peace party is itself
 * a vassal, or neither side is currently at war with the other.
 *
 * #1054 — peace is made between the two *blocs*, not just the two principals.
 * `applyVassalageWarConsequences` drags every vassal into every war its overlord
 * holds, so by the time two vassal-holding civs are at war the state contains the
 * full bloc x bloc cross product of war pairs (overlord-overlord,
 * overlord-vassal, AND vassal-vassal). Clearing only the principal pair and each
 * principal's own vassals leaves the two sides' vassals permanently at war with
 * each other — neither can sue for peace, and both overlords are at peace. So the
 * exit clears the same cross product the join built. Bilateral throughout
 * (`assertBilateralWar` stays green); every freed vassal is notified via
 * `diplomacy:vassal-auto-peace`, naming its own overlord.
 */
export function makeMajorPeace(state: GameState, aId: string, bId: string, bus?: EventBus): GameState {
  const a = state.civilizations[aId];
  const b = state.civilizations[bId];
  if (!a || !b || aId === bId
    || a.diplomacy.vassalage.overlord || b.diplomacy.vassalage.overlord
    || (!isAtWar(a.diplomacy, bId) && !isAtWar(b.diplomacy, aId))) return state;
  // Blocs are read once from the pre-peace state: peace only edits `atWarWith`
  // and protection timers, never `vassalage.vassals`, so the membership is
  // stable and the iteration order is deterministic.
  const blocA = warBlocMembers(state, aId);
  const blocB = warBlocMembers(state, bId);
  let next = state;
  for (const memberA of blocA) {
    for (const memberB of blocB) {
      if (memberA === memberB) continue;
      const before = next;
      next = removeMajorWarPair(next, memberA, memberB);
      if (next === before) continue;
      if (memberA !== aId) {
        bus?.emit('diplomacy:vassal-auto-peace', { vassalId: memberA, overlordId: aId, targetCivId: memberB });
      }
      if (memberB !== bId) {
        bus?.emit('diplomacy:vassal-auto-peace', { vassalId: memberB, overlordId: bId, targetCivId: memberA });
      }
    }
  }
  return next;
}

export function declareMajorWar(state: GameState, attackerId: string, defenderId: string, bus?: EventBus): GameState {
  const attacker = state.civilizations[attackerId];
  if (!attacker || attacker.diplomacy.vassalage.overlord || !state.civilizations[defenderId]
    || attackerId === defenderId || !getCivilizationLiveness(state, attackerId).living
    || !getCivilizationLiveness(state, defenderId).living
    || attacker.diplomacy.vassalage.vassals.includes(defenderId)) return state;
  const atWar = addWarPair(state, attackerId, defenderId, true, bus);
  if (atWar === state) return state;
  const next = applyVassalageWarConsequences(state, atWar, bus);
  return next;
}

/** A before/after transition, never a steady-state scan that replays war events. */
export function applyVassalageWarConsequences(before: GameState, after: GameState, bus?: EventBus): GameState {
  let next = after;
  for (const [vassalId, candidate] of Object.entries(after.civilizations)) {
    const overlordId = candidate.diplomacy?.vassalage?.overlord;
    if (!overlordId || !hasActiveVassalage(next, vassalId, overlordId)) continue;
    const overlord = next.civilizations[overlordId];
    const newAgreement = before.civilizations[vassalId]?.diplomacy.vassalage.overlord !== overlordId;
    for (const enemyId of overlord.diplomacy.atWarWith) {
      if (enemyId === vassalId || isAtWar(next.civilizations[vassalId].diplomacy, enemyId)) continue;
      if (!newAgreement && before.civilizations[overlordId]?.diplomacy.atWarWith.includes(enemyId)) continue;
      const joined = addWarPair(next, vassalId, enemyId, false, bus);
      if (joined !== next) bus?.emit('diplomacy:vassal-auto-war', { vassalId, overlordId, targetCivId: enemyId });
      next = joined;
    }
    let dip = next.civilizations[vassalId].diplomacy;
    if (newAgreement) {
      for (const enemyId of dip.atWarWith) {
        if (enemyId !== overlordId && !isAtWar(overlord.diplomacy, enemyId)) dip = onVassalAttacked(dip, enemyId);
      }
    }
    const timers = dip.vassalage.protectionTimers.filter(timer =>
      dip.atWarWith.includes(timer.attackerCivId) && !overlord.diplomacy.atWarWith.includes(timer.attackerCivId));
    const previousTimers = before.civilizations[vassalId]?.diplomacy.vassalage.protectionTimers ?? [];
    for (const timer of timers) {
      if (newAgreement || !previousTimers.some(old => old.attackerCivId === timer.attackerCivId)) {
        bus?.emit('diplomacy:protection-requested', { vassalId, overlordId, attackerId: timer.attackerCivId });
      }
    }
    if (dip !== next.civilizations[vassalId].diplomacy || timers.length !== dip.vassalage.protectionTimers.length) {
      next = withDiplomacy(next, vassalId, { ...dip, vassalage: { ...dip.vassalage, protectionTimers: timers } });
    }
  }
  return reconcileMinorCivLeagues(next);
}
