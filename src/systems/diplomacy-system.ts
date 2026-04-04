import type {
  DiplomacyState,
  DiplomaticAction,
  Treaty,
  TreatyType,
  DefensiveLeague,
} from '@/core/types';

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
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
): DiplomacyState {
  const treaty: Treaty = {
    type,
    civA: 'self',
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

// --- Vassalage stubs for Tasks 5-6 (will be replaced by real implementations) ---

function getLeagueForCiv(_leagues: DefensiveLeague[], _civId: string): null { return null; }
function leaveLeague(leagues: DefensiveLeague[], _id: string, _civ: string): { leagues: DefensiveLeague[] } { return { leagues }; }

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
