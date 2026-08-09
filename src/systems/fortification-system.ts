import type { GameState, HexCoord, Unit } from '@/core/types';
import { hexDistance, hexKey, mapNeighbors, wrappedHexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { isAtWar } from './diplomacy-system';

export interface FortificationTier {
  id: 'fort' | 'citadel';
  label: 'Fort' | 'Citadel';
  multiplier: number;
}

const FORT_TIER: FortificationTier = {
  id: 'fort',
  label: 'Fort',
  multiplier: 1.1,
};

const CITADEL_TIER: FortificationTier = {
  id: 'citadel',
  label: 'Citadel',
  multiplier: 1.2,
};

/** Citadel is derived from technology; the saved tile improvement remains `fort`. */
export function getFortificationTier(completedTechs: readonly string[]): FortificationTier {
  return completedTechs.includes('fortification-engineering') ? CITADEL_TIER : FORT_TIER;
}

export type FortificationPlacement =
  | { ok: true; isFrontier: boolean }
  | { ok: false; reason: 'missing-tile' | 'outside-territory' | 'city-center' | 'invalid-terrain' | 'already-improved' | 'adjacent-fort' | 'empire-cap' };

export interface FortificationPlacementOptions {
  allowReplacement?: boolean;
}

export interface FortificationCapacity {
  built: number;
  limit: number;
}

export function getFortificationCapacity(
  state: Pick<GameState, 'map' | 'cities'>,
  ownerId: string,
): FortificationCapacity {
  const cityCount = Object.values(state.cities).filter(city => city.owner === ownerId).length;
  const built = Object.values(state.map.tiles).filter(candidate => candidate.owner === ownerId && candidate.improvement === 'fort').length;
  return { built, limit: cityCount + Math.floor(cityCount / 3) };
}

export function getFortificationPlacement(
  state: Pick<GameState, 'map' | 'cities'>,
  ownerId: string,
  coord: HexCoord,
  options: FortificationPlacementOptions = {},
): FortificationPlacement {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile) return { ok: false, reason: 'missing-tile' };
  if (tile.owner !== ownerId) return { ok: false, reason: 'outside-territory' };
  if (Object.values(state.cities).some(city => hexKey(city.position) === hexKey(coord))) return { ok: false, reason: 'city-center' };
  if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.terrain === 'mountain') return { ok: false, reason: 'invalid-terrain' };
  if (tile.improvement === 'resource_outpost'
    || (tile.improvement !== 'none' && (!options.allowReplacement || tile.improvement === 'fort'))) {
    return { ok: false, reason: 'already-improved' };
  }
  const neighbors = mapNeighbors(state.map, coord);
  if (neighbors.some(neighbor => state.map.tiles[hexKey(neighbor)]?.improvement === 'fort')) return { ok: false, reason: 'adjacent-fort' };

  const cityCount = Object.values(state.cities).filter(city => city.owner === ownerId).length;
  const capacity = getFortificationCapacity(state, ownerId);
  const isFrontier = neighbors.some(neighbor => {
    const neighborTile = state.map.tiles[hexKey(neighbor)];
    return neighborTile !== undefined && neighborTile.owner !== ownerId;
  });
  if (capacity.built >= capacity.limit || (capacity.built >= cityCount && !isFrontier)) return { ok: false, reason: 'empire-cap' };
  return { ok: true, isFrontier };
}

export interface FortificationDefense {
  multiplier: number;
  label?: string;
}

/** One deterministic, viewer-scoped frontier target for an AI Worker. */
export function findFortificationCandidate(state: GameState, ownerId: string): { coord: HexCoord } | null {
  const completedTechs = state.civilizations[ownerId]?.techState.completed ?? [];
  if (!completedTechs.includes('fortresses')) return null;
  const visibleTiles = state.civilizations[ownerId]?.visibility.tiles ?? {};
  const threats = Object.values(state.units).filter(unit => {
    if (unit.owner === ownerId || unit.transportId || UNIT_DEFINITIONS[unit.type]?.strength <= 0) return false;
    const diplomacy = state.civilizations[ownerId]?.diplomacy;
    if (unit.owner !== 'barbarian' && (!diplomacy || !isAtWar(diplomacy, unit.owner))) return false;
    return visibleTiles[hexKey(unit.position)] === 'visible';
  });
  if (threats.length === 0) return null;
  const candidates = Object.values(state.map.tiles)
    .filter(tile => {
      const placement = getFortificationPlacement(state, ownerId, tile.coord);
      return placement.ok && placement.isFrontier;
    })
    .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)));
  for (const candidate of candidates) {
    const threatened = threats.some(threat => (state.map.wrapsHorizontally
      ? wrappedHexDistance(candidate.coord, threat.position, state.map.width)
      : hexDistance(candidate.coord, threat.position)) <= 2);
    if (threatened) return { coord: { ...candidate.coord } };
  }
  return null;
}

export function resolveFortificationDefense(
  state: Pick<GameState, 'map' | 'civilizations'>,
  defender: Unit,
  attacker: Unit,
): FortificationDefense {
  const tile = state.map.tiles[hexKey(defender.position)];
  const defenderDefinition = UNIT_DEFINITIONS[defender.type];
  if (!tile || tile.improvement !== 'fort' || tile.improvementTurnsLeft > 0 || tile.owner !== defender.owner
    || defender.transportId || defenderDefinition.domain === 'naval' || defenderDefinition.domain === 'air' || defenderDefinition.strength <= 0) return { multiplier: 1 };
  const tier = getFortificationTier(state.civilizations[defender.owner]?.techState.completed ?? []);
  const penetration = UNIT_DEFINITIONS[attacker.type]?.fortificationPenetration ?? 1;
  const multiplier = 1 + (tier.multiplier - 1) * penetration;
  const penetrated = penetration !== 1;
  return { multiplier, label: `${tier.label} +${Math.round((tier.multiplier - 1) * 100)}%${penetrated ? ` (${Math.round((1 - penetration) * 100)}% penetrated)` : ''}` };
}
