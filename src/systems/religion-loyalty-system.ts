import type { City, GameState, Religion } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { canGarrisonCity } from '@/systems/faction-system';
import { LOYALTY_BASE_TICK, LOYALTY_THRESHOLD_BY_CHALLENGE, FERVOR_MULTIPLIER } from '@/systems/religion-definitions';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';
import { modifyRelationship } from '@/systems/diplomacy-system';
import { peacefullyAbsorbMinorCiv } from '@/systems/minor-civ-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';

export interface ForeignFaithPressure {
  religion: Religion;
  pressuringCivId: string;
}

// Shared adjacency + faith-mismatch check, used both by the loyalty track (AI/minor-civ
// cities, via isLoyaltyTrackEligible) and the human-immunity "Foreign faith pressure"
// unrest row (human-owned cities, via faction-system.ts) -- see #593 MR6.
export function getForeignFaithPressure(state: GameState, cityId: string): ForeignFaithPressure | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const faith = state.cityFaith?.[cityId];
  if (!faith) return null;
  const religion = state.religions?.[faith.religionId];
  if (!religion || religion.ownerCivId === city.owner) return null;

  const bordersPressuringTerritory = city.ownedTiles.some(coord =>
    hexNeighbors(coord).some(n => state.map.tiles[hexKey(n)]?.owner === religion.ownerCivId),
  );
  if (!bordersPressuringTerritory) return null;

  return { religion, pressuringCivId: religion.ownerCivId };
}

// #593 MR6: "Humans NEVER flip" -- human-owned cities are never tracked here, no matter
// how strong the foreign faith pressure. Their sustained pressure surfaces instead as
// the "Foreign faith pressure" unrest row (faction-system.ts getUnrestPressureBreakdown).
export function isLoyaltyTrackEligible(state: GameState, cityId: string): ForeignFaithPressure | null {
  const city = state.cities[cityId];
  if (!city) return null;
  if (state.civilizations[city.owner]?.isHuman) return null;
  return getForeignFaithPressure(state, cityId);
}

export function getLoyaltyThreshold(state: Pick<GameState, 'opponentChallenge'>): number {
  return LOYALTY_THRESHOLD_BY_CHALLENGE[resolveOpponentChallenge(state)];
}

// Garrison pauses (0), Fervor multiplies (floored), temple halves whatever tick results
// (floored) -- applied in that order: base -> Fervor -> temple. Matches issue #593's
// worked examples: 10 -> Fervor 12 -> temple 6; 10 -> temple 5 (no Fervor).
export function getLoyaltyTickAmount(state: GameState, city: City, religion: Pick<Religion, 'boon'>): number {
  if (canGarrisonCity(city.id, state)) return 0;
  let tick = LOYALTY_BASE_TICK;
  if (religion.boon === 'fervor') tick = Math.floor(tick * FERVOR_MULTIPLIER);
  if (city.buildings.includes('temple')) tick = Math.floor(tick / 2);
  return tick;
}

export function setLoyaltyPoints(state: GameState, cityId: string, toCivId: string, points: number): GameState {
  const faith = state.cityFaith?.[cityId];
  if (!faith) return state;
  return {
    ...state,
    cityFaith: { ...state.cityFaith, [cityId]: { ...faith, loyaltyProgress: { toCivId, points } } },
  };
}

export function clearLoyaltyProgress(state: GameState, cityId: string): GameState {
  const faith = state.cityFaith?.[cityId];
  if (!faith?.loyaltyProgress) return state;
  const { loyaltyProgress: _removed, ...rest } = faith;
  return { ...state, cityFaith: { ...state.cityFaith, [cityId]: rest } };
}

// -25 mirrors the flip_loyalty spy mission's bilateral penalty (#524 MR2a,
// espionage-system.ts, -30); slightly milder since a religious defection is a
// consequence of sustained ambient pressure, not an active hostile spy operation.
const DEFECTION_RELATIONSHIP_PENALTY = -25;

export function executeLoyaltyDefection(
  state: GameState,
  bus: EventBus,
  cityId: string,
  pressuringCivId: string,
): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const fromCivId = city.owner;

  let next = state;
  if (next.minorCivs[fromCivId]) {
    const result = peacefullyAbsorbMinorCiv(next, fromCivId, pressuringCivId);
    next = result.state;
    emitMinorCivQuestTransitions(bus, result.transitions, next);
    if (result.absorbed) {
      bus.emit('minor-civ:destroyed', { minorCivId: fromCivId, conquerorId: pressuringCivId });
    }
  } else {
    next = transferCapturedCityOwnership(next, cityId, pressuringCivId, next.turn);
    const pressuringCiv = next.civilizations[pressuringCivId];
    const fromCiv = next.civilizations[fromCivId];
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        ...(pressuringCiv ? {
          [pressuringCivId]: {
            ...pressuringCiv,
            diplomacy: modifyRelationship(pressuringCiv.diplomacy, fromCivId, DEFECTION_RELATIONSHIP_PENALTY),
          },
        } : {}),
        // fromCiv may have been eliminated by transferCapturedCityOwnership if this was
        // its last city -- skip the penalty for a civ that no longer exists.
        ...(fromCiv ? {
          [fromCivId]: {
            ...fromCiv,
            diplomacy: modifyRelationship(fromCiv.diplomacy, pressuringCivId, DEFECTION_RELATIONSHIP_PENALTY),
          },
        } : {}),
      },
    };
  }

  next = clearLoyaltyProgress(next, cityId);
  bus.emit('religion:city-defected', { cityId, fromCivId, toCivId: pressuringCivId });
  return next;
}
