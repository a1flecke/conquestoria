import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, HexTile } from '@/core/types';
import { migrateLandmassSeamTags } from '@/storage/migrations/steps/landmass-seam-tags';
import { tagLandmassRegions } from '@/systems/landmass-tagger';

function tile(q: number, r: number, terrain: string, regionKey?: string): HexTile {
  return {
    coord: { q, r }, terrain: terrain as HexTile['terrain'], elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    ...(regionKey ? { regionKey } : {}),
  };
}

/** A 10x3 map with an ocean channel at q 4-5, tagged the old seam-blind way: left and right edges are two tags. */
function splitSeamState(wrapsHorizontally = true): GameState {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 3; r++) {
    for (let q = 0; q < 10; q++) {
      const ocean = q >= 4 && q <= 5;
      tiles[`${q},${r}`] = tile(q, r, ocean ? 'ocean' : 'grassland', ocean ? undefined : q < 4 ? 'continent-0' : 'continent-1');
    }
  }
  const map: GameMap = { width: 10, height: 3, tiles, wrapsHorizontally, rivers: [] };
  return {
    turn: 20,
    map,
    civilizations: {
      p1: { lastCombatTurnByLandmass: { 'continent-0': 4, 'continent-1': 9 } },
      p2: { lastCombatTurnByLandmass: { 'continent-1': 2 } },
    },
    pirateFleetCooldownByCivLandmass: { 'p1:continent-0': 30, 'p1:continent-1': 25 },
    resurgentCampCooldownByCivLandmass: { 'p2:continent-1': 40 },
    councilMemory: { entries: [{ subjects: { regionKey: 'continent-1', cityId: 'c1' } }] },
    pirates: { pressure: { suppression: [{ regionKey: '3,1', amount: 8, expiresAfterRound: 22 }] } },
  } as unknown as GameState;
}

describe('schema 41 — landmass seam tags', () => {
  it('gives a seam-crossing landmass one tag and folds its records, keeping the later turn', () => {
    const migrated = migrateLandmassSeamTags(splitSeamState());
    const tag = migrated.map.tiles['0,1'].regionKey!;

    expect(migrated.map.tiles['9,1'].regionKey).toBe(tag);
    expect(migrated.map.tiles['4,1'].regionKey).toBeUndefined();
    expect(migrated.civilizations.p1.lastCombatTurnByLandmass).toEqual({ [tag]: 9 });
    expect(migrated.civilizations.p2.lastCombatTurnByLandmass).toEqual({ [tag]: 2 });
    expect(migrated.pirateFleetCooldownByCivLandmass).toEqual({ [`p1:${tag}`]: 30 });
    expect(migrated.resurgentCampCooldownByCivLandmass).toEqual({ [`p2:${tag}`]: 40 });
    const council = (migrated as unknown as { councilMemory: { entries: Array<{ subjects: { regionKey: string } }> } }).councilMemory;
    expect(council.entries[0].subjects.regionKey).toBe(tag);
  });

  it('leaves a hex-keyed pirate suppression record alone', () => {
    const migrated = migrateLandmassSeamTags(splitSeamState()) as unknown as {
      pirates: { pressure: { suppression: Array<{ regionKey: string }> } };
    };
    expect(migrated.pirates.pressure.suppression[0].regionKey).toBe('3,1');
  });

  it('returns a flat map unchanged', () => {
    const state = splitSeamState(false);
    expect(migrateLandmassSeamTags(state)).toBe(state);
  });

  it('returns an already-correct wrapping map unchanged', () => {
    const state = splitSeamState();
    state.map = { ...state.map, tiles: tagLandmassRegions(state.map) };
    expect(migrateLandmassSeamTags(state)).toBe(state);
  });

  it('is idempotent', () => {
    const once = migrateLandmassSeamTags(splitSeamState());
    expect(migrateLandmassSeamTags(once)).toBe(once);
  });
});
