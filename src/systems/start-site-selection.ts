import type { HexCoord } from '@/core/types/hex';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';

/**
 * Shared start-site selection (design 2026-11-25, "Start Quality Model and Homeland Choice", B2).
 *
 * Distance is a CONSTRAINT, not the goal. The old geographic placer maximised the distance between civilizations and
 * used quality only to break ties, which on a real-world map sends someone to the remotest land: an Arctic islet.
 * Here every candidate has already passed the start-quality floor; the routine maximises the weakest start's score
 * (then the total) under hard distance rules, runs several seeded passes, and draws one of the near-best solutions,
 * so different seeds give different, equally good starts.
 */

export interface ScoredSite {
  coord: HexCoord;
  score: number;
}

export const START_SELECTION = {
  passes: 64,
  candidateCap: 400,
  firstPickPool: 32,
  varietyBand: 0.15,
  pickNoise: 0.05,
  /** With `preferEven`, the share of qualifying layouts (the most even ones) the draw is made from. */
  evenShare: 0.25,
} as const;

export interface SiteSelectionInput {
  map: { width: number; wrapsHorizontally?: boolean };
  /** Candidates that already pass the floor. */
  candidates: ScoredSite[];
  /** Sites still to place. */
  count: number;
  /** Starts already placed (historical anchors). */
  fixed?: HexCoord[];
  /** Minimum distance between new sites. */
  minSeparation: number;
  /** Minimum distance between a new site and a fixed one. */
  minFromFixed: number;
  /** Solutions whose weakest score is within this fraction of the best qualify (`Infinity`: every solution). */
  band: number;
  /** Seeded noise added to each greedy pick, in score points; more noise explores more different layouts. */
  pickNoise?: number;
  /**
   * Fair start style: among the qualifying layouts, draw only from the most even ones (the smallest gap between the
   * strongest and the weakest start), so the band lifts the weakest start and this reins in the strongest.
   */
  preferEven?: boolean;
  rng: () => number;
}

export type SiteSelectionResult =
  | { ok: true; sites: ScoredSite[]; weakestScore: number }
  | { ok: false; maximumPlaced: number };

export function selectStartSites(input: SiteSelectionInput): SiteSelectionResult {
  const { map, count, minSeparation, minFromFixed, band, rng } = input;
  const pickNoise = input.pickNoise ?? START_SELECTION.pickNoise;
  const fixed = input.fixed ?? [];
  if (count <= 0) return { ok: true, sites: [], weakestScore: Infinity };

  const distance = (a: HexCoord, b: HexCoord): number =>
    map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);

  const ranked = input.candidates
    .filter(candidate => fixed.every(anchor => distance(candidate.coord, anchor) >= minFromFixed))
    .map(candidate => ({ candidate, noise: rng() }))
    .sort((a, b) => b.candidate.score - a.candidate.score || a.noise - b.noise)
    .map(entry => entry.candidate);

  if (ranked.length === 0) return { ok: false, maximumPlaced: 0 };
  // The strongest sites first (bounded work); only when they cannot hold every civilization does the search
  // widen to every floor-passing site, so a cluster of strong sites never turns a placeable map into a failure.
  const capped = run(ranked.slice(0, START_SELECTION.candidateCap));
  if (capped.ok || ranked.length <= START_SELECTION.candidateCap) return capped;
  return run(ranked);

  function run(pool: ScoredSite[]): SiteSelectionResult {

  const solutions: Array<{ sites: ScoredSite[]; weakest: number; strongest: number; total: number; key: string }> = [];
  let maximumPlaced = 0;
  for (let pass = 0; pass < START_SELECTION.passes; pass++) {
    const first = pool[Math.floor(rng() ** 2 * Math.min(START_SELECTION.firstPickPool, pool.length))];
    const chosen: ScoredSite[] = [first];
    while (chosen.length < count) {
      let best: ScoredSite | null = null;
      let bestValue = -Infinity;
      for (const candidate of pool) {
        if (chosen.some(site => distance(site.coord, candidate.coord) < minSeparation)) continue;
        const value = candidate.score + pickNoise * rng();
        if (value > bestValue) {
          bestValue = value;
          best = candidate;
        }
      }
      if (!best) break;
      chosen.push(best);
    }
    maximumPlaced = Math.max(maximumPlaced, chosen.length);
    if (chosen.length === count) {
      const key = chosen.map(site => hexKey(site.coord)).sort().join('|');
      if (!solutions.some(solution => solution.key === key)) {
        solutions.push({
          sites: chosen,
          weakest: Math.min(...chosen.map(site => site.score)),
          strongest: Math.max(...chosen.map(site => site.score)),
          total: chosen.reduce((sum, site) => sum + site.score, 0),
          key,
        });
      }
    }
  }

  if (solutions.length === 0) return { ok: false, maximumPlaced };
  const bestWeakest = Math.max(...solutions.map(solution => solution.weakest));
  // An unbounded band (Wild) admits every layout; `0 * Infinity` would be NaN, so it is not computed.
  const threshold = Number.isFinite(band) ? bestWeakest - Math.abs(bestWeakest) * band : -Infinity;
  const qualifying = solutions
    .filter(solution => solution.weakest >= threshold)
    .sort((a, b) => b.weakest - a.weakest || b.total - a.total || (a.key < b.key ? -1 : 1));
  const drawFrom = input.preferEven
    ? [...qualifying]
      .sort((a, b) => (a.strongest - a.weakest) - (b.strongest - b.weakest) || (a.key < b.key ? -1 : 1))
      .slice(0, Math.max(1, Math.ceil(qualifying.length * START_SELECTION.evenShare)))
    : qualifying;
  const picked = drawFrom[Math.floor(rng() * drawFrom.length)];
  return { ok: true, sites: picked.sites, weakestScore: picked.weakest };
  }
}
