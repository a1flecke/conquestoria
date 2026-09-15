/**
 * #1064 -- where, in this civilization's BELIEF, could a city stand?
 *
 * This module is deliberately `GameState`-free. It receives a map that has ALREADY
 * been fog-bounded by `buildKnownPathMap`, so it is structurally incapable of reading
 * hidden information -- AI information safety by construction rather than by review
 * vigilance. Legality is still validated by the canonical helpers at execution time
 * (`canFoundCityAt` in the tactics ranking, `foundCityInState` in the executor); a
 * belief that turns out wrong costs a wasted walk, never an illegal city.
 *
 * It shares the real founding rule's own pieces -- `isCityCenterTerrain`,
 * `MIN_CITY_CENTER_DISTANCE`, the wrap-aware `cityDistance` -- so belief and legality
 * differ in exactly one dimension: which cities the civ knows about.
 */
import type { GameMap, HexCoord } from '@/core/types';
import {
  MIN_CITY_CENTER_DISTANCE,
  cityDistance,
  isCityCenterTerrain,
} from '@/systems/city-territory-system';
import { hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { isPositionCoastal } from '@/systems/city-system';
import { evaluateExpansionTarget } from './ai-strategy';

/**
 * How far from an operational anchor a site may sit. This is a COST bound, not a
 * flavour knob: an unbounded scan is O(known tiles x known cities) per civ per round,
 * which would add a new super-linear cost inside the arc that exists to remove one.
 * A settler moves 2/turn, so 8 is roughly a four-turn walk.
 */
export const EXPANSION_SEARCH_RADIUS = 8;

/** Sites handed to the travel resolver. Only the best REACHABLE one is ever emitted. */
export const EXPANSION_SITE_SHORTLIST = 3;

/** Tiles around a site whose terrain is scored. */
export const EXPANSION_NEIGHBOURHOOD_RADIUS = 2;

export const EXPANSION_CITY_SOFT_CAP_BASE = 2;

/**
 * #1107 -- score bonus applied to a candidate site that would itself pass
 * isPositionCoastal, but ONLY when the requesting civ currently has zero
 * coastal cities (needsCoastalAccess). Sized to reliably overcome
 * evaluateExpansionTarget's ocean-tile penalty and typical terrain-score
 * spread for a radius-2 neighbourhood; confirmed against the fixture data in
 * tests/ai/ai-expansion-sites.test.ts before this value was finalized here --
 * if you need to change it, re-measure against real data, don't guess.
 */
export const COASTAL_ACCESS_RECOVERY_BONUS = 40;

export interface AIExpansionSite {
  anchor: HexCoord;
  /** `evaluateExpansionTarget` over the site's KNOWN neighbourhood. */
  score: number;
}

/**
 * Owned-city count at or above which no expand candidate is produced. Range 2..6.
 * This is the ONLY place `expansionDrive` gates WHETHER a civ expands; everywhere
 * else it only weights HOW MUCH. It caps new settling, not empire size -- conquest
 * is unaffected.
 */
export function getExpansionCitySoftCap(expansionDrive: number): number {
  return EXPANSION_CITY_SOFT_CAP_BASE + Math.round(expansionDrive * 4);
}

function scoreNeighbourhood(knownMap: GameMap, centre: HexCoord): number {
  const terrainCounts: Record<string, number> = {};
  for (const coord of mapHexesInRange(knownMap, centre, EXPANSION_NEIGHBOURHOOD_RADIUS)) {
    const tile = knownMap.tiles[hexKey(coord)];
    if (!tile) continue;
    terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] ?? 0) + 1;
  }
  return evaluateExpansionTarget(centre, terrainCounts);
}

/**
 * Sites this civilization believes a city could stand on, best first then `hexKey`
 * ascending (a total order, so the result is deterministic).
 *
 * `knownMap` MUST already be fog-bounded -- this performs no visibility filtering of
 * its own.
 */
export function getKnownExpansionSites(
  knownMap: GameMap,
  knownCityPositions: readonly HexCoord[],
  anchors: readonly HexCoord[],
  limit: number,
  needsCoastalAccess = false,
  pinnedAnchor?: HexCoord,
): AIExpansionSite[] {
  if (anchors.length === 0 || limit <= 0) return [];

  const considered = new Map<string, HexCoord>();
  for (const anchor of anchors) {
    for (const coord of mapHexesInRange(knownMap, anchor, EXPANSION_SEARCH_RADIUS)) {
      const key = hexKey(coord);
      if (considered.has(key) || !knownMap.tiles[key]) continue;
      considered.set(key, knownMap.tiles[key]!.coord);
    }
  }
  // A pinned site (the civ's currently in-progress expand target) must stay
  // considered even if a search anchor doesn't happen to cover it -- normally
  // that can't happen (an in-progress target was itself found within radius of
  // an anchor), but this keeps the guarantee independent of that assumption.
  const pinnedKey = pinnedAnchor ? hexKey(pinnedAnchor) : undefined;
  if (pinnedAnchor && pinnedKey && !considered.has(pinnedKey) && knownMap.tiles[pinnedKey]) {
    considered.set(pinnedKey, knownMap.tiles[pinnedKey]!.coord);
  }

  const sites: AIExpansionSite[] = [];
  for (const [key, coord] of considered) {
    const tile = knownMap.tiles[key]!;
    if (!isCityCenterTerrain(tile.terrain)) continue;
    const tooClose = knownCityPositions.some(city =>
      cityDistance(coord, city, knownMap) < MIN_CITY_CENTER_DISTANCE);
    if (tooClose) continue;
    const baseScore = scoreNeighbourhood(knownMap, coord);
    const score = needsCoastalAccess && isPositionCoastal(coord, knownMap)
      ? baseScore + COASTAL_ACCESS_RECOVERY_BONUS
      : baseScore;
    sites.push({ anchor: { ...coord }, score });
  }

  const ranked = sites.sort((left, right) =>
    right.score - left.score
    || hexKey(left.anchor).localeCompare(hexKey(right.anchor)));
  const shortlisted = ranked.slice(0, limit);
  // #1107 -- guarantee the pinned site is in the result regardless of the
  // limit-based truncation above, so a civ can never be forced off a
  // still-legal, still-reachable, already-committed expand target purely
  // because OTHER sites now outscore it. Additive: never displaces a
  // genuinely top-`limit`-scoring site.
  if (pinnedKey && !shortlisted.some(site => hexKey(site.anchor) === pinnedKey)) {
    const pinnedSite = ranked.find(site => hexKey(site.anchor) === pinnedKey);
    if (pinnedSite) shortlisted.push(pinnedSite);
  }
  return shortlisted;
}
