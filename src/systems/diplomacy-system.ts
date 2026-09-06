import { endMinorCivQuestForWar } from '@/systems/minor-civ-diplomacy';
import type {
  GameState,
  DiplomacyState,
  DiplomaticAction,
  Treaty,
  TreatyType,
  DefensiveLeague,
  Embargo,
  PendingDiplomaticRequest,
  TradeRoute,
} from '@/core/types';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import type { EventBus } from '@/core/event-bus';
import {
  REABSORB_GOLD_COST,
  REABSORB_RELATIONSHIP_MINIMUM,
  tryReabsorbBreakaway,
} from '@/systems/breakaway-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hasMetCivilization } from '@/systems/discovery-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { computeArmsControlCap, hasKnownStrategicCapability, hasManhattanProject } from '@/systems/strategic-arsenal-system';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { evaluatePeaceConsent, evaluateTreatyConsent, evaluateVassalageConsent, type AgreementKind } from '@/ai/ai-treaty-consent';
import { hasAICombatRole } from '@/ai/ai-unit-roles';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { reconcileMinorCivLeagues } from '@/systems/minor-civ-league-system';

export function resolveOpponentKind(civId: string): 'major' | 'minor' | 'barbarian' {
  if (civId.startsWith('barbarian')) return 'barbarian';
  if (MINOR_CIV_DEFINITIONS.some(d => d.id === civId)) return 'minor';
  return 'major';
}

export function createDiplomacyState(
  allCivIds: string[],
  selfId: string,
  startBonus: number = 0,
): DiplomacyState {
  const relationships: Record<string, number> = {};
  for (const id of allCivIds) {
    if (id !== selfId) {
      relationships[id] = startBonus;
    }
  }
  return {
    relationships,
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    strategicStrikesReceivedFrom: [],
    vassalage: {
      overlord: null,
      vassals: [],
      protectionScore: 100,
      protectionTimers: [],
      peakCities: 0,
      peakMilitary: 0,
    },
  };
}

export function getRelationship(state: DiplomacyState, civId: string): number {
  return state.relationships[civId] ?? 0;
}

export function modifyRelationship(
  state: DiplomacyState,
  civId: string,
  delta: number,
): DiplomacyState {
  const newState = { ...state, relationships: { ...state.relationships } };
  const current = newState.relationships[civId] ?? 0;
  newState.relationships[civId] = Math.max(-100, Math.min(100, current + delta));
  return newState;
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

export function isAtWar(state: DiplomacyState, civId: string): boolean {
  return state.atWarWith.includes(civId);
}

function hasAllianceTreatyFromSide(state: GameState, viewerId: string, otherId: string): boolean {
  const treaties = state.civilizations[viewerId]?.diplomacy?.treaties ?? [];
  return treaties.some(treaty =>
    treaty.type === 'alliance'
    && ((treaty.civA === viewerId && treaty.civB === otherId) || (treaty.civA === otherId && treaty.civB === viewerId)));
}

export function hasAllianceTreaty(state: GameState, civA: string, civB: string): boolean {
  return hasAllianceTreatyFromSide(state, civA, civB) || hasAllianceTreatyFromSide(state, civB, civA);
}

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

// Vassal auto-joins overlord's wars — no treachery
export function vassalAutoWar(
  vassalDip: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  return declareWar(vassalDip, targetCivId, turn, false);
}

export function makePeace(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  let newState = {
    ...state,
    vassalage: { ...state.vassalage, protectionTimers: state.vassalage.protectionTimers.filter(t => t.attackerCivId !== targetCivId) },
    atWarWith: state.atWarWith.filter(id => id !== targetCivId),
    events: [...state.events],
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

// Signs the treaty into THIS side's diplomacy state immediately — no consent
// step. Callers targeting a human must go through enqueueTreatyProposal
// instead (#554). Both sides must be signed for a complete treaty.
export function signTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
  arsenalCap?: number,
): DiplomacyState {
  const treaty: Treaty = {
    type,
    civA: selfId,
    civB: otherCivId,
    turnsRemaining,
  };
  if (type === 'trade_agreement') {
    treaty.goldPerTurn = 2;
  }
  if (type === 'arms_control_pact' && arsenalCap !== undefined) {
    treaty.arsenalCap = arsenalCap;
  }
  const newState = {
    ...state,
    treaties: [...state.treaties, treaty],
    events: [
      ...state.events,
      { type: 'treaty_signed', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, 5);
}

export function breakTreaty(
  state: DiplomacyState,
  otherCivId: string,
  treatyType: TreatyType,
  turn: number,
): DiplomacyState {
  const newState = {
    ...state,
    treaties: state.treaties.filter(
      t => !(t.type === treatyType && (t.civB === otherCivId || t.civA === otherCivId)),
    ),
    events: [
      ...state.events,
      { type: 'treaty_broken', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, -30);
}

export function processRelationshipDrift(
  state: DiplomacyState,
  unitsNearBorder: Record<string, boolean>,
): DiplomacyState {
  let newState = { ...state, relationships: { ...state.relationships } };
  for (const civId of Object.keys(newState.relationships)) {
    if (newState.atWarWith.includes(civId)) continue;

    if (unitsNearBorder[civId]) {
      newState = modifyRelationship(newState, civId, -2);
    } else {
      const current = newState.relationships[civId] ?? 0;
      if (current < 30) {
        newState.relationships[civId] = Math.min(30, current + 1);
      }
    }
  }
  return newState;
}

export function decayEvents(state: DiplomacyState, currentTurn: number): DiplomacyState {
  return {
    ...state,
    events: state.events.map(e => {
      const age = currentTurn - e.turn;
      if (age > 20) {
        const decayFactor = Math.max(0.1, 1 - (age - 20) * 0.05);
        return { ...e, weight: e.weight * decayFactor };
      }
      return e;
    }),
  };
}

export function tickTreaties(state: DiplomacyState): DiplomacyState {
  const remaining: Treaty[] = [];
  for (const treaty of state.treaties) {
    if (treaty.turnsRemaining === -1) {
      remaining.push(treaty);
    } else if (treaty.turnsRemaining > 1) {
      remaining.push({ ...treaty, turnsRemaining: treaty.turnsRemaining - 1 });
    }
  }
  return { ...state, treaties: remaining };
}

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const TRADE_TECHS = ['trade-routes', 'currency', 'banking'];
// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const ALLIANCE_TECHS = ['political-philosophy']; // its unlock text: "Unlock alliances"
// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const NAP_TECHS = ['diplomacy-tech']; // its unlock text: "Unlock Non-Aggression Pacts"

/**
 * The complete input set `getAvailableActions` gates a civ's diplomatic
 * action surface from. `civilizationEra` is a required, explicitly-named
 * field rather than a positional `era: number` -- #1027 found the AI path
 * (`basic-ai.ts`) passing `state.era` (World Age: the era a *majority* of
 * living civs has reached) into what the human path
 * (`diplomacy-panel.ts`) correctly filled with `resolveCivilizationEra(...)`.
 * A bare positional number let that drift silently; a required named field
 * makes every call site spell out `civilizationEra: <expr>`, so a caller that
 * writes `civilizationEra: state.era` is now visibly wrong rather than
 * silently wrong. See `.claude/rules/game-balance.md`'s Production Cost
 * Context section (#984) for the same lesson applied to a different system.
 */
export interface DiplomacyActionContext {
  completedTechs: string[];
  /** The acting civilization's own technology-derived era (`resolveCivilizationEra`). Never World Age (`state.era`). */
  civilizationEra: number;
  hasArmsControlTreaty: boolean;
}

export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  context: DiplomacyActionContext,
): DiplomaticAction[] {
  const { completedTechs, civilizationEra, hasArmsControlTreaty } = context;
  const actions: DiplomaticAction[] = [];
  const atWar = isAtWar(state, targetCivId);

  if (atWar) {
    actions.push('request_peace');
  } else {
    actions.push('declare_war');

    const hasNAPTech = completedTechs.some(t => NAP_TECHS.includes(t));
    const hasTradeTech = completedTechs.some(t => TRADE_TECHS.includes(t));
    const hasAllianceTech = completedTechs.some(t => ALLIANCE_TECHS.includes(t));
    const hasNAP = state.treaties.some(
      t => t.type === 'non_aggression_pact' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const hasTrade = state.treaties.some(
      t => t.type === 'trade_agreement' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const relationship = getRelationship(state, targetCivId);

    if ((civilizationEra >= 2 || hasNAPTech) && !hasNAP) {
      actions.push('non_aggression_pact');
    }
    if ((civilizationEra >= 3 || hasTradeTech) && relationship > 0 && !hasTrade) {
      actions.push('trade_agreement');
    }
    if (civilizationEra >= 4 || hasAllianceTech) {
      if (!state.treaties.some(t => t.type === 'open_borders' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('open_borders');
      }
      if (!state.treaties.some(t => t.type === 'alliance' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('alliance');
      }
    }

    // #545 MR6 review finding: without the not-already-signed check (matching
    // every other treaty type above), this action -- and the AI's own
    // evaluateDiplomacy decision to propose it, gated on the same
    // getAvailableActions() call -- would keep re-firing every turn for a
    // civ pair that already has an active pact, signing (AI<->AI: immediate,
    // per basic-ai.ts) a new duplicate arms_control_pact treaty entry each
    // time. Unguarded, this grows the treaties array unboundedly turn over
    // turn and duplicates rows in the diplomacy panel.
    if (
      hasArmsControlTreaty
      && !state.treaties.some(t => t.type === 'arms_control_pact' && (t.civB === targetCivId || t.civA === targetCivId))
    ) {
      actions.push('arms_control_pact');
    }

    // Vassalage is deliberately NOT surfaced here. `getVassalageEligibility`
    // (which itself calls `canOfferVassalage` with
    // `resolveCivilizationEra(vassal.techState.completed)`) is the sole
    // canonical eligibility check for offering vassalage, consulted directly
    // by both the human panel (`vassalage-controls.ts`) and the AI
    // (`basic-ai.ts`'s `evaluateVassalage` call). #1027's audit found this
    // function used to carry its own second, weaker vassalage rule here
    // (`era >= 2 && !overlord`, with no "actually weakened" check at all) --
    // dead code with zero consumers on either path, but exactly the
    // "second vassalage rule" shape this issue's brief warned against
    // reintroducing. Removed rather than fixed in place, since fixing it
    // properly would require this function to also receive city/military
    // counts it has no other use for.

    // Embargo (requires currency tech or civilizationEra >= 2, not vassal)
    const hasEmbargoTech = completedTechs.some(t => EMBARGO_TECHS.includes(t));
    if ((civilizationEra >= 2 || hasEmbargoTech) && !state.vassalage?.overlord) {
      actions.push('propose_embargo');
    }

    // League (requires writing tech, not in a league, not vassal)
    const hasWritingTech = completedTechs.some(t => WRITING_TECHS.includes(t));
    if (hasWritingTech && !state.vassalage?.overlord) {
      actions.push('propose_league');
    }
  }

  return actions.filter(action => !isVassalBlocked(action, Boolean(state.vassalage?.overlord)));
}

/**
 * #545 MR6 spec §12: "available to propose once the proposing civ has
 * completed the Arms Control Treaty national project" -- the only human-
 * facing gate for this action (unlike every other treaty type, there is no
 * relationship/era/tech condition here; see getAvailableActions above).
 */
export function hasArmsControlTreaty(state: GameState, civId: string): boolean {
  if (!isSuperweaponsEnabled(state)) return false;
  return state.builtNationalProjects?.[`${civId}:arms_control_treaty`] !== undefined;
}

function hasTreatyBetween(state: GameState, civA: string, civB: string, type: TreatyType): boolean {
  return (state.civilizations[civA]?.diplomacy.treaties ?? []).some(t =>
    t.type === type && ((t.civA === civA && t.civB === civB) || (t.civA === civB && t.civB === civA)));
}

/** The sole bilateral treaty mutation path once both parties have consented. */
export function commitTreatyAgreement(state: GameState, civAId: string, civBId: string, type: Exclude<TreatyType, 'vassalage'>, bus: EventBus): GameState {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  if (
    !civA || !civB
    || civA.diplomacy.vassalage.overlord || civB.diplomacy.vassalage.overlord
    || !hasMetCivilization(state, civAId, civBId)
    || isAtWar(civA.diplomacy, civBId)
    || isAtWar(civB.diplomacy, civAId)
    || hasTreatyBetween(state, civAId, civBId, type)
  ) return state;
  const turns = type === 'non_aggression_pact' ? 10 : -1;
  const cap = type === 'arms_control_pact' ? computeArmsControlCap(state, civAId, civBId) : undefined;
  const aState = signTreaty(civA.diplomacy, civAId, civBId, type, turns, state.turn, cap);
  const bState = signTreaty(civB.diplomacy, civBId, civAId, type, turns, state.turn, cap);
  const aBonus = resolveCivDefinition(state, civA.civType ?? '')?.bonusEffect;
  const bBonus = resolveCivDefinition(state, civB.civType ?? '')?.bonusEffect;
  const relationshipBonus = (aBonus?.type === 'allied_kingdoms' ? aBonus.treatyRelationshipBonus : 0)
    + (bBonus?.type === 'allied_kingdoms' ? bBonus.treatyRelationshipBonus : 0);
  bus.emit('diplomacy:treaty-accepted', { civA: civAId, civB: civBId, treaty: type });
  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request =>
      !(request.type === 'treaty' && request.treatyType === type
        && ((request.fromCivId === civAId && request.toCivId === civBId) || (request.fromCivId === civBId && request.toCivId === civAId)))),
    civilizations: {
      ...state.civilizations,
      [civAId]: { ...civA, diplomacy: relationshipBonus ? modifyRelationship(aState, civBId, relationshipBonus) : aState },
      [civBId]: { ...civB, diplomacy: relationshipBonus ? modifyRelationship(bState, civAId, relationshipBonus) : bState },
    },
  };
}

export function proposeTreatyAgreement(state: GameState, fromCivId: string, toCivId: string, kind: AgreementKind, bus: EventBus): GameState {
  const from = state.civilizations[fromCivId];
  const target = state.civilizations[toCivId];
  if (!from || !target) return state;
  if (from.diplomacy.vassalage.overlord || target.diplomacy.vassalage.overlord) return state;
  if (kind === 'peace') {
    if (!isAtWar(from.diplomacy, toCivId) || !isAtWar(target.diplomacy, fromCivId)) return state;
    if (target.isHuman) return enqueuePeaceRequest(state, fromCivId, toCivId, bus);
    // #901 follow-up: no perceived-strength estimate is threaded here yet (that
    // is AI-perception-layer work), so peace consent is currently
    // relationship-only -- see TreatyConsentInput.targetVisibleStrength.
    const consent = evaluatePeaceConsent({
      kind,
      relationship: getRelationship(target.diplomacy, fromCivId),
      diplomacyFocus: resolveCivDefinition(state, target.civType)?.personality.diplomacyFocus ?? 0.5,
      targetHasKnownStrategicCapability: false,
      actorHasKnownStrategicCapability: false,
    });
    if (!consent.accepted) return state;
    bus.emit('diplomacy:peace-made', { civA: fromCivId, civB: toCivId });
    return cancelInvalidNetworkPlans({
      ...state,
      // Same pair-level peace-request cleanup acceptDiplomaticRequest does on
      // commit -- an immediate AI-consented peace must not leave the other
      // side's now-moot "incoming peace request" rotting in the panel.
      pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(
        candidate => !isPeaceRequestPair(candidate, fromCivId, toCivId),
      ),
      civilizations: { ...state.civilizations, [fromCivId]: { ...from, diplomacy: makePeace(from.diplomacy, toCivId, state.turn) }, [toCivId]: { ...target, diplomacy: makePeace(target.diplomacy, fromCivId, state.turn) } },
    }).state;
  }
  if (hasTreatyBetween(state, fromCivId, toCivId, kind)) return state;
  if (target.isHuman) return enqueueTreatyProposal(state, fromCivId, toCivId, kind, kind === 'non_aggression_pact' ? 10 : -1, bus);
  const consent = evaluateTreatyConsent({
    kind,
    relationship: getRelationship(target.diplomacy, fromCivId),
    diplomacyFocus: resolveCivDefinition(state, target.civType)?.personality.diplomacyFocus ?? 0.5,
    targetHasKnownStrategicCapability: hasManhattanProject(state, toCivId),
    actorHasKnownStrategicCapability: hasKnownStrategicCapability(state, toCivId, fromCivId),
  });
  return consent.accepted ? commitTreatyAgreement(state, fromCivId, toCivId, kind, bus) : state;
}

export function canReabsorbBreakaway(
  state: GameState,
  ownerId: string,
  breakawayId: string,
): boolean {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  if (!owner || !breakaway?.breakaway) {
    return false;
  }
  if (breakaway.breakaway.originOwnerId !== ownerId) {
    return false;
  }

  const relationship = getRelationship(owner.diplomacy, breakawayId);
  return relationship >= REABSORB_RELATIONSHIP_MINIMUM && owner.gold >= REABSORB_GOLD_COST;
}

export function applyDiplomaticAction(
  state: GameState,
  actorId: string,
  targetCivId: string,
  action: DiplomaticAction,
  bus: EventBus,
): GameState {
  const actor = state.civilizations[actorId];
  const target = state.civilizations[targetCivId];
  if (!actor || !target) {
    return state;
  }

  if (isVassalBlocked(action, Boolean(actor.diplomacy.vassalage.overlord))) return state;
  if (action !== 'declare_war' && isVassalBlocked(action, Boolean(target.diplomacy.vassalage.overlord))) return state;

  // Issue #435 guard: a treaty (or war record) between unmet civs becomes contact
  // "evidence" and cascades into mass discovery on the next visibility sync.
  const requiresContact: DiplomaticAction[] = [
    'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
  ];
  if (requiresContact.includes(action) && !hasMetCivilization(state, actorId, targetCivId)) {
    return state;
  }

  switch (action) {
    case 'offer_vassalage':
      return proposeVassalage(state, actorId, targetCivId, bus);
    case 'petition_independence':
      return proposeIndependence(state, actorId, targetCivId, bus);
    case 'release_vassal':
      return releaseVassal(state, actorId, targetCivId, bus);
    case 'defend_vassal':
      return defendVassal(state, actorId, targetCivId, bus);
    case 'declare_war': {
      const next = declareMajorWar(state, actorId, targetCivId, bus);
      if (next !== state) bus.emit('diplomacy:war-declared', { attackerId: actorId, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
      return next;
    }
    case 'request_peace':
      return proposeTreatyAgreement(state, actorId, targetCivId, 'peace', bus);
    case 'non_aggression_pact':
    case 'trade_agreement':
    case 'open_borders':
    case 'alliance': {
      return proposeTreatyAgreement(state, actorId, targetCivId, action, bus);
    }
    case 'arms_control_pact': {
      return proposeTreatyAgreement(state, actorId, targetCivId, action, bus);
    }
    case 'reabsorb_breakaway': {
      const cityId = target.breakaway?.originCityId;
      const nextState = tryReabsorbBreakaway(state, actorId, targetCivId);
      if (cityId) {
        bus.emit('faction:breakaway-reabsorbed', {
          civId: targetCivId,
          ownerId: actorId,
          cityId,
        });
      }
      return nextState;
    }
    default:
      return state;
  }
}

function buildPendingPeaceRequestId(fromCivId: string, toCivId: string, turn: number): string {
  return `peace:${fromCivId}:${toCivId}:${turn}`;
}

function isSamePeaceRequest(
  request: PendingDiplomaticRequest,
  fromCivId: string,
  toCivId: string,
): boolean {
  return request.type === 'peace'
    && request.fromCivId === fromCivId
    && request.toCivId === toCivId;
}

function isPeaceRequestPair(
  request: PendingDiplomaticRequest,
  civA: string,
  civB: string,
): boolean {
  return request.type === 'peace'
    && (
      (request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)
    );
}

export function getPendingPeaceRequestForPair(
  state: GameState,
  civA: string,
  civB: string,
): PendingDiplomaticRequest | undefined {
  return (state.pendingDiplomacyRequests ?? []).find(request => isPeaceRequestPair(request, civA, civB));
}

function buildPendingTreatyProposalId(
  fromCivId: string,
  toCivId: string,
  treatyType: TreatyType,
  turn: number,
): string {
  return `treaty:${fromCivId}:${toCivId}:${treatyType}:${turn}`;
}

export function getPendingTreatyProposalsFor(
  state: GameState,
  civId: string,
): PendingDiplomaticRequest[] {
  return (state.pendingDiplomacyRequests ?? []).filter(
    request => request.type === 'treaty' && request.toCivId === civId,
  );
}

/**
 * #901: the bilateral treaty types that route through propose -> consent ->
 * commit (every `TreatyType` except `vassalage`, which #910 owns). Shared by
 * the diplomacy panel (hide a redundant "propose" action) and the diplomacy
 * actions controller (outcome-specific feedback) so the set never drifts.
 */
export const CONSENT_TREATY_TYPES: readonly Exclude<TreatyType, 'vassalage'>[] = [
  'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
];

/**
 * #901: is there already a pending treaty proposal of `treatyType` between
 * this pair, in *either* direction? `enqueueTreatyProposal` dedupes
 * reciprocally, so a second proposal for a pair that already has one is a
 * silent no-op -- callers use this to avoid offering (or falsely reporting a
 * decline for) an action that cannot do anything.
 */
export function hasPendingTreatyProposalBetween(
  state: GameState,
  civA: string,
  civB: string,
  treatyType: TreatyType,
): boolean {
  return (state.pendingDiplomacyRequests ?? []).some(request =>
    request.type === 'treaty'
    && request.treatyType === treatyType
    && ((request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)));
}

// Enqueues a treaty offer for the recipient to accept/decline (#554) -- unlike
// signTreaty, this never touches either side's diplomacy.treaties until the
// recipient acts. Deduped on the same fromCivId+toCivId+treatyType triple.
export function enqueueTreatyProposal(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  treatyType: TreatyType,
  turnsRemaining: number,
  bus?: EventBus,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (requests.some(request => request.type === 'treaty'
    && request.treatyType === treatyType
    && ((request.fromCivId === fromCivId && request.toCivId === toCivId)
      || (request.fromCivId === toCivId && request.toCivId === fromCivId)))) {
    return state;
  }

  bus?.emit('diplomacy:treaty-proposed', { fromCiv: fromCivId, toCiv: toCivId, treaty: treatyType });
  return {
    ...state,
    pendingDiplomacyRequests: [
      ...requests,
      {
        id: buildPendingTreatyProposalId(fromCivId, toCivId, treatyType, state.turn),
        type: 'treaty',
        treatyType,
        turnsRemaining,
        fromCivId,
        toCivId,
        turnIssued: state.turn,
      },
    ],
  };
}

// TTL (in turns) on any pending peace request or treaty proposal (#554) -- a
// proposal the recipient never opens the diplomacy panel to act on should not
// rot forever. Shared with the diplomacy panel's "expires in N turns" label so
// the two never drift.
export const PENDING_DIPLOMATIC_REQUEST_TTL_TURNS = 10;

// Call once per turn from the world turn processor.
export function pruneExpiredDiplomaticRequests(state: GameState): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  const kept = requests.filter(
    request => isDiplomaticRequestLive(state, request),
  );
  if (kept.length === requests.length) return state;
  return { ...state, pendingDiplomacyRequests: kept };
}

export function enqueuePeaceRequest(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  bus?: EventBus,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (
    requests.some(request => isSamePeaceRequest(request, fromCivId, toCivId))
    || getPendingPeaceRequestForPair(state, fromCivId, toCivId)
  ) {
    return state;
  }

  bus?.emit('diplomacy:peace-requested', { fromCivId, toCivId });
  return {
    ...state,
    pendingDiplomacyRequests: [
      ...requests,
      {
        id: buildPendingPeaceRequestId(fromCivId, toCivId, state.turn),
        type: 'peace',
        fromCivId,
        toCivId,
        turnIssued: state.turn,
      },
    ],
  };
}

export function acceptDiplomaticRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.toCivId !== actingCivId) {
    return state;
  }
  if (!isDiplomaticRequestLive(state, request)) {
    return rejectDiplomaticRequest(state, actingCivId, requestId);
  }

  const actor = state.civilizations[request.fromCivId];
  const target = state.civilizations[request.toCivId];
  if (!actor || !target) {
    return {
      ...state,
      pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
    };
  }

  if (request.type === 'independence') {
    const result = resolveIndependence(state, request.fromCivId, request.toCivId, true, bus);
    return result === state ? removeDiplomaticRequest(state, requestId) : result;
  }

  if (request.type === 'treaty') {
    if (!request.treatyType) return rejectDiplomaticRequest(state, actingCivId, requestId);
    if (request.treatyType === 'vassalage') {
      const committed = commitVassalageAgreement(state, request.fromCivId, request.toCivId, bus);
      return committed === state ? rejectDiplomaticRequest(state, actingCivId, requestId) : committed;
    }
    const committed = commitTreatyAgreement(state, request.fromCivId, request.toCivId, request.treatyType, bus);
    return committed === state ? rejectDiplomaticRequest(state, actingCivId, requestId) : committed;
  }

  if (request.type !== 'peace' || actor.isEliminated || target.isEliminated
    || actor.diplomacy.vassalage.overlord || target.diplomacy.vassalage.overlord
    || !isAtWar(actor.diplomacy, request.toCivId) || !isAtWar(target.diplomacy, request.fromCivId)) {
    return rejectDiplomaticRequest(state, actingCivId, requestId);
  }

  bus.emit('diplomacy:peace-made', { civA: request.fromCivId, civB: request.toCivId });
  return cancelInvalidNetworkPlans({
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(
      candidate => !isPeaceRequestPair(candidate, request.fromCivId, request.toCivId),
    ),
    civilizations: {
      ...state.civilizations,
      [request.fromCivId]: {
        ...actor,
        diplomacy: makePeace(actor.diplomacy, request.toCivId, state.turn),
      },
      [request.toCivId]: {
        ...target,
        diplomacy: makePeace(target.diplomacy, request.fromCivId, state.turn),
      },
    },
  }).state;
}

export function rejectDiplomaticRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus?: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.toCivId !== actingCivId) {
    return state;
  }

  if (!isDiplomaticRequestLive(state, request)) return removeDiplomaticRequest(state, requestId);

  if (request.type === 'independence') {
    if (!bus) return removeDiplomaticRequest(state, requestId);
    const result = resolveIndependence(state, request.fromCivId, request.toCivId, false, bus);
    return result === state ? removeDiplomaticRequest(state, requestId) : result;
  }

  // #901: an *explicit* decline (caller passed a bus) of a treaty proposal
  // notifies the original proposer. Internal `acceptDiplomaticRequest`
  // fall-throughs for a lapsed/invalid request pass no bus and stay silent --
  // those did not "decline" anything.
  if (bus && request.type === 'treaty' && request.treatyType) {
    bus.emit('diplomacy:treaty-declined', {
      proposerCivId: request.fromCivId,
      targetCivId: request.toCivId,
      treaty: request.treatyType,
    });
  }

  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
  };
}

// --- Defensive Leagues (real implementations in league section below) ---

// --- Betrayal & Treachery ---

const TREACHERY_AMOUNTS: Record<string, number> = {
  non_aggression_pact: 20,
  trade_agreement: 15,
  alliance: 30,
  vassalage: 40,
  vassalage_independence: 20,
  leave_embargo: 5,
  leave_league: 10,
};

export function applyTreachery(
  state: DiplomacyState,
  action: string,
): DiplomacyState {
  const amount = TREACHERY_AMOUNTS[action] ?? 0;
  return {
    ...state,
    treacheryScore: Math.min(100, state.treacheryScore + amount),
  };
}

export function broadcastTreacheryPenalty(
  allDipStates: Record<string, DiplomacyState>,
  betrayerCivId: string,
): Record<string, DiplomacyState> {
  const betrayer = allDipStates[betrayerCivId];
  if (!betrayer) return allDipStates;

  const penalty = -Math.floor(betrayer.treacheryScore / 4);
  const result = { ...allDipStates };

  for (const [civId, dip] of Object.entries(result)) {
    if (civId === betrayerCivId) continue;
    if (dip.relationships[betrayerCivId] !== undefined) {
      result[civId] = modifyRelationship(dip, betrayerCivId, penalty);
    }
  }

  return result;
}

export function decayTreachery(state: DiplomacyState, turn: number): DiplomacyState {
  if (turn % 5 !== 0 || state.treacheryScore <= 0) return state;
  return {
    ...state,
    treacheryScore: Math.max(0, state.treacheryScore - 1),
  };
}

// --- Vassalage ---

export const VASSALAGE_TRIBUTE_RATE = 0.25;
export const VASSALAGE_PROTECTION_TURNS = 3;
export const VASSALAGE_PROTECTION_PENALTY = 20;

export function isDiplomaticRequestLive(state: GameState, request: PendingDiplomaticRequest): boolean {
  return Number.isInteger(request.turnIssued) && request.turnIssued >= 0 && request.turnIssued <= state.turn
    && state.turn - request.turnIssued < PENDING_DIPLOMATIC_REQUEST_TTL_TURNS;
}

export function getVassalageMilitaryCount(state: GameState, civId: string): number {
  return (state.civilizations[civId]?.units ?? []).filter(id => {
    const unit = state.units[id];
    return unit?.owner === civId && hasAICombatRole(unit.type);
  }).length;
}

export type VassalageEligibility = { ok: true } | { ok: false; reason: string };

export function getVassalageEligibility(state: GameState, vassalId: string, overlordId: string): VassalageEligibility {
  const vassal = state.civilizations[vassalId];
  const overlord = state.civilizations[overlordId];
  if (vassalId === overlordId || !vassal || !overlord || vassal.isEliminated || overlord.isEliminated
    || !vassal.cities.some(id => state.cities[id]?.owner === vassalId)
    || !overlord.cities.some(id => state.cities[id]?.owner === overlordId)) {
    return { ok: false, reason: 'Both civilizations must still have a city.' };
  }
  if (!hasMetCivilization(state, vassalId, overlordId)) return { ok: false, reason: 'You must have met first.' };
  if (isAtWar(vassal.diplomacy, overlordId) || isAtWar(overlord.diplomacy, vassalId)) {
    return { ok: false, reason: 'Make peace with each other first.' };
  }
  if (vassal.diplomacy.vassalage.overlord || overlord.diplomacy.vassalage.overlord
    || vassal.diplomacy.vassalage.vassals.length > 0
    || overlord.diplomacy.vassalage.vassals.includes(vassalId)
    || hasTreatyBetween(state, vassalId, overlordId, 'vassalage')
    || hasTreatyBetween(state, overlordId, vassalId, 'vassalage')) {
    return { ok: false, reason: 'An existing vassal relationship prevents this offer.' };
  }
  if (!canOfferVassalage(vassal.cities.length, vassal.diplomacy.vassalage.peakCities,
    getVassalageMilitaryCount(state, vassalId), vassal.diplomacy.vassalage.peakMilitary,
    resolveCivilizationEra(vassal.techState.completed))) {
    return { ok: false, reason: 'Requires era 2, a past peak of two cities, and fewer than half your peak cities or military units.' };
  }
  return { ok: true };
}

export function proposeVassalage(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!getVassalageEligibility(state, vassalId, overlordId).ok) return state;
  const current = pruneExpiredDiplomaticRequests(state);
  if (hasPendingTreatyProposalBetween(current, vassalId, overlordId, 'vassalage')) return current;
  const overlord = current.civilizations[overlordId];
  if (overlord.isHuman) return enqueueTreatyProposal(current, vassalId, overlordId, 'vassalage', -1, bus);
  const consent = evaluateVassalageConsent({
    relationship: getRelationship(overlord.diplomacy, vassalId),
    diplomacyFocus: resolveCivDefinition(current, overlord.civType)?.personality.diplomacyFocus ?? 0.5,
    militaryCount: getVassalageMilitaryCount(current, overlordId),
    vassalCount: overlord.diplomacy.vassalage.vassals.length,
    warCount: overlord.diplomacy.atWarWith.length,
  });
  if (consent.accepted) return commitVassalageAgreement(current, vassalId, overlordId, bus);
  bus.emit('diplomacy:treaty-declined', { proposerCivId: vassalId, targetCivId: overlordId, treaty: 'vassalage' });
  return current;
}

/** Only called after a recipient decision; applies all low-level outputs together. */
export function commitVassalageAgreement(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!getVassalageEligibility(state, vassalId, overlordId).ok) return state;
  const vassal = state.civilizations[vassalId];
  const overlord = state.civilizations[overlordId];
  const result = acceptVassalage(vassal.diplomacy, overlord.diplomacy, vassalId, overlordId, state.turn, state.defensiveLeagues);
  const next = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [vassalId]: { ...vassal, diplomacy: result.vassalState },
      [overlordId]: { ...overlord, diplomacy: result.overlordState },
    },
    defensiveLeagues: result.leagueUpdates ?? state.defensiveLeagues,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request =>
      !(request.type === 'treaty' && request.treatyType === 'vassalage'
        && (request.fromCivId === vassalId || request.toCivId === vassalId))),
  };
  const withObligations = applyVassalageWarConsequences(state, next, bus);
  bus.emit('diplomacy:treaty-accepted', { civA: vassalId, civB: overlordId, treaty: 'vassalage' });
  return withObligations;
}

export function canOfferVassalage(
  currentCities: number,
  peakCities: number,
  currentMilitary: number,
  peakMilitary: number,
  /** The acting civilization's own technology-derived era. Never World Age. */
  civilizationEra: number,
): boolean {
  if (civilizationEra < 2) return false;
  if (peakCities < 2) return false;
  const citiesBelow = currentCities < peakCities * 0.5;
  const militaryBelow = currentMilitary < peakMilitary * 0.5;
  return citiesBelow || militaryBelow;
}

export function offerVassalage(
  fromCivId: string,
  toCivId: string,
): { action: string; fromCivId: string; toCivId: string } {
  return { action: 'offer_vassalage', fromCivId, toCivId };
}

// Note: acceptVassalage also returns leagueUpdates if the vassal was in a league.
// The caller must apply leagueUpdates to GameState.defensiveLeagues.
export function acceptVassalage(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
  turn: number,
  leagues?: DefensiveLeague[],
): { vassalState: DiplomacyState; overlordState: DiplomacyState; leagueUpdates?: DefensiveLeague[] } {
  const treaty: Treaty = {
    type: 'vassalage',
    civA: vassalId,
    civB: overlordId,
    turnsRemaining: -1,
  };
  const vassalState: DiplomacyState = {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: overlordId, protectionScore: 100, protectionTimers: [] },
    treaties: [...vassalDip.treaties, treaty],
    events: [...vassalDip.events, { type: 'vassalage_accepted', turn, otherCiv: overlordId, weight: 1 }],
  };
  const overlordState: DiplomacyState = {
    ...overlordDip,
    vassalage: { ...overlordDip.vassalage, vassals: [...overlordDip.vassalage.vassals, vassalId] },
    treaties: [...overlordDip.treaties, treaty],
    events: [...overlordDip.events, { type: 'vassalage_accepted', turn, otherCiv: vassalId, weight: 1 }],
  };

  // Force vassal out of any defensive league (no treachery — involuntary)
  let leagueUpdates: DefensiveLeague[] | undefined;
  if (leagues) {
    const vassalLeague = getLeagueForCiv(leagues, vassalId);
    if (vassalLeague) {
      const leaveResult = leaveLeague(leagues, vassalLeague.id, vassalId);
      leagueUpdates = leaveResult.leagues;
    }
  }

  return { vassalState, overlordState, leagueUpdates };
}

export function endVassalage(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
): { vassalState: DiplomacyState; overlordState: DiplomacyState } {
  const vassalState: DiplomacyState = {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: null, protectionScore: 100, protectionTimers: [] },
    treaties: vassalDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
  const overlordState: DiplomacyState = {
    ...overlordDip,
    vassalage: { ...overlordDip.vassalage, vassals: overlordDip.vassalage.vassals.filter(v => v !== vassalId) },
    treaties: overlordDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
  return { vassalState, overlordState };
}

export function processVassalageTribute(vassalGoldIncome: number): { tributeAmount: number } {
  return { tributeAmount: Math.floor(Math.max(0, vassalGoldIncome) * VASSALAGE_TRIBUTE_RATE) };
}

export function processProtectionTimers(state: DiplomacyState): DiplomacyState {
  let protectionScore = state.vassalage.protectionScore;
  const remainingTimers: Array<{ attackerCivId: string; turnsRemaining: number }> = [];

  for (const timer of state.vassalage.protectionTimers) {
    const newTurns = timer.turnsRemaining - 1;
    if (newTurns <= 0) {
      protectionScore = Math.max(0, protectionScore - VASSALAGE_PROTECTION_PENALTY);
    } else {
      remainingTimers.push({ ...timer, turnsRemaining: newTurns });
    }
  }

  return {
    ...state,
    vassalage: {
      ...state.vassalage,
      protectionScore,
      protectionTimers: remainingTimers,
    },
  };
}

export function checkIndependenceThreshold(
  vassalStrength: number,
  overlordStrength: number,
  protectionScore: number,
): boolean {
  if (protectionScore <= 20) return true;
  const protectionLost = 100 - protectionScore;
  const thresholdReduction = Math.floor(protectionLost / 20) * 0.1;
  const threshold = 0.6 - thresholdReduction;
  if (overlordStrength === 0) return true;
  return (vassalStrength / overlordStrength) >= threshold;
}

// --- Vassal action blocking ---

const VASSAL_BLOCKED_ACTIONS = [
  'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders',
  'alliance', 'arms_control_pact', 'request_peace', 'propose_embargo', 'join_embargo', 'leave_embargo', 'propose_league', 'invite_to_league', 'petition_league',
];

export function isVassalBlocked(action: string, isVassal: boolean): boolean {
  if (!isVassal) return false;
  return VASSAL_BLOCKED_ACTIONS.includes(action);
}

// --- Independence petition ---

export function petitionIndependence(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
  overlordAccepts: boolean,
): { vassalState: DiplomacyState; overlordState: DiplomacyState; relationshipChange: number } {
  const { vassalState: baseVassal, overlordState: baseOverlord } = endVassalage(vassalDip, overlordDip, vassalId, overlordId);
  if (overlordAccepts) {
    return {
      vassalState: modifyRelationship(baseVassal, overlordId, 10),
      overlordState: modifyRelationship(baseOverlord, vassalId, 10),
      relationshipChange: 10,
    };
  }
  // Overlord refuses — vassal declares war (+20 treachery for breaking vassalage)
  let vassalAtWar: DiplomacyState = {
    ...baseVassal,
    atWarWith: [...new Set([...baseVassal.atWarWith, overlordId])],
  };
  vassalAtWar = applyTreachery(vassalAtWar, 'vassalage_independence');
  const overlordAtWar: DiplomacyState = {
    ...baseOverlord,
    atWarWith: [...new Set([...baseOverlord.atWarWith, vassalId])],
  };
  return {
    vassalState: modifyRelationship(vassalAtWar, overlordId, -50),
    overlordState: modifyRelationship(overlordAtWar, vassalId, -50),
    relationshipChange: -50,
  };
}

// --- Vassal attacked: start protection timer (overlord gets 3 turns to respond) ---

export function onVassalAttacked(
  vassalDip: DiplomacyState,
  attackerId: string,
): DiplomacyState {
  const alreadyTracked = vassalDip.vassalage.protectionTimers.some(t => t.attackerCivId === attackerId);
  if (alreadyTracked) return vassalDip;
  return {
    ...vassalDip,
    vassalage: {
      ...vassalDip.vassalage,
      protectionTimers: [...vassalDip.vassalage.protectionTimers, { attackerCivId: attackerId, turnsRemaining: VASSALAGE_PROTECTION_TURNS }],
    },
  };
}

// --- Embargoes ---

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const EMBARGO_TECHS = ['currency', 'banking'];

export function canProposeEmbargo(
  completedTechs: string[],
  /** The acting civilization's own technology-derived era. Never World Age. */
  civilizationEra: number,
  treaties: Treaty[],
  targetCivId: string,
  isVassal: boolean = false,
): boolean {
  if (isVassal) return false;
  if (civilizationEra < 2 && !completedTechs.some(t => EMBARGO_TECHS.includes(t))) return false;
  const isAllied = treaties.some(t =>
    t.type === 'alliance' && (t.civA === targetCivId || t.civB === targetCivId),
  );
  return !isAllied;
}

export function enforceEmbargoes(
  embargoes: Embargo[],
  tradeRoutes: TradeRoute[],
  cityOwners: Record<string, string>,
): TradeRoute[] {
  return tradeRoutes.filter(route => {
    if (!route.foreignCivId) return true; // domestic routes unaffected
    const routeOwner = cityOwners[route.fromCityId];
    if (!routeOwner) return true;
    for (const embargo of embargoes) {
      const isParticipant = embargo.participants.includes(routeOwner);
      const targetsEmbargoed = route.foreignCivId === embargo.targetCivId;
      const isEmbargoedCivRoute =
        routeOwner === embargo.targetCivId &&
        embargo.participants.includes(route.foreignCivId);
      if ((isParticipant && targetsEmbargoed) || isEmbargoedCivRoute) return false;
    }
    return true;
  });
}

export function proposeEmbargo(
  embargoes: Embargo[],
  proposerId: string,
  targetCivId: string,
  turn: number,
): Embargo[] {
  const existing = embargoes.find(e => e.targetCivId === targetCivId);
  if (existing) {
    if (existing.participants.includes(proposerId)) return embargoes;
    return embargoes.map(e =>
      e.id === existing.id
        ? { ...e, participants: [...e.participants, proposerId] }
        : e,
    );
  }
  const id = `embargo-${turn}-${embargoes.length}`;
  return [
    ...embargoes,
    { id, targetCivId, participants: [proposerId], proposedTurn: turn },
  ];
}

export function joinEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId && !e.participants.includes(civId)
      ? { ...e, participants: [...e.participants, civId] }
      : e,
  );
}

export function leaveEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId
      ? { ...e, participants: e.participants.filter(p => p !== civId) }
      : e,
  );
}

export function cleanupEmbargoes(embargoes: Embargo[]): Embargo[] {
  return embargoes.filter(e => e.participants.length > 0);
}

export function shouldApplyLeaveEmbargoTreachery(
  embargo: Embargo,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = embargo.participants.filter(p => p !== leavingCivId);
  return remaining.some(p =>
    warPairs.some(w =>
      (w.civA === embargo.targetCivId && w.civB === p) ||
      (w.civB === embargo.targetCivId && w.civA === p),
    ),
  );
}

// --- Unilateral endVassalage (overlord eliminated) ---

export function endVassalageUnilateral(
  vassalDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
): DiplomacyState {
  return {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: null, protectionScore: 100, protectionTimers: [] },
    treaties: vassalDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
}

// --- Defensive Leagues ---

// IDs must exist in TECH_TREE — see tests/systems/diplomacy-tech-gates.test.ts
export const WRITING_TECHS = ['writing'];

export function canProposeLeague(
  completedTechs: string[],
  leagues: DefensiveLeague[],
  currentLeague: DefensiveLeague | null,
  isVassal: boolean = false,
  relationships?: Record<string, number>,
  targetCivId?: string,
): boolean {
  if (isVassal) return false;
  if (currentLeague) return false;
  if (!completedTechs.some(t => WRITING_TECHS.includes(t))) return false;
  if (targetCivId && relationships && (relationships[targetCivId] ?? 0) <= 0) return false;
  return true;
}

export function proposeLeague(
  leagues: DefensiveLeague[],
  civA: string,
  civB: string,
  turn: number,
): DefensiveLeague[] {
  return [
    ...leagues,
    { id: `league-${turn}-${leagues.length}`, members: [civA, civB], formedTurn: turn },
  ];
}

export function inviteToLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): DefensiveLeague[] {
  return leagues.map(l =>
    l.id === leagueId && !l.members.includes(civId)
      ? { ...l, members: [...l.members, civId] }
      : l,
  );
}

export function votePetition(
  memberRelationships: Record<string, number>,
): boolean {
  const votes = Object.values(memberRelationships);
  const yesVotes = votes.filter(r => r > 10).length;
  return yesVotes > votes.length / 2;
}

export function petitionLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
  accepted: boolean,
): DefensiveLeague[] {
  if (!accepted) return leagues;
  return inviteToLeague(leagues, leagueId, civId);
}

export function leaveLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): { leagues: DefensiveLeague[]; dissolvedLeagueIds: string[] } {
  const updated = leagues.map(l =>
    l.id === leagueId
      ? { ...l, members: l.members.filter(m => m !== civId) }
      : l,
  );
  const dissolvedLeagueIds = updated.filter(l => l.members.length < 2).map(l => l.id);
  return { leagues: updated.filter(l => l.members.length >= 2), dissolvedLeagueIds };
}

export function shouldApplyLeaveLeagueTreachery(
  league: DefensiveLeague,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = league.members.filter(m => m !== leavingCivId);
  return remaining.some(member =>
    warPairs.some(w => w.civA === member || w.civB === member),
  );
}

export function checkLeagueDissolution(
  leagues: DefensiveLeague[],
  atWarPairs: Array<{ civA: string; civB: string }>,
): DefensiveLeague[] {
  return leagues.filter(league => {
    for (const pair of atWarPairs) {
      if (league.members.includes(pair.civA) && league.members.includes(pair.civB)) {
        return false;
      }
    }
    return true;
  });
}

export function getLeagueForCiv(
  leagues: DefensiveLeague[],
  civId: string,
): DefensiveLeague | null {
  return leagues.find(l => l.members.includes(civId)) ?? null;
}

export function triggerLeagueDefense(
  leagues: DefensiveLeague[],
  defenderId: string,
  attackerId: string,
): string[] {
  const league = leagues.find(l => l.members.includes(defenderId));
  if (!league) return [];
  return league.members.filter(m => m !== defenderId && m !== attackerId);
}

// #910 GameState-level vassalage consequences. Presentation never applies these pieces.
function withDiplomacy(state: GameState, civId: string, diplomacy: DiplomacyState): GameState {
  const civ = state.civilizations[civId];
  return { ...state, civilizations: { ...state.civilizations, [civId]: { ...civ, diplomacy } } };
}

function removeDiplomaticRequest(state: GameState, id: string): GameState {
  return { ...state, pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request => request.id !== id) };
}

function hasActiveVassalage(state: GameState, vassalId: string, overlordId: string): boolean {
  return !state.civilizations[vassalId]?.isEliminated && !state.civilizations[overlordId]?.isEliminated
    && state.civilizations[vassalId]?.diplomacy.vassalage.overlord === overlordId
    && state.civilizations[overlordId]?.diplomacy.vassalage.vassals.includes(vassalId) === true;
}

export function canPetitionIndependence(state: GameState, vassalId: string): boolean {
  const civ = state.civilizations[vassalId];
  const overlordId = civ?.diplomacy.vassalage.overlord;
  if (!civ || civ.isEliminated || !overlordId || !hasActiveVassalage(state, vassalId, overlordId)
    || state.civilizations[overlordId].isEliminated) return false;
  return checkIndependenceThreshold(getVassalageMilitaryCount(state, vassalId),
    getVassalageMilitaryCount(state, overlordId), civ.diplomacy.vassalage.protectionScore);
}

export function proposeIndependence(state: GameState, vassalId: string, overlordId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId) || !canPetitionIndependence(state, vassalId)) return state;
  const current = pruneExpiredDiplomaticRequests(state);
  if ((current.pendingDiplomacyRequests ?? []).some(request => request.type === 'independence'
    && request.fromCivId === vassalId && request.toCivId === overlordId)) return current;
  const overlord = current.civilizations[overlordId];
  if (!overlord.isHuman) {
    const accepted = (resolveCivDefinition(current, overlord.civType)?.personality.diplomacyFocus ?? 0.5) > 0.5;
    return resolveIndependence(current, vassalId, overlordId, accepted, bus);
  }
  bus.emit('diplomacy:independence-requested', { vassalId, overlordId });
  return { ...current, pendingDiplomacyRequests: [...(current.pendingDiplomacyRequests ?? []), {
    id: `independence:${vassalId}:${overlordId}:${state.turn}`, type: 'independence',
    fromCivId: vassalId, toCivId: overlordId, turnIssued: state.turn,
  }] };
}

function applyVassalageEnd(state: GameState, vassalId: string, overlordId: string,
  vassalDip: DiplomacyState, overlordDip?: DiplomacyState): GameState {
  let next = withDiplomacy(state, vassalId, vassalDip);
  if (overlordDip && next.civilizations[overlordId]) next = withDiplomacy(next, overlordId, overlordDip);
  return { ...next, pendingDiplomacyRequests: (next.pendingDiplomacyRequests ?? []).filter(request =>
    !((request.type === 'independence' || request.treatyType === 'vassalage')
      && ((request.fromCivId === vassalId && request.toCivId === overlordId)
        || (request.fromCivId === overlordId && request.toCivId === vassalId)))) };
}

export function resolveIndependence(state: GameState, vassalId: string, overlordId: string, accepted: boolean, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId) || !canPetitionIndependence(state, vassalId)) return state;
  const result = petitionIndependence(state.civilizations[vassalId].diplomacy,
    state.civilizations[overlordId].diplomacy, vassalId, overlordId, accepted);
  if (!accepted) {
    // Independence war ends incompatible bilateral treaties as well as the vassalage link.
    result.vassalState = { ...result.vassalState, treaties: result.vassalState.treaties.filter(t => t.civA !== overlordId && t.civB !== overlordId) };
    result.overlordState = { ...result.overlordState, treaties: result.overlordState.treaties.filter(t => t.civA !== vassalId && t.civB !== vassalId) };
  }
  const ended = applyVassalageEnd(state, vassalId, overlordId, result.vassalState, result.overlordState);
  const next = accepted ? ended : applyVassalageWarConsequences(state, ended, bus);
  bus.emit('diplomacy:independence-petition', { vassalId, overlordId, accepted });
  bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: accepted ? 'independence' : 'war' });
  return next;
}

export function releaseVassal(state: GameState, overlordId: string, vassalId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId)) return state;
  const result = endVassalage(state.civilizations[vassalId].diplomacy, state.civilizations[overlordId].diplomacy, vassalId, overlordId);
  const next = applyVassalageEnd(state, vassalId, overlordId, result.vassalState, applyTreachery(result.overlordState, 'vassalage'));
  bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'released' });
  return next;
}

/** Effect-level bilateral war; forced joins may involve a city-state. */
function addWarPair(state: GameState, attackerId: string, defenderId: string, voluntary: boolean, bus?: EventBus): GameState {
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
  return next;
}

export function declareMajorWar(state: GameState, attackerId: string, defenderId: string, bus?: EventBus): GameState {
  const attacker = state.civilizations[attackerId];
  if (!attacker || attacker.diplomacy.vassalage.overlord || !state.civilizations[defenderId]
    || attackerId === defenderId || attacker.isEliminated || state.civilizations[defenderId].isEliminated
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

export function defendVassal(state: GameState, overlordId: string, vassalId: string, bus: EventBus): GameState {
  if (!hasActiveVassalage(state, vassalId, overlordId)) return state;
  let next = state;
  for (const timer of state.civilizations[vassalId].diplomacy.vassalage.protectionTimers) {
    const enemyId = timer.attackerCivId;
    if (!state.civilizations[vassalId].diplomacy.atWarWith.includes(enemyId)) continue;
    const updated = addWarPair(next, overlordId, enemyId, false, bus);
    if (updated !== next) bus.emit('diplomacy:war-declared', { attackerId: overlordId, defenderId: enemyId, opponentKind: resolveOpponentKind(enemyId) });
    next = updated;
  }
  return applyVassalageWarConsequences(state, next, bus);
}

export function processVassalageTurn(state: GameState, bus: EventBus): GameState {
  let next = state;
  for (const vassalId of Object.keys(state.civilizations)) {
    let civ = next.civilizations[vassalId];
    const overlordId = civ.diplomacy?.vassalage.overlord;
    if (!overlordId) continue;
    const overlord = next.civilizations[overlordId];
    if (!overlord || overlord.isEliminated) {
      next = applyVassalageEnd(next, vassalId, overlordId, endVassalageUnilateral(civ.diplomacy, vassalId, overlordId), overlord ? endVassalage(civ.diplomacy, overlord.diplomacy, vassalId, overlordId).overlordState : undefined);
      bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'overlord_eliminated' });
      continue;
    }
    if (!overlord.isHuman) next = defendVassal(next, overlordId, vassalId, bus);
    civ = next.civilizations[vassalId];
    const timers = civ.diplomacy.vassalage.protectionTimers.filter(timer =>
      civ.diplomacy.atWarWith.includes(timer.attackerCivId)
      && !next.civilizations[overlordId].diplomacy.atWarWith.includes(timer.attackerCivId));
    const ticked = processProtectionTimers({ ...civ.diplomacy, vassalage: { ...civ.diplomacy.vassalage, protectionTimers: timers } });
    next = withDiplomacy(next, vassalId, ticked);
    for (const timer of timers) {
      if (timer.turnsRemaining <= 1) bus.emit('diplomacy:protection-failed', { overlordId, vassalId, attackerId: timer.attackerCivId });
    }
    if (ticked.vassalage.protectionScore <= 20) {
      const result = endVassalage(ticked, next.civilizations[overlordId].diplomacy, vassalId, overlordId);
      next = applyVassalageEnd(next, vassalId, overlordId, result.vassalState, result.overlordState);
      bus.emit('diplomacy:vassalage-ended', { vassalId, overlordId, reason: 'auto_breakaway' });
    } else if (!civ.isHuman && canPetitionIndependence(next, vassalId)) {
      next = proposeIndependence(next, vassalId, overlordId, bus);
    }
  }
  return next;
}
