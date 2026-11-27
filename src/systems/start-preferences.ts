import type { HexCoord } from '@/core/types/hex';
import type { StartPreference } from '@/core/types/start-style';
import { getWrappedHexesInRange, hexDistance, hexesInRange, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { solveMinCostAssignment } from '@/systems/min-cost-assignment';

/**
 * Civilization start preferences (design 2026-11-25, B3). They decide which civilization gets which of the starts
 * placement already chose; they never choose a site and never lift a site over the start floor (every site reaching
 * here has passed it). Scored from the land a settler sees, within two hexes.
 */

/** The part of a map preferences read (structural, so this leaf does not import the type barrel). */
interface PreferenceMap {
  width: number;
  wrapsHorizontally?: boolean;
  tiles: Record<string, { terrain: string; hasRiver?: boolean }>;
}

/** Hills or forest tiles within two hexes for a full match. */
const TERRAIN_MATCH_TILES = 3;

const isWaterTerrain = (terrain: string): boolean => terrain === 'ocean' || terrain === 'coast';

export interface StartPreferenceFacts {
  coastal: boolean;
  river: boolean;
  hills: number;
  forest: number;
  frozenShare: number;
  desertShare: number;
}

export function describeStartPreferenceFacts(map: PreferenceMap, coord: HexCoord): StartPreferenceFacts {
  const within = (range: number): HexCoord[] => (map.wrapsHorizontally
    ? getWrappedHexesInRange(coord, range, map.width)
    : hexesInRange(coord, range));
  const tile = (at: HexCoord) => map.tiles[hexKey(at)];

  let coastal = false;
  let river = tile(coord)?.hasRiver === true;
  for (const at of within(1)) {
    const neighbour = tile(at);
    if (!neighbour) continue;
    if (isWaterTerrain(neighbour.terrain)) coastal = true;
    if (neighbour.hasRiver) river = true;
  }

  let land = 0;
  let hills = 0;
  let forest = 0;
  let frozen = 0;
  let desert = 0;
  for (const at of within(2)) {
    const near = tile(at);
    if (!near || isWaterTerrain(near.terrain)) continue;
    land++;
    if (near.terrain === 'hills') hills++;
    if (near.terrain === 'forest') forest++;
    if (near.terrain === 'tundra' || near.terrain === 'snow') frozen++;
    if (near.terrain === 'desert') desert++;
  }
  return {
    coastal,
    river,
    hills,
    forest,
    frozenShare: land === 0 ? 0 : frozen / land,
    desertShare: land === 0 ? 0 : desert / land,
  };
}

/**
 * How well a site suits a civilization: +1 per matched tag (hills and forest scale up to a full match at three
 * tiles), minus the share of frozen and desert land that every civilization dislikes unless it is tolerant of it.
 */
export function scoreStartPreference(facts: StartPreferenceFacts, preferences: readonly StartPreference[] = []): number {
  const has = (tag: StartPreference) => preferences.includes(tag);
  let value = 0;
  if (has('coastal') && facts.coastal) value += 1;
  if (has('river') && facts.river) value += 1;
  if (has('hills')) value += Math.min(1, facts.hills / TERRAIN_MATCH_TILES);
  if (has('forest')) value += Math.min(1, facts.forest / TERRAIN_MATCH_TILES);
  if (!has('frozen-tolerant')) value -= facts.frozenShare;
  if (!has('desert-tolerant')) value -= facts.desertShare;
  return value;
}

/** One preference point is worth this many hexes of distance from a historical homeland. */
export const PREFERENCE_HEXES_PER_POINT = 4;

export interface PreferenceAssignmentInput {
  map: PreferenceMap;
  sites: HexCoord[];
  /** One entry per civilization, in roster order; `sites.length` civilizations. */
  preferences: ReadonlyArray<readonly StartPreference[] | undefined>;
  weight: number;
  /** Historical homelands on real-world maps (Anywhere placement): staying near them still counts. */
  anchors?: ReadonlyArray<HexCoord | null>;
}

/**
 * Which site each civilization gets (`siteIndexOf[civIndex]`). Without anchors, civilization i keeps site i (the
 * order placement chose), and every civilization that moves must pay for it: a reassignment happens only when it
 * gains at least `1 / weight` preference points per civilization moved, so a weak style moves only for a clear fit
 * and a strong one for a slight fit. With anchors, distance from the homeland is the other term.
 * A weight of 0 changes nothing.
 */
export function assignStartsByPreference(input: PreferenceAssignmentInput): number[] {
  const { map, sites, preferences, weight, anchors } = input;
  const identity = sites.map((_, index) => index);
  if (sites.length !== preferences.length) throw new Error('assignStartsByPreference needs one site per civilization');
  if (weight <= 0 || sites.length < 2) return identity;
  if (!anchors && !preferences.some(list => list && list.length > 0)) return identity;

  const facts = sites.map(site => describeStartPreferenceFacts(map, site));
  const distance = (a: HexCoord, b: HexCoord) => (map.wrapsHorizontally
    ? wrappedHexDistance(a, b, map.width)
    : hexDistance(a, b));
  const cost = preferences.map((list, civIndex) => sites.map((site, siteIndex) => {
    const anchor = anchors?.[civIndex] ?? null;
    const base = anchors
      ? (anchor ? distance(anchor, site) / PREFERENCE_HEXES_PER_POINT : 0)
      : (civIndex === siteIndex ? 0 : 1);
    return base - weight * scoreStartPreference(facts[siteIndex], list ?? []);
  }));
  return solveMinCostAssignment(cost);
}
