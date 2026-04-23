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
import type { EventBus } from '@/core/event-bus';
import {
  REABSORB_GOLD_COST,
  REABSORB_RELATIONSHIP_MINIMUM,
  tryReabsorbBreakaway,
} from '@/systems/breakaway-system';
import { resolveCivDefinition } from '@/systems/civ-registry';

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

export function isAtWar(state: DiplomacyState, civId: string): boolean {
  return state.atWarWith.includes(civId);
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
  return updated;
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

export function proposeTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
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

const CIVICS_TECHS = ['code-of-laws', 'early-empire', 'political-philosophy', 'diplomacy', 'foreign-trade'];
const TRADE_TECHS = ['trade-routes', 'currency', 'banking', 'coinage'];
const ALLIANCE_TECHS = ['diplomacy', 'political-philosophy'];

export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  completedTechs: string[],
  era: number,
): DiplomaticAction[] {
  const actions: DiplomaticAction[] = [];
  const atWar = isAtWar(state, targetCivId);

  if (atWar) {
    actions.push('request_peace');
  } else {
    actions.push('declare_war');

    const hasCivicsTech = completedTechs.some(t => CIVICS_TECHS.includes(t));
    const hasTradeTech = completedTechs.some(t => TRADE_TECHS.includes(t));
    const hasAllianceTech = completedTechs.some(t => ALLIANCE_TECHS.includes(t));
    const hasNAP = state.treaties.some(
      t => t.type === 'non_aggression_pact' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const hasTrade = state.treaties.some(
      t => t.type === 'trade_agreement' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const relationship = getRelationship(state, targetCivId);

    if ((era >= 2 || hasCivicsTech) && !hasNAP) {
      actions.push('non_aggression_pact');
    }
    if ((era >= 3 || hasTradeTech) && relationship > 0 && !hasTrade) {
      actions.push('trade_agreement');
    }
    if (era >= 4 || hasAllianceTech) {
      if (!state.treaties.some(t => t.type === 'open_borders' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('open_borders');
      }
      if (!state.treaties.some(t => t.type === 'alliance' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('alliance');
      }
    }

    // Vassalage (only when weakened, era >= 2, not already a vassal)
    if (era >= 2 && !state.vassalage?.overlord) {
      actions.push('offer_vassalage');
    }

    // Embargo (requires currency tech or era >= 2, not vassal)
    const hasEmbargoTech = completedTechs.some(t => ['currency', 'foreign-trade', 'banking'].includes(t));
    if ((era >= 2 || hasEmbargoTech) && !state.vassalage?.overlord) {
      actions.push('propose_embargo');
    }

    // League (requires writing tech, not in a league, not vassal)
    const hasWritingTech = completedTechs.some(t => ['science-writing', 'communication-writing', 'writing'].includes(t));
    if (hasWritingTech && !state.vassalage?.overlord) {
      actions.push('propose_league');
    }
  }

  return actions;
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

  switch (action) {
    case 'declare_war':
      bus.emit('diplomacy:war-declared', { attackerId: actorId, defenderId: targetCivId });
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [actorId]: {
            ...actor,
            diplomacy: declareWar(actor.diplomacy, targetCivId, state.turn),
          },
          [targetCivId]: {
            ...target,
            diplomacy: declareWar(target.diplomacy, actorId, state.turn),
          },
        },
      };
    case 'request_peace':
      return enqueuePeaceRequest(state, actorId, targetCivId);
    case 'non_aggression_pact':
    case 'trade_agreement':
    case 'open_borders':
    case 'alliance': {
      const actorTreatyBonus = resolveCivDefinition(state, actor.civType ?? '')?.bonusEffect;
      const targetTreatyBonus = resolveCivDefinition(state, target.civType ?? '')?.bonusEffect;
      const relationshipBonus =
        (actorTreatyBonus?.type === 'allied_kingdoms' ? actorTreatyBonus.treatyRelationshipBonus : 0) +
        (targetTreatyBonus?.type === 'allied_kingdoms' ? targetTreatyBonus.treatyRelationshipBonus : 0);
      bus.emit('diplomacy:treaty-accepted', { civA: actorId, civB: targetCivId, treaty: action });
      const actorTreatyState = proposeTreaty(
        actor.diplomacy,
        actorId,
        targetCivId,
        action,
        action === 'non_aggression_pact' ? 10 : -1,
        state.turn,
      );
      const targetTreatyState = proposeTreaty(
        target.diplomacy,
        targetCivId,
        actorId,
        action,
        action === 'non_aggression_pact' ? 10 : -1,
        state.turn,
      );
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [actorId]: {
            ...actor,
            diplomacy: relationshipBonus > 0
              ? modifyRelationship(actorTreatyState, targetCivId, relationshipBonus)
              : actorTreatyState,
          },
          [targetCivId]: {
            ...target,
            diplomacy: relationshipBonus > 0
              ? modifyRelationship(targetTreatyState, actorId, relationshipBonus)
              : targetTreatyState,
          },
        },
      };
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

export function enqueuePeaceRequest(
  state: GameState,
  fromCivId: string,
  toCivId: string,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (requests.some(request => isSamePeaceRequest(request, fromCivId, toCivId))) {
    return state;
  }

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
  requestId: string,
  bus: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.type !== 'peace') {
    return state;
  }

  const actor = state.civilizations[request.fromCivId];
  const target = state.civilizations[request.toCivId];
  if (!actor || !target) {
    return {
      ...state,
      pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
    };
  }

  bus.emit('diplomacy:peace-made', { civA: request.fromCivId, civB: request.toCivId });
  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
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
  };
}

export function rejectDiplomaticRequest(
  state: GameState,
  requestId: string,
): GameState {
  if (!(state.pendingDiplomacyRequests ?? []).some(request => request.id === requestId)) {
    return state;
  }

  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request => request.id !== requestId),
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

export function canOfferVassalage(
  currentCities: number,
  peakCities: number,
  currentMilitary: number,
  peakMilitary: number,
  era: number,
): boolean {
  if (era < 2) return false;
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
    vassalage: { ...vassalDip.vassalage, overlord: overlordId },
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
  return { tributeAmount: Math.floor(vassalGoldIncome * 0.25) };
}

export function processProtectionTimers(state: DiplomacyState): DiplomacyState {
  let protectionScore = state.vassalage.protectionScore;
  const remainingTimers: Array<{ attackerCivId: string; turnsRemaining: number }> = [];

  for (const timer of state.vassalage.protectionTimers) {
    const newTurns = timer.turnsRemaining - 1;
    if (newTurns <= 0) {
      protectionScore = Math.max(0, protectionScore - 20);
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
  'alliance', 'propose_embargo', 'join_embargo', 'propose_league', 'invite_to_league',
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
  overlordDip: DiplomacyState,
  attackerId: string,
): DiplomacyState {
  const alreadyTracked = overlordDip.vassalage.protectionTimers.some(t => t.attackerCivId === attackerId);
  if (alreadyTracked) return overlordDip;
  return {
    ...overlordDip,
    vassalage: {
      ...overlordDip.vassalage,
      protectionTimers: [...overlordDip.vassalage.protectionTimers, { attackerCivId: attackerId, turnsRemaining: 3 }],
    },
  };
}

// --- Embargoes ---

const EMBARGO_TECHS = ['currency', 'foreign-trade', 'banking'];

export function canProposeEmbargo(
  completedTechs: string[],
  era: number,
  treaties: Treaty[],
  targetCivId: string,
  isVassal: boolean = false,
): boolean {
  if (isVassal) return false;
  if (era < 2 && !completedTechs.some(t => EMBARGO_TECHS.includes(t))) return false;
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

const WRITING_TECHS = ['science-writing', 'communication-writing', 'writing'];

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
