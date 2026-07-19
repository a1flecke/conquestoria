import type { City, GameState, Religion } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { canGarrisonCity } from '@/systems/faction-system';
import {
  LOYALTY_BASE_TICK, LOYALTY_THRESHOLD_BY_CHALLENGE, FERVOR_MULTIPLIER,
  AMBIENT_FAITH_DRIFT_PER_TURN, AMBIENT_FAITH_DRIFT_CAP,
} from '@/systems/religion-definitions';
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
export function getLoyaltyTickAmount(state: GameState, city: City, religion: Religion): number {
  if (canGarrisonCity(city.id, state)) return 0;
  let tick = LOYALTY_BASE_TICK;
  if (religion.boon === 'fervor') tick = Math.floor(tick * FERVOR_MULTIPLIER);
  if (city.buildings.includes('temple')) tick = Math.floor(tick / 2);
  return tick;
}

export function setLoyaltyPoints(
  state: GameState,
  cityId: string,
  toCivId: string,
  points: number,
  sinceOwnerId: string,
): GameState {
  const faith = state.cityFaith?.[cityId];
  if (!faith) return state;
  return {
    ...state,
    cityFaith: { ...state.cityFaith, [cityId]: { ...faith, loyaltyProgress: { toCivId, points, sinceOwnerId } } },
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

function applyAmbientFaithDrift(state: GameState): GameState {
  let next = state;
  for (const mc of Object.values(state.minorCivs)) {
    if (mc.isDestroyed) continue;
    const faith = state.cityFaith?.[mc.cityId];
    if (!faith) continue;
    const religion = state.religions?.[faith.religionId];
    if (!religion) continue;
    const current = mc.diplomacy.relationships[religion.ownerCivId] ?? 0;
    if (current >= AMBIENT_FAITH_DRIFT_CAP) continue;
    const updated = Math.min(AMBIENT_FAITH_DRIFT_CAP, current + AMBIENT_FAITH_DRIFT_PER_TURN);
    next = {
      ...next,
      minorCivs: {
        ...next.minorCivs,
        [mc.id]: {
          ...next.minorCivs[mc.id],
          diplomacy: {
            ...next.minorCivs[mc.id].diplomacy,
            relationships: { ...next.minorCivs[mc.id].diplomacy.relationships, [religion.ownerCivId]: updated },
          },
        },
      },
    };
  }
  return next;
}

function emitLoyaltyWarning(
  bus: EventBus,
  cityId: string,
  pressuringCivId: string,
  currentPoints: number,
  newPoints: number,
  threshold: number,
  tick: number,
): void {
  let stage: 'start' | 'midpoint' | 'final' | null = null;
  if (tick > 0 && newPoints < threshold && threshold - newPoints <= tick) stage = 'final';
  else if (currentPoints < threshold / 2 && newPoints >= threshold / 2) stage = 'midpoint';
  else if (currentPoints === 0 && newPoints > 0) stage = 'start';
  if (!stage) return;
  const turnsRemaining = tick > 0 ? Math.max(1, Math.ceil((threshold - newPoints) / tick)) : -1;
  bus.emit('religion:loyalty-warning', { cityId, pressuringCivId, stage, turnsRemaining });
}

export function processLoyaltyTurn(state: GameState, bus: EventBus): GameState {
  let next = applyAmbientFaithDrift(state);
  const threshold = getLoyaltyThreshold(next);

  for (const city of Object.values(state.cities)) {
    const pressure = isLoyaltyTrackEligible(next, city.id);
    const faith = next.cityFaith?.[city.id];

    if (!pressure) {
      if (faith?.loyaltyProgress) next = clearLoyaltyProgress(next, city.id);
      continue;
    }

    const liveCity = next.cities[city.id];
    // Inline review fix: the spec requires ownership transfer to clear the record, not
    // just a change in which civ is pressuring -- otherwise a city conquered by a THIRD
    // civ (unrelated to the loyalty flip) that happens to still border the same faith
    // owner would let the new owner inherit the previous owner's accumulated points.
    const existingProgress = faith!.loyaltyProgress;
    const currentPoints = existingProgress
      && existingProgress.toCivId === pressure.pressuringCivId
      && existingProgress.sinceOwnerId === liveCity.owner
      ? existingProgress.points
      : 0;

    const tick = getLoyaltyTickAmount(next, liveCity, pressure.religion);
    const newPoints = Math.min(threshold, currentPoints + tick);

    if (tick > 0) {
      next = setLoyaltyPoints(next, city.id, pressure.pressuringCivId, newPoints, liveCity.owner);
      emitLoyaltyWarning(bus, city.id, pressure.pressuringCivId, currentPoints, newPoints, threshold, tick);
    }

    if (newPoints >= threshold) {
      next = executeLoyaltyDefection(next, bus, city.id, pressure.pressuringCivId);
    }
  }

  return next;
}
