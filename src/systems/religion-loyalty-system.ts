import type { City, GameState, Religion } from '@/core/types';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { canGarrisonCity } from '@/systems/faction-system';
import { LOYALTY_BASE_TICK, LOYALTY_THRESHOLD_BY_CHALLENGE, FERVOR_MULTIPLIER } from '@/systems/religion-definitions';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';

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
