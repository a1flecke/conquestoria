// src/systems/resource-source-eligibility.ts
// #1505 MR08: the one place that says "this tile is a legitimate source of this resource".
//
// Before this module the rule existed twice: `getCivAvailableResources` (access) and
// `getActiveResourceSourceCount` (physically owned sources for quests) each re-implemented the tech
// gate, the city-center exception, the completed-improvement rule, the outpost rule and the hostile
// occupation check. They disagreed in *scope*, not in rule — access also counts the city center and
// purchased access, while a physically-owned-source quest does not.
//
// This module keeps that distinction explicit instead of erasing it: the predicates here decide
// whether a tile is a source at all, and each caller chooses which kinds it counts. The reserve kernel
// (#1505) adds the one thing neither caller had: a source list deduplicated by coordinate, because a
// tile contributes once even when several cities list it in `ownedTiles`.
import type { GameState, HexCoord, ResourceType } from '@/core/types';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { hexKey } from './hex-utils';
import { isAtWar } from './diplomacy-queries';
import { RESOURCE_DEFINITIONS, type ResourceDefinition } from './resource-definitions';

/** How a tile legitimately produces its resource. */
export type ResourceSourceKind = 'city-center' | 'city-improvement' | 'outpost';

export interface ResourceSource {
  coord: HexCoord;
  resource: ResourceType;
  kind: ResourceSourceKind;
  /** The city whose territory holds a city-owned source (absent for an outpost). */
  cityId?: string;
}

export function getResourceDefinition(resource: ResourceType): ResourceDefinition | undefined {
  return RESOURCE_DEFINITIONS.find(candidate => candidate.id === resource);
}

/**
 * Is a completed improvement on this tile unusable because a hostile unit stands on it? Moved here
 * from `resource-acquisition-system` (#1505 MR08) so the source predicates share one definition;
 * that module re-exports it unchanged for its existing callers.
 */
export function isResourceTileDeniedByHostileOccupation(
  state: GameState,
  civId: string,
  coord: HexCoord,
): boolean {
  const civ = state.civilizations[civId];
  const tile = state.map.tiles[hexKey(coord)];
  if (
    !tile?.resource
    || tile.improvement === 'none'
    || tile.improvementTurnsLeft !== 0
  ) return false;
  return Object.values(state.units ?? {}).some(unit => {
    if (unit.transportId || unit.owner === civId || hexKey(unit.position) !== hexKey(coord)) {
      return false;
    }
    if (isAlwaysHostilePair(civId, unit.owner)) return true;
    return Boolean(
      civ?.diplomacy && isAtWar(civ.diplomacy, unit.owner)
      || state.civilizations[unit.owner]?.diplomacy
        && isAtWar(state.civilizations[unit.owner].diplomacy, civId),
    );
  });
}

/** Does this civ know the resource exists? (Reveal technology, nothing more.) */
export function isResourceRevealed(state: GameState, civId: string, definition: ResourceDefinition): boolean {
  return (state.civilizations[civId]?.techState.completed ?? []).includes(definition.tech);
}

/**
 * The tile-level source rule. Returns *how* the tile produces, or null when it does not.
 *
 * `allowCityCenter` is the whole access-versus-ownership distinction: a city center is a legitimate
 * source of access (the city implicitly works its own tile), but it is not a physically worked
 * improvement, so a source count for a quest must pass `false`.
 */
export function getResourceSourceKindAt(
  state: GameState,
  civId: string,
  coord: HexCoord,
  definition: ResourceDefinition,
  options: { cityCenter: boolean; allowCityCenter: boolean },
): ResourceSourceKind | null {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || tile.resource !== definition.id) return null;
  if (!isResourceRevealed(state, civId, definition)) return null;
  if (isResourceTileDeniedByHostileOccupation(state, civId, coord)) return null;

  if (options.cityCenter) return options.allowCityCenter ? 'city-center' : null;
  if (tile.improvement === definition.requiredImprovement && tile.improvementTurnsLeft === 0) {
    return 'city-improvement';
  }
  return null;
}

/** A resource outpost outside city territory: completed, owned, revealed, uncontested. */
export function isResourceOutpostSource(
  state: GameState,
  civId: string,
  tile: GameState['map']['tiles'][string],
  definition: ResourceDefinition,
): boolean {
  return tile.resource === definition.id
    && tile.owner === civId
    && tile.improvement === 'resource_outpost'
    && tile.improvementTurnsLeft === 0
    && isResourceRevealed(state, civId, definition)
    && !isResourceTileDeniedByHostileOccupation(state, civId, tile.coord);
}

export interface ListResourceSourcesOptions {
  /** Restrict to one resource. */
  resource?: ResourceType;
  /** Include city-center deposits (access semantics). Default false: physically worked sources only. */
  allowCityCenter?: boolean;
}

/**
 * Every legitimate source this civ owns, **deduplicated by coordinate** so a tile listed by several
 * cities contributes once (parent §3.3). Ordered deterministically by coordinate key, then kind.
 */
export function listResourceSources(
  state: GameState,
  civId: string,
  options: ListResourceSourcesOptions = {},
): ResourceSource[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  const allowCityCenter = options.allowCityCenter ?? false;
  const byCoord = new Map<string, ResourceSource>();

  const consider = (source: ResourceSource): void => {
    if (byCoord.has(hexKey(source.coord))) return;
    if (options.resource && source.resource !== options.resource) return;
    byCoord.set(hexKey(source.coord), source);
  };

  for (const cityId of civ.cities ?? []) {
    const city = state.cities[cityId];
    if (!city || city.owner !== civId) continue;
    const cityKey = hexKey(city.position);
    for (const coord of city.ownedTiles ?? []) {
      const tile = state.map.tiles[hexKey(coord)];
      if (!tile?.resource) continue;
      const definition = getResourceDefinition(tile.resource as ResourceType);
      if (!definition) continue;
      const kind = getResourceSourceKindAt(state, civId, coord, definition, {
        cityCenter: hexKey(coord) === cityKey,
        allowCityCenter,
      });
      if (kind) consider({ coord: { ...coord }, resource: definition.id, kind, cityId });
    }
  }

  for (const tile of Object.values(state.map.tiles)) {
    if (!tile?.resource || tile.improvement !== 'resource_outpost') continue;
    const definition = getResourceDefinition(tile.resource as ResourceType);
    if (!definition || !isResourceOutpostSource(state, civId, tile, definition)) continue;
    consider({ coord: { ...tile.coord }, resource: definition.id, kind: 'outpost' });
  }

  return [...byCoord.values()].sort((left, right) =>
    hexKey(left.coord).localeCompare(hexKey(right.coord)) || left.kind.localeCompare(right.kind));
}
