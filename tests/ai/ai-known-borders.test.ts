/**
 * #870 — the AI's "does my territory visibly touch theirs?" signal uses only what it has
 * earned: a foreign tile counts only while it is currently VISIBLE to that civ.
 */
import { describe, it, expect } from 'vitest';
import type { GameMap, GameState } from '@/core/types';
import { getKnownSharedBorderOwners } from '@/ai/ai-known-borders';
import { hexKey } from '@/systems/hex-utils';

type Vis = 'visible' | 'fog' | 'unexplored';

/** Row r=1: q0-2 owned by `me`, q3-5 owned by `rival`, q6-7 owned by `mc-x`, q8 unowned. */
function world(vis: Record<string, Vis> = {}): GameState {
  const tiles: GameMap['tiles'] = {};
  const owners = ['me', 'me', 'me', 'rival', 'rival', 'rival', 'mc-x', 'mc-x', null];
  owners.forEach((owner, q) => {
    tiles[hexKey({ q, r: 1 })] = {
      coord: { q, r: 1 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  });
  const map: GameMap = { width: 9, height: 3, wrapsHorizontally: false, tiles, rivers: [] };
  const visibility = {
    tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, (vis[key] ?? 'visible') as Vis])),
  };
  return {
    map,
    civilizations: { me: { id: 'me', visibility } , rival: { id: 'rival' }, 'mc-x': { id: 'mc-x' } },
  } as unknown as GameState;
}

describe('getKnownSharedBorderOwners', () => {
  it('reports a major civ whose tile touches mine and is visible', () => {
    expect([...getKnownSharedBorderOwners(world(), 'me')]).toEqual(['rival']);
  });

  it('does not report a border tile that is only remembered (fog) or never seen (unexplored)', () => {
    expect(getKnownSharedBorderOwners(world({ '3,1': 'fog' }), 'me').size).toBe(0);
    expect(getKnownSharedBorderOwners(world({ '3,1': 'unexplored' }), 'me').size).toBe(0);
  });

  it('is unaffected by ownership on tiles the civ cannot see: an unseen swap changes nothing', () => {
    const seen = getKnownSharedBorderOwners(world({ '3,1': 'unexplored', '4,1': 'unexplored' }), 'me');
    const swapped = world({ '3,1': 'unexplored', '4,1': 'unexplored' });
    swapped.map.tiles['4,1'] = { ...swapped.map.tiles['4,1']!, owner: 'someone-else' };
    expect([...getKnownSharedBorderOwners(swapped, 'me')]).toEqual([...seen]);
  });

  it('ignores city-states and non-adjacent civs, and needs a visibility map at all', () => {
    const w = world();
    // Make the only neighbour a city-state, not a major civ.
    w.map.tiles['3,1'] = { ...w.map.tiles['3,1']!, owner: 'mc-x' };
    expect(getKnownSharedBorderOwners(w, 'me').size).toBe(0);
    const blind = world();
    delete (blind.civilizations.me as { visibility?: unknown }).visibility;
    expect(getKnownSharedBorderOwners(blind, 'me').size).toBe(0);
  });
});
