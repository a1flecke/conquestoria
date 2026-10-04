// src/systems/barbarian-camp-placement.ts
// #1248: where a barbarian camp may stand — a pure placement over the map, the existing cities/camps and a
// numeric seed. Game creation and the crisis-driven hunt both place camps; neither needs the barbarian turn
// (combat selection, quest transitions, pressure). Moved verbatim from barbarian-system.ts, including the
// local Lehmer `lcg` (multiplier 48271, NOT seededLcg's different recurrence — swapping them would move every
// camp), which barbarian-system.ts still draws from for its own turn.
import type { BarbarianCamp, GameMap, HexCoord, IdCounters } from '@/core/types';
import { hexKey, mapDistance } from './hex-utils';

// Seeded LCG — avoids Math.random() per project rules
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
  seed: number,
  counters: IdCounters,
  // Mid-game callers (a live crisis-driven hunt) must exclude tiles a unit already
  // occupies -- a camp landing under an existing unit trips assertNoIllegalBlockingOccupancy
  // exactly like the reverse (a unit spawning onto an existing camp). Initial game-creation
  // callers pass no `state` and rely on the >=6-distance-from-city filter below, which
  // already excludes every starting unit's tile.
  occupiedHexKeys?: ReadonlySet<string>,
): BarbarianCamp | null {
  const rng = lcg(seed);
  const existingPositions = new Set(existingCamps.map(c => hexKey(c.position)));

  const candidates = Object.values(map.tiles).filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    if (existingPositions.has(hexKey(tile.coord))) return false;
    if (occupiedHexKeys?.has(hexKey(tile.coord))) return false;

    // Must be far from cities
    for (const cityPos of cityPositions) {
      if (mapDistance(map, tile.coord, cityPos) < 6) return false;
    }

    // Must be far from other camps
    for (const camp of existingCamps) {
      if (mapDistance(map, tile.coord, camp.position) < 4) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(rng() * candidates.length)];

  return {
    id: `camp-${counters.nextCampId++}`,
    position: { ...chosen.coord },
    strength: 5 + Math.floor(rng() * 5),
    spawnCooldown: 5,
  };
}
