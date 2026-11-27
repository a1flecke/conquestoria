import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, HexTile, TerrainType } from '@/core/types';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import {
  PREFERENCE_HEXES_PER_POINT,
  assignStartsByPreference,
  describeStartPreferenceFacts,
  scoreStartPreference,
} from '@/systems/start-preferences';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

function tile(coord: HexCoord, terrain: TerrainType, hasRiver = false): HexTile {
  return {
    coord, terrain, elevation: 'lowland', resource: null, improvement: 'none', owner: null,
    improvementTurnsLeft: 0, hasRiver, wonder: null,
  };
}

/** A 40x12 plains map with a few hand-built sites along r = 6. */
function world(paint: (coord: HexCoord) => { terrain?: TerrainType; river?: boolean } = () => ({})): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 12; r++) {
    for (let q = 0; q < 40; q++) {
      const coord = { q, r };
      const paintAt = paint(coord);
      tiles[hexKey(coord)] = tile(coord, paintAt.terrain ?? 'plains', paintAt.river ?? false);
    }
  }
  return { width: 40, height: 12, tiles, wrapsHorizontally: false, rivers: [] };
}

const COASTAL = { q: 5, r: 6 };
const RIVER = { q: 18, r: 6 };
const FROZEN = { q: 30, r: 6 };
const near = (site: HexCoord, range: number) => (coord: HexCoord) =>
  hexesInRange(site, range).some(at => at.q === coord.q && at.r === coord.r);

const map = world(coord => {
  if (coord.q === 3 && coord.r === 6) return { terrain: 'coast' };
  if (coord.q === 18 && coord.r === 6) return { river: true };
  if (near(FROZEN, 2)(coord) && !(coord.q === FROZEN.q && coord.r === FROZEN.r)) return { terrain: 'tundra' };
  return {};
});

describe('start preference facts and scores', () => {
  it('reads what a settler sees: water next door, a river, frozen land within two', () => {
    expect(describeStartPreferenceFacts(map, COASTAL).coastal).toBe(false); // coast is two hexes away
    expect(describeStartPreferenceFacts(map, { q: 4, r: 6 }).coastal).toBe(true);
    expect(describeStartPreferenceFacts(map, RIVER).river).toBe(true);
    expect(describeStartPreferenceFacts(map, { q: 10, r: 6 }).river).toBe(false);
    expect(describeStartPreferenceFacts(map, FROZEN).frozenShare).toBeCloseTo(18 / 19);
  });

  it('a tolerant civilization does not pay the frozen penalty every other civilization pays', () => {
    const facts = describeStartPreferenceFacts(map, FROZEN);
    expect(scoreStartPreference(facts, [])).toBeCloseTo(-18 / 19);
    expect(scoreStartPreference(facts, ['frozen-tolerant'])).toBe(0);
    // Tolerance never makes frozen land attractive in itself.
    expect(scoreStartPreference(facts, ['frozen-tolerant'])).toBeLessThanOrEqual(scoreStartPreference(describeStartPreferenceFacts(map, { q: 10, r: 6 }), ['frozen-tolerant']));
  });

  it('hills and forest scale up to a full point at three tiles', () => {
    const hilly = world(coord => (coord.r === 6 && coord.q >= 9 && coord.q <= 11 ? { terrain: 'hills' } : {}));
    const facts = describeStartPreferenceFacts(hilly, { q: 10, r: 7 });
    expect(facts.hills).toBe(3);
    expect(scoreStartPreference(facts, ['hills'])).toBe(1);
    expect(scoreStartPreference({ ...facts, hills: 1 }, ['hills'])).toBeCloseTo(1 / 3);
  });
});

describe('assignStartsByPreference', () => {
  const sites = [{ q: 10, r: 6 }, { q: 4, r: 6 }];
  const preferences = [[], ['coastal' as const]];

  it('changes nothing at weight 0 or when no civilization has preferences', () => {
    expect(assignStartsByPreference({ map, sites, preferences: [['coastal'], []], weight: 0 })).toEqual([0, 1]);
    expect(assignStartsByPreference({ map, sites, preferences: [[], []], weight: 2 })).toEqual([0, 1]);
  });

  it('civilizations swap when both gain, and one already on suitable land stays', () => {
    // Already on the coast: stays, however strong the style.
    expect(assignStartsByPreference({ map, sites: [...sites].reverse(), preferences: [['coastal'], []], weight: 2 })).toEqual([0, 1]);
    // A river people on the coast and a seafaring people by the river: two points gained for two moves.
    const mutual = [{ q: 4, r: 6 }, RIVER];
    expect(assignStartsByPreference({ map, sites: mutual, preferences: [['river'], ['coastal']], weight: 1.5 })).toEqual([1, 0]);
    expect(assignStartsByPreference({ map, sites: mutual, preferences: [['river'], ['coastal']], weight: 0.5 })).toEqual([0, 1]);
    expect(preferences[1]).toEqual(['coastal']);
  });

  it('a weak style moves nobody for a fit worth less than the move', () => {
    // One coastal point split over two moved civilizations: 1 point gained, 2 moves at 1 / 0.5 each.
    expect(assignStartsByPreference({ map, sites, preferences: [['coastal'], []], weight: 0.5 })).toEqual([0, 1]);
    expect(assignStartsByPreference({ map, sites, preferences: [['coastal'], []], weight: 2 })).toEqual([1, 0]);
  });

  it('with homelands, distance from home and preference are weighed together', () => {
    const anchors = [{ q: 9, r: 6 }, { q: 5, r: 6 }];
    // Civilization 0 is a seafarer homed inland; the coastal start is 5 hexes further from home.
    const extraHexes = 5;
    const tradeoff = (weight: number) => assignStartsByPreference({ map, sites, preferences: [['coastal'], []], weight, anchors });
    expect(tradeoff(1)).toEqual([0, 1]);
    expect(2 * extraHexes / PREFERENCE_HEXES_PER_POINT).toBeGreaterThan(1);
    expect(tradeoff(4)).toEqual([1, 0]);
  });
});

describe('civilization start preference data', () => {
  it('starts with the obvious ones and uses only known tags', () => {
    const byId = Object.fromEntries(CIV_DEFINITIONS.map(def => [def.id, def.startPreferences ?? []]));
    expect(byId.viking).toContain('coastal');
    expect(byId.egypt).toContain('river');
    expect(byId.russia).toContain('frozen-tolerant');
    const known = new Set(['coastal', 'river', 'hills', 'forest', 'frozen-tolerant', 'desert-tolerant']);
    for (const def of CIV_DEFINITIONS) {
      for (const tag of def.startPreferences ?? []) expect(known.has(tag), `${def.id}: ${tag}`).toBe(true);
      expect(new Set(def.startPreferences ?? []).size).toBe((def.startPreferences ?? []).length);
    }
  });
});
