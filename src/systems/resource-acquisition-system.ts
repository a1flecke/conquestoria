import type { GameState, ResourceType, ResourceYield, PurchasedResourceEntry } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './resource-definitions';
import { isAtWar } from './diplomacy-system';

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
 * Pure function — reads state only, never mutates.
 */
export function getCivAvailableResources(state: GameState, civId: string): Set<ResourceType> {
  const result = new Set<ResourceType>();
  const civ = state.civilizations[civId];
  if (!civ) return result;

  const completedTechs = new Set(civ.techState.completed);
  const resourceDefMap = new Map(RESOURCE_DEFINITIONS.map(d => [d.id, d]));

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;

    const cityKey = hexKey(city.position);

    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      const tile = state.map.tiles[key];
      if (!tile?.resource) continue;

      const def = resourceDefMap.get(tile.resource as ResourceType);
      if (!def) continue;

      // Tech gate — must have researched the revealing tech.
      if (!completedTechs.has(def.tech)) continue;

      if (key === cityKey) {
        // City-center exception: tech alone grants the resource.
        result.add(tile.resource as ResourceType);
      } else {
        // Off-center tile: requires a completed improvement of the right type.
        if (
          tile.improvement === def.requiredImprovement &&
          tile.improvementTurnsLeft === 0
        ) {
          result.add(tile.resource as ResourceType);
        }
      }
    }
  }

  // Pass 2 — resource outpost tiles owned by this civ (outside city territory)
  // Linear scan over all tiles: 60×40 = 2,400 tiles maximum.
  for (const tile of Object.values(state.map.tiles)) {
    if (
      tile.improvement !== 'resource_outpost' ||
      tile.improvementTurnsLeft !== 0 ||
      tile.owner !== civId ||
      !tile.resource
    ) continue;

    const def = resourceDefMap.get(tile.resource as ResourceType);
    if (!def) continue;
    if (!completedTechs.has(def.tech)) continue;

    result.add(tile.resource as ResourceType);
  }

  // Pass 3 — purchased resource access (Diplomatic Marketplace / S9)
  // Entries are cleaned up by the turn-manager; this pass just reads what remains.
  for (const entry of (state.marketplace?.purchasedResources ?? [])) {
    if (entry.civId !== civId) continue;
    if (entry.expiresOnTurn <= state.turn) continue;

    const def = resourceDefMap.get(entry.resource);
    if (!def) continue;
    if (!completedTechs.has(def.tech)) continue;

    result.add(entry.resource);
  }

  return result;
}

/**
 * Returns the aggregate per-city yield bonus from all owned resources whose
 * effect type is NOT 'happiness' (i.e. gold, production, food effects only).
 * Non-stacking per resource: owning any number of the same resource counts once.
 * Different resources with the same effect type DO accumulate
 * (gems + silver → +2 gold/turn).
 */
export function getCivResourceYieldBonus(
  state: GameState,
  civId: string,
): ResourceYield {
  const bonus: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  const owned = getCivAvailableResources(state, civId);

  for (const def of RESOURCE_DEFINITIONS) {
    if (!def.effect || def.effect.type === 'happiness') continue;
    if (!owned.has(def.id as ResourceType)) continue;

    switch (def.effect.type) {
      case 'gold':       bonus.gold       += def.effect.amount; break;
      case 'production': bonus.production += def.effect.amount; break;
      case 'food':       bonus.food       += def.effect.amount; break;
    }
  }

  return bonus;
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
    if (!def.effect || def.effect.type !== 'happiness') continue;
    if (owned.has(def.id as ResourceType)) count++;
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

  const { [unitId]: _removed, ...remainingUnits } = state.units;

  return {
    ...state,
    units: remainingUnits,
    map: {
      ...state.map,
      tiles: {
        ...state.map.tiles,
        [tileKey]: updatedTile,
      },
    },
  };
}

/**
 * Returns true when a buyer civ can purchase 10-turn resource access from a seller civ.
 *
 * All conditions must hold:
 *   1. Seller is in buyer's diplomacy.relationships (civs have met).
 *   2. Not at war.
 *   3. Relationship score >= 0.
 *   4. Seller has the resource (via getCivAvailableResources).
 *   5. Buyer does NOT already own the resource.
 */
export function canBuyResourceAccess(
  state: GameState,
  buyerCivId: string,
  sellerCivId: string,
  resource: ResourceType,
): boolean {
  const buyer = state.civilizations[buyerCivId];
  if (!buyer) return false;

  // Must have met the seller (key present in relationships map)
  if (!(sellerCivId in buyer.diplomacy.relationships)) return false;

  // Not at war
  if (isAtWar(buyer.diplomacy, sellerCivId)) return false;

  // Relationship score must be >= 0
  const score = buyer.diplomacy.relationships[sellerCivId] ?? -100;
  if (score < 0) return false;

  // Seller must have the resource
  const sellerResources = getCivAvailableResources(state, sellerCivId);
  if (!sellerResources.has(resource)) return false;

  // Buyer must not already own it
  const buyerResources = getCivAvailableResources(state, buyerCivId);
  if (buyerResources.has(resource)) return false;

  return true;
}

/**
 * Deducts 3× basePrice gold from the buyer and adds a 10-turn purchasedResources entry.
 * Precondition: canBuyResourceAccess(state, buyerCivId, sellerCivId, resource) === true.
 * Returns a new GameState (immutable spread-copy). Returns state unchanged if marketplace absent.
 */
export function performBuyResourceAccess(
  state: GameState,
  buyerCivId: string,
  _sellerCivId: string,   // reserved: future diplomatic impact on relationship score
  resource: ResourceType,
): GameState {
  if (!state.marketplace) return state;

  const def = RESOURCE_DEFINITIONS.find(d => d.id === resource);
  const cost = (def?.basePrice ?? 5) * 3;

  const buyer = state.civilizations[buyerCivId];
  if (!buyer) return state;

  const newEntry: PurchasedResourceEntry = {
    civId: buyerCivId,
    resource,
    expiresOnTurn: state.turn + 10,
  };

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [buyerCivId]: { ...buyer, gold: buyer.gold - cost },
    },
    marketplace: {
      ...state.marketplace,
      purchasedResources: [...(state.marketplace.purchasedResources ?? []), newEntry],
    },
  };
}
