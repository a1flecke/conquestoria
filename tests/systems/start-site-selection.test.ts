import { describe, expect, it } from 'vitest';
import type { HexCoord } from '@/core/types';
import { createRng } from '@/systems/map-generator';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { START_SELECTION, selectStartSites, type ScoredSite, type SiteSelectionInput } from '@/systems/start-site-selection';

const FLAT = { width: 60, wrapsHorizontally: false };

function input(overrides: Partial<SiteSelectionInput>): SiteSelectionInput {
  return {
    map: FLAT,
    candidates: [],
    count: 2,
    minSeparation: 9,
    minFromFixed: 9,
    band: START_SELECTION.varietyBand,
    rng: createRng('selection-test'),
    ...overrides,
  };
}

const site = (q: number, r: number, score: number): ScoredSite => ({ coord: { q, r }, score });
const setKey = (sites: ScoredSite[]) => sites.map(s => hexKey(s.coord)).sort().join('|');

describe('selectStartSites (design 2026-11-25, B2)', () => {
  it('prefers a strong site over a remote weak one', () => {
    // A strong pair 10 apart, and a weak site 50 away from everything.
    const candidates = [site(5, 5, 30), site(15, 5, 28), site(55, 40, 5)];
    for (let n = 0; n < 20; n++) {
      const result = selectStartSites(input({ candidates, rng: createRng(`prefer-${n}`) }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(setKey(result.sites)).toBe(setKey([candidates[0], candidates[1]]));
      expect(result.weakestScore).toBe(28);
    }
  });

  it('never returns two sites closer than minSeparation, or a site too close to a fixed anchor', () => {
    const candidates: ScoredSite[] = [];
    for (let q = 0; q < 60; q += 3) for (let r = 0; r < 60; r += 3) candidates.push(site(q, r, 10 + ((q + r) % 7)));
    const fixed: HexCoord[] = [{ q: 30, r: 30 }];
    const result = selectStartSites(input({ candidates, count: 6, fixed, minFromFixed: 4, minSeparation: 9 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let i = 0; i < result.sites.length; i++) {
      expect(hexDistance(result.sites[i].coord, fixed[0])).toBeGreaterThanOrEqual(4);
      for (let j = i + 1; j < result.sites.length; j++) {
        expect(hexDistance(result.sites[i].coord, result.sites[j].coord)).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const candidates: ScoredSite[] = [];
    for (let q = 0; q < 60; q += 2) for (let r = 0; r < 60; r += 2) candidates.push(site(q, r, 20));
    const a = selectStartSites(input({ candidates, count: 5, rng: createRng('same') }));
    const b = selectStartSites(input({ candidates, count: 5, rng: createRng('same') }));
    expect(a).toEqual(b);
  });

  it('varies across seeds when many solutions are equally good', () => {
    const candidates: ScoredSite[] = [];
    for (let q = 0; q < 60; q += 2) for (let r = 0; r < 60; r += 2) candidates.push(site(q, r, 20));
    const sets = new Set<string>();
    for (let n = 0; n < 20; n++) {
      const result = selectStartSites(input({ candidates, count: 4, rng: createRng(`vary-${n}`) }));
      if (result.ok) sets.add(setKey(result.sites));
    }
    expect(sets.size).toBeGreaterThanOrEqual(3);
  });

  it('reports how many it could place when spacing is impossible', () => {
    const candidates = [site(0, 0, 10), site(3, 0, 10), site(6, 0, 10)];
    const result = selectStartSites(input({ candidates, count: 3, minSeparation: 9 }));
    expect(result).toEqual({ ok: false, maximumPlaced: 1 });
  });

  it('looks past the strongest-site cap before giving up', () => {
    // 450 strong sites packed into one corner (no two of them 9 apart is the binding case), plus one weaker site far
    // away: the far site is outside the top-400 pool but is the only way to place two civilizations.
    const candidates: ScoredSite[] = [];
    for (let i = 0; i < 450; i++) candidates.push(site(i % 3, Math.floor(i / 3) % 3, 30 + (i % 7)));
    candidates.push(site(50, 50, 5));
    const result = selectStartSites(input({ candidates, count: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sites.map(s => hexKey(s.coord))).toContain('50,50');
  });

  it('measures distance across the seam on a wrapping map', () => {
    const map = { width: 60, wrapsHorizontally: true };
    expect(wrappedHexDistance({ q: 1, r: 5 }, { q: 58, r: 5 }, 60)).toBe(3);
    const result = selectStartSites(input({ map, candidates: [site(1, 5, 10), site(58, 5, 10)], count: 2 }));
    expect(result).toEqual({ ok: false, maximumPlaced: 1 });
  });
});
