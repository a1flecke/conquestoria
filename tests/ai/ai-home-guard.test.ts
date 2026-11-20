import { describe, it, expect } from 'vitest';
import { planHomeGuardStations } from '@/ai/ai-home-guard';
import type { HomeGuardWorld } from '@/ai/ai-home-guard';

/**
 * #1704 (A2): the home guard is the decision layer that keeps a land combat
 * unit standing in each AI city. All generated maps wrap horizontally, so
 * "nearest free unit" must be measured across the seam.
 */
function makeGuardWorld(wrapsHorizontally: boolean): HomeGuardWorld {
  return {
    map: { width: 20, wrapsHorizontally },
    civilizations: {
      'civ-1': { cities: ['city-unguarded'], units: ['guard-middle', 'guard-seam'] },
    },
    cities: {
      'city-unguarded': { id: 'city-unguarded', owner: 'civ-1', position: { q: 2, r: 5 } },
    },
    units: {
      // Seam-adjacent: raw distance 16 from the city, wrapped distance 4.
      'guard-seam': { type: 'warrior', position: { q: 18, r: 5 } },
      // Actually farther: raw distance 8, wrapped distance 8.
      'guard-middle': { type: 'warrior', position: { q: 10, r: 5 } },
    },
  };
}

describe('planHomeGuardStations (#1704 A2)', () => {
  it('sends the guard nearest across the wrap seam, not the one far around the map', () => {
    const result = planHomeGuardStations(makeGuardWorld(true), 'civ-1', new Set());
    expect(result.orders).toEqual([{ unitId: 'guard-seam', cityId: 'city-unguarded' }]);
  });

  it('on a non-wrapping map the straight-line nearest guard still wins', () => {
    const result = planHomeGuardStations(makeGuardWorld(false), 'civ-1', new Set());
    expect(result.orders).toEqual([{ unitId: 'guard-middle', cityId: 'city-unguarded' }]);
  });

  it('keeps one unit roaming instead of garrisoning the last free guard', () => {
    const world: HomeGuardWorld = {
      map: { width: 20, wrapsHorizontally: true },
      civilizations: {
        'civ-1': { cities: ['city-unguarded'], units: ['only-guard'] },
      },
      cities: {
        'city-unguarded': { id: 'city-unguarded', owner: 'civ-1', position: { q: 2, r: 5 } },
      },
      units: {
        'only-guard': { type: 'warrior', position: { q: 18, r: 5 } },
      },
    };
    const result = planHomeGuardStations(world, 'civ-1', new Set());
    expect(result.orders).toEqual([]);
  });
});
