import type { HexCoord } from '@/core/types/hex';
import type { HomelandBand, HomelandOption } from '@/core/types/homeland';
import { createRng, MIN_MAJOR_CIV_START_DISTANCE } from '@/systems/map-generator';
import { getWrappedHexesInRange, hexDistance, hexesInRange, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { isValidStartTile } from '@/systems/map-validation';
import type { PolarRowBand } from '@/systems/geo-latitude';
import { createStartQualityIndex, type StartQualityIndex, type StartQualityMap } from '@/systems/start-quality';
import { START_SELECTION, selectStartSites, type ScoredSite } from '@/systems/start-site-selection';

/**
 * Turn-1 homeland choice (design 2026-11-25, Phase C, C1-C2): the alternates a human is offered besides the start they
 * were placed on. Alternates are chosen at game creation, with the shared selection and the major start minimum, so
 * every start-relative creation step can reserve them and any choice leaves a legal, fair world.
 */

/** An alternate is a real choice (not next door) and still the same region (not across the world). */
export const HOMELAND_MIN_FROM_OWN_START = 6;
export const HOMELAND_MAX_FROM_OWN_START = 16;
/** Two alternates of one civilization are not twins. */
export const HOMELAND_MIN_BETWEEN_ALTERNATES = 5;
/** Up to this many alternates besides the placed start. */
export const HOMELAND_ALTERNATE_COUNT = 2;
/** An alternate with the same character as the placed start is a weaker choice: it must beat a different one by this much. */
const SAME_CHARACTER_PENALTY = 4;

/** The map a homeland is described and chosen on: structural, so this module stays off the core type barrel. */
export type HomelandMap = StartQualityMap;

export interface HomelandOptionsInput {
  map: HomelandMap;
  /** Every civilization's placed start, by roster index. */
  starts: HexCoord[];
  /** Roster indices of the human civilizations; AI civilizations never choose. */
  humanIndices: number[];
  seed: string;
  polarRows?: PolarRowBand;
}

const terrainOf = (map: HomelandMap, coord: HexCoord): string | undefined => map.tiles[hexKey(coord)]?.terrain;
const isWater = (terrain: string | undefined): boolean => terrain === 'ocean' || terrain === 'coast';

function bandOf(value: number, rich: number, fair: number): HomelandBand {
  return value >= rich ? 'rich' : value >= fair ? 'fair' : 'lean';
}

function joinPhrases(parts: string[]): string {
  if (parts.length === 0) return 'Open land all around.';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * What a start is like, from the land within two hexes (what a settler sees) and nothing else. The character is the
 * option's name in the choice; the summary says what is near; food and production are honest bands.
 */
export function describeHomelandSite(map: HomelandMap, coord: HexCoord, quality: StartQualityIndex): Pick<HomelandOption, 'character' | 'summary' | 'food' | 'production'> {
  const nearby = map.wrapsHorizontally ? getWrappedHexesInRange(coord, 2, map.width) : hexesInRange(coord, 2);
  const counts: Record<string, number> = {};
  for (const hex of nearby) {
    if (hexKey(hex) === hexKey(coord)) continue;
    const terrain = terrainOf(map, hex);
    if (terrain === undefined || isWater(terrain)) continue;
    counts[terrain] = (counts[terrain] ?? 0) + 1;
  }
  const site = quality.assess(coord);
  const fertile = (counts.grassland ?? 0) + (counts.plains ?? 0);
  const rough = (counts.forest ?? 0) + (counts.hills ?? 0);

  let character: string;
  if (site.freshWater && fertile >= 5) character = 'River valley';
  else if (site.coastal) character = fertile >= rough ? 'Coastal plain' : 'Shoreline woodland';
  else if ((counts.hills ?? 0) >= 4) character = 'Hill country';
  else if ((counts.forest ?? 0) >= 5) character = 'Forest land';
  else if ((counts.grassland ?? 0) >= 6) character = 'Rich grassland';
  else character = 'Open plains';

  const parts: string[] = [];
  if (site.freshWater) parts.push('a river at hand');
  if (site.coastal) parts.push('the sea close by');
  if ((counts.hills ?? 0) >= 2) parts.push(`${counts.hills} hills`);
  if ((counts.forest ?? 0) >= 2) parts.push('woodland');
  if ((counts.grassland ?? 0) >= 4) parts.push('open grassland');
  return {
    character,
    summary: joinPhrases(parts),
    food: bandOf(site.landFood6, 11, 8),
    production: bandOf(site.landProduction6, 9, 5),
  };
}

/**
 * Per human civilization (by roster index): option 0 is its placed start, then up to two alternates. Alternates pass the
 * major start minimum, are a start distance from every other civilization's start and from every other human's options
 * (so every combination of choices is legal), and sit between 6 and 16 hexes from the civilization's own start. A map
 * with no room gives fewer, down to the placed start alone. Deterministic for a seed.
 */
export function selectHomelandOptions(input: HomelandOptionsInput): Map<number, HomelandOption[]> {
  const { map, starts, humanIndices, seed } = input;
  const quality = createStartQualityIndex(map, { polarRows: input.polarRows });
  const distance = (a: HexCoord, b: HexCoord): number =>
    map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);

  const viable: ScoredSite[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (!isValidStartTile(tile) || !quality.passesFloor(tile.coord, 'major')) continue;
    viable.push({ coord: tile.coord, score: quality.assess(tile.coord).score });
  }

  const result = new Map<number, HomelandOption[]>();
  const reserved: HexCoord[] = [];
  for (const index of [...humanIndices].sort((a, b) => a - b)) {
    const own = starts[index];
    const placed: HomelandOption = { coord: { q: own.q, r: own.r }, ...describeHomelandSite(map, own, quality) };
    const options: HomelandOption[] = [placed];
    const others = [...starts.filter((_, j) => j !== index), ...reserved];

    const candidates: ScoredSite[] = [];
    for (const site of viable) {
      const fromOwn = distance(site.coord, own);
      if (fromOwn < HOMELAND_MIN_FROM_OWN_START || fromOwn > HOMELAND_MAX_FROM_OWN_START) continue;
      if (others.some(other => distance(site.coord, other) < MIN_MAJOR_CIV_START_DISTANCE)) continue;
      const penalty = describeHomelandSite(map, site.coord, quality).character === placed.character ? SAME_CHARACTER_PENALTY : 0;
      candidates.push({ coord: site.coord, score: site.score - penalty });
    }

    for (let count = HOMELAND_ALTERNATE_COUNT; count >= 1; count--) {
      const selection = selectStartSites({
        map,
        candidates,
        count,
        fixed: [own],
        minSeparation: HOMELAND_MIN_BETWEEN_ALTERNATES,
        minFromFixed: HOMELAND_MIN_FROM_OWN_START,
        band: START_SELECTION.varietyBand,
        rng: createRng(`${seed}-homeland-options-${index}`),
      });
      if (!selection.ok) continue;
      for (const site of selection.sites) {
        options.push({ coord: { q: site.coord.q, r: site.coord.r }, ...describeHomelandSite(map, site.coord, quality) });
        reserved.push(site.coord);
      }
      break;
    }
    reserved.push(own);
    result.set(index, options);
  }
  return result;
}
