/**
 * Vassalage rules: constants, eligibility, and the single-`DiplomacyState`
 * (or pure) transitions -- accept/end/petition/protection timers/tribute --
 * plus the roster reads (`hasActiveVassalage`, `getActiveVassalIds`) the war
 * module needs. Sits BELOW `diplomacy-war.ts`: it never imports the war or
 * vassalage-transition modules (war -> vassal-rules -> leagues/state).
 * GameState-level vassalage commands are in `diplomacy-vassalage.ts`.
 */
import type { GameState } from '@/core/types';
import type { DiplomacyState, Treaty, DefensiveLeague } from '@/core/types/diplomacy';
import type { CivilizationEra } from '@/systems/era-types';
import { hasAICombatRole } from '@/ai/ai-unit-roles';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { getOwnedCityCount } from '@/systems/city-ownership';
import { hasMetCivilization } from '@/systems/discovery-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { modifyRelationship } from '@/systems/diplomacy-state';
import { applyTreachery } from '@/systems/diplomacy-treachery';
import { getLeagueForCiv, leaveLeague } from '@/systems/diplomacy-leagues';
import { hasTreatyBetween, isAtWar } from '@/systems/diplomacy-queries';

export const VASSALAGE_TRIBUTE_RATE = 0.25;
export const VASSALAGE_PROTECTION_TURNS = 3;
export const VASSALAGE_PROTECTION_PENALTY = 20;

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
  if (vassalId === overlordId || !vassal || !overlord
    || !getCivilizationLiveness(state, vassalId).living
    || !getCivilizationLiveness(state, overlordId).living
    || getOwnedCityCount(state, vassalId) === 0
    || getOwnedCityCount(state, overlordId) === 0) {
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
  if (!canOfferVassalage(getOwnedCityCount(state, vassalId), vassal.diplomacy.vassalage.peakCities,
    getVassalageMilitaryCount(state, vassalId), vassal.diplomacy.vassalage.peakMilitary,
    resolveCivilizationEra(vassal.techState.completed))) {
    return { ok: false, reason: 'Requires era 2, a past peak of two cities, and fewer than half your peak cities or military units.' };
  }
  return { ok: true };
}

export function canOfferVassalage(
  currentCities: number,
  peakCities: number,
  currentMilitary: number,
  peakMilitary: number,
  /** The acting civilization's own technology-derived era. Never World Age. */
  civilizationEra: CivilizationEra,
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
    treaties: [...overlordDip.treaties, { ...treaty, civA: overlordId, civB: vassalId }],
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
  'alliance', 'arms_control_pact', 'demand_tribute', 'request_peace', 'propose_embargo', 'join_embargo', 'leave_embargo', 'propose_league', 'invite_to_league', 'petition_league',
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

export function hasActiveVassalage(state: GameState, vassalId: string, overlordId: string): boolean {
  return getCivilizationLiveness(state, vassalId).living
    && getCivilizationLiveness(state, overlordId).living
    && state.civilizations[vassalId]?.diplomacy.vassalage.overlord === overlordId
    && state.civilizations[overlordId]?.diplomacy.vassalage.vassals.includes(vassalId) === true;
}

export function canPetitionIndependence(state: GameState, vassalId: string): boolean {
  const civ = state.civilizations[vassalId];
  const overlordId = civ?.diplomacy.vassalage.overlord;
  if (!civ || !getCivilizationLiveness(state, vassalId).living || !overlordId
    || !hasActiveVassalage(state, vassalId, overlordId)
    || !getCivilizationLiveness(state, overlordId).living) return false;
  return checkIndependenceThreshold(getVassalageMilitaryCount(state, vassalId),
    getVassalageMilitaryCount(state, overlordId), civ.diplomacy.vassalage.protectionScore);
}

/**
 * #1054 — the active vassals whose war and peace `overlordId` controls (a vassal
 * is blocked from `declare_war`, `request_peace` AND `setMinorCivWarState`, see
 * {@link VASSAL_BLOCKED_ACTIONS}, so its overlord's foreign policy is its own).
 * The vassalage graph is a depth-1 star — `getVassalageEligibility` refuses an
 * overlord that is itself a vassal and a vassal that already has vassals — so
 * this list is complete, never recursive.
 *
 * Any path that ends a war on the overlord's behalf must free these civs from
 * the same war, or they are stranded: they cannot sue for peace themselves.
 */
export function getActiveVassalIds(state: GameState, overlordId: string): string[] {
  const civ = state.civilizations[overlordId];
  if (!civ) return [];
  return civ.diplomacy.vassalage.vassals.filter(
    vassalId => vassalId !== overlordId && hasActiveVassalage(state, vassalId, overlordId));
}
