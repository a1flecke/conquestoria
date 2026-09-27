/**
 * #998 — found via the new movement preview⇒execute parity harness: `getMovementRangeDetails`'
 * BFS treats a blocking map entity (foreign city / barbarian camp) as impassable and correctly
 * routes around it, but `findPath`'s A* (used by `resolveUnitMoveIntent` — #1025) has no
 * awareness of blocking entities at all, so it can pick a geometrically-shorter path THROUGH
 * one. `validateUnitMove` then rejects the whole move because that chosen path crosses a
 * blocked tile — even when the BFS already found a walkable detour to the exact same
 * destination within the mover's movement points. A tile the range highlight shows as reachable
 * could be un-executable purely because of which path the pathfinder happened to pick.
 *
 * `unit-pathfinding.ts` must not import `unit-movement-legality.ts` (architecture boundary —
 * pathfinding sits below legality in the movement-subsystem layering), so the blocked set is
 * passed in as plain data (`blockedHexKeys: ReadonlySet<string>`) by the one caller allowed to
 * know about both: `unit-movement-validation.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { GameMap, HexTile } from '@/core/types';
import { findPath } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

function buildMap(specs: Record<string, HexTile['terrain']>): GameMap {
  const tiles: GameMap['tiles'] = {};
  let maxQ = 0;
  let maxR = 0;
  for (const [key, terrain] of Object.entries(specs)) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    maxQ = Math.max(maxQ, q);
    maxR = Math.max(maxR, r);
    tiles[key] = {
      coord: { q, r }, terrain, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  return { width: maxQ + 1, height: maxR + 1, wrapsHorizontally: false, tiles, rivers: [] };
}

/**
 * A 4x3 grassland strip. The direct route from (0,1) to (3,1) runs straight through (1,1) and
 * (2,1); a detour exists via row 0 or row 2 at one extra step of cost.
 */
function stripMap(): GameMap {
  const spec: Record<string, HexTile['terrain']> = {};
  for (let q = 0; q <= 3; q++) {
    for (let r = 0; r <= 2; r++) {
      spec[hexKey({ q, r })] = 'grassland';
    }
  }
  return buildMap(spec);
}

describe('#998 findPath and blocking map entities', () => {
  it('routes around a blocked hex rather than through it, when given blockedHexKeys', () => {
    const map = stripMap();
    const blocked = new Set([hexKey({ q: 1, r: 1 }), hexKey({ q: 2, r: 1 })]);

    const path = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { blockedHexKeys: blocked });

    expect(path).not.toBeNull();
    for (const coord of path!) {
      expect(blocked.has(hexKey(coord))).toBe(false);
    }
    // Sanity: the detour is genuine, not a lucky coincidence — the unobstructed distance is 3
    // steps and this path must be longer because it goes around.
    expect(path!.length).toBeGreaterThan(4);
  });

  it('still reaches the destination directly when blockedHexKeys is omitted (unchanged default for existing callers)', () => {
    const map = stripMap();

    const path = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land');

    expect(path).not.toBeNull();
    expect(path).toHaveLength(4);
  });

  it('can still reach a destination that is itself in blockedHexKeys (the caller already verified the destination is legal)', () => {
    const map = stripMap();
    const blocked = new Set([hexKey({ q: 3, r: 1 })]);

    const path = findPath({ q: 0, r: 1 }, { q: 3, r: 1 }, map, 'land', { blockedHexKeys: blocked });

    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ q: 3, r: 1 });
  });
});
