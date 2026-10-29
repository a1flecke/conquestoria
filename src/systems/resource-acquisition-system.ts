import type {
  GameState,
  LegendaryWonderResourceScope,
  ResourceType,
} from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS, getResourceAccessBenefit } from './resource-definitions';
import { findTradeGood } from './trade-good-definitions';
import {
  getResourceSourceKindAt,
  isResourceOutpostSource,
} from './resource-source-eligibility';
import { removeUnits } from '@/systems/unit-removal-system';

/**
 * #1505 MR08: the hostile-occupation predicate moved into the shared source-eligibility leaf so access,
 * quest source counts and the reserve kernel read one rule. It is re-exported here unchanged for its
 * existing callers (`strategic-warning-system` and the acquisition tests).
 */
export { isResourceTileDeniedByHostileOccupation } from './resource-source-eligibility';

/**
 * Returns the set of resource IDs that a civ currently has access to.
 *
 * A civ "has" a resource when ALL of the following are true for some tile in
 * one of their cities' owned territory:
 *   1. The tile has a resource.
 *   2. The civ has researched the tech that reveals that resource.
 *   3. Either:
 *      a. The tile IS the city center (tech alone is sufficient — the city
 *         implicitly exploits its own tile), OR
 *      b. A completed improvement of the required type exists on the tile
 *         (improvementTurnsLeft === 0).
 *
 * #1505 MR08: the per-tile rule now lives in `resource-source-eligibility`; this function keeps its
 * own *scope* — access also counts the city center and outposts — so a caller that needs physically
 * worked sources still asks `getActiveResourceSourceCount`.
 *
 * Pure function — reads state only, never mutates.
 */
export function getCivAvailableResources(
  state: GameState,
  civId: string,
): Set<ResourceType> {
  const result = new Set<ResourceType>();
  const civ = state.civilizations[civId];
  if (!civ) return result;

  const completedTechs = new Set(civ.techState.completed);
  const resourceDefMap = new Map(RESOURCE_DEFINITIONS.map(d => [d.id, d]));
  const mapTiles = state.map?.tiles ?? {};

  for (const cityId of civ.cities ?? []) {
    const city = state.cities[cityId];
    if (!city) continue;

    const cityKey = hexKey(city.position);

    for (const coord of city.ownedTiles ?? []) {
      const key = hexKey(coord);
      const tile = mapTiles[key];
      if (!tile?.resource) continue;

      const def = resourceDefMap.get(tile.resource as ResourceType);
      if (!def) continue;

      // Tech gate — must have researched the revealing tech.
      if (!completedTechs.has(def.tech)) continue;

      const kind = getResourceSourceKindAt(state, civId, coord, def, {
        cityCenter: key === cityKey,
        allowCityCenter: true,
      });
      if (kind) result.add(tile.resource as ResourceType);
    }
  }

  // Pass 2 — resource outpost tiles owned by this civ (outside city territory)
  // Linear scan over all tiles: 60×40 = 2,400 tiles maximum.
  for (const tile of Object.values(mapTiles)) {
    if (
      tile.improvement !== 'resource_outpost' ||
      tile.improvementTurnsLeft !== 0 ||
      tile.owner !== civId ||
      !tile.resource
    ) continue;

    const def = resourceDefMap.get(tile.resource as ResourceType);
    if (!def) continue;
    if (isResourceOutpostSource(state, civId, tile, def)) result.add(tile.resource as ResourceType);
  }

  // Pass 3 — delivered luxury-service coverage (#1511 MR14). This is access, not stock: it grants
  // the resource's access benefit until expiry and never a worked-tile yield.
  for (const [goodId, coverage] of Object.entries(state.luxuryServiceByCiv?.[civId]?.coverageByGood ?? {})) {
    if (coverage.expiresOnTurn <= state.turn) continue;
    const good = findTradeGood(goodId);
    if (good?.nativeSource?.kind !== 'resource') continue;
    const def = resourceDefMap.get(good.nativeSource.resource);
    if (!def || !completedTechs.has(def.tech)) continue;
    result.add(def.id);
  }

  return result;
}

/**
 * Counts completed, physically worked resource sources. Unlike civilization
 * resource access, city-center deposits and marketplace purchases do not count.
 */
export function getActiveResourceSourceCount(
  state: GameState,
  civId: string,
  resource: ResourceType,
  scope: { scope: LegendaryWonderResourceScope; cityId?: string },
): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;

  const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === resource);
  if (!definition || !civ.techState.completed.includes(definition.tech)) return 0;

  const cityIds = scope.scope === 'host-city'
    ? scope.cityId ? [scope.cityId] : []
    : civ.cities;
  let count = 0;
  // #1505 MR08: a tile contributes once, even when several cities list it in `ownedTiles` (parent
  // §3.3). Before this, a shared tile was counted once per city, inflating quest source counts.
  const countedCoords = new Set<string>();

  for (const cityId of cityIds) {
    const city = state.cities[cityId];
    if (!city || city.owner !== civId) continue;
    const cityKey = hexKey(city.position);

    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      if (countedCoords.has(key)) continue;
      const kind = getResourceSourceKindAt(state, civId, coord, definition, {
        cityCenter: key === cityKey,
        // A physically owned source is a worked improvement — never the city center.
        allowCityCenter: false,
      });
      if (kind === 'city-improvement') {
        countedCoords.add(key);
        count++;
      }
    }
  }

  if (scope.scope === 'host-city') return count;

  for (const tile of Object.values(state.map.tiles)) {
    if (!isResourceOutpostSource(state, civId, tile, definition)) continue;
    if (tile.resource !== resource) continue;
    const key = hexKey(tile.coord);
    if (countedCoords.has(key)) continue;
    countedCoords.add(key);
    count++;
  }

  return count;
}

/**
 * Returns the count of distinct happiness-type luxuries owned by the civ.
 * Empire-wide, non-stacking: owning three silk tiles counts as 1, not 3.
 * Different resources accumulate: silk + wine = 2.
 */
export function getCivHappinessFromResources(
  state: GameState,
  civId: string,
): number {
  const owned = getCivAvailableResources(state, civId);
  let count = 0;

  for (const def of RESOURCE_DEFINITIONS) {
    const benefit = getResourceAccessBenefit(def);
    if (benefit.kind !== 'happiness') continue;
    if (owned.has(def.id as ResourceType)) count += benefit.amount;
  }

  return count;
}

/**
 * Returns true when an Expedition unit can use "Establish Outpost" at its
 * current position. All conditions must be met:
 *   1. Unit is an Expedition.
 *   2. Tile has a resource and no existing improvement.
 *   3. Civ has researched the tech that enables that resource.
 *   4. Tile is NOT in this civ's city territory (worker path applies there).
 */
export function canEstablishOutpost(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'expedition') return false;

  const tileKey = hexKey(unit.position);
  const tile = state.map.tiles[tileKey];
  if (!tile || !tile.resource || tile.improvement !== 'none') return false;

  const civ = state.civilizations[unit.owner];
  if (!civ) return false;

  const def = RESOURCE_DEFINITIONS.find(d => d.id === tile.resource);
  if (!def || !civ.techState.completed.includes(def.tech)) return false;

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    if (city.ownedTiles.some(coord => hexKey(coord) === tileKey)) return false;
  }

  return true;
}

/**
 * Establishes a Resource Outpost on the tile the Expedition stands on and
 * immediately removes the Expedition unit. Used by both human and AI paths.
 *
 * Precondition: canEstablishOutpost(state, unitId) === true.
 * Returns a new GameState (immutable spread-copy).
 */
export function performEstablishOutpost(state: GameState, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;

  const tileKey = hexKey(unit.position);
  const existingTile = state.map.tiles[tileKey];
  if (!existingTile) return state;

  const civId = unit.owner;

  const updatedTile = {
    ...existingTile,
    improvement: 'resource_outpost' as const,
    improvementTurnsLeft: 2,
    owner: civId,
    // improvementOwner lets processImprovements() log "Resource Outpost completed!" to the civ
    improvementOwner: civId,
  };

  // The worker is spent building the outpost.
  return {
    ...removeUnits(state, [unitId], { reason: 'consumed' }).state,
    map: {
      ...state.map,
      tiles: {
        ...state.map.tiles,
        [tileKey]: updatedTile,
      },
    },
  };
}

// The instant resource market (#1498 MR01) is retired as of MR19: the physical shipment pipeline
// (MR12–MR14) is the only purchase path, so there is no decision, executor, cost estimate, or
// containment notice left to keep in sync.
