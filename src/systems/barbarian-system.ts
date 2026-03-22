import type { BarbarianCamp, GameMap, HexCoord, Unit } from '@/core/types';
import { hexKey, hexDistance } from './hex-utils';

let nextCampId = 1;

export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
): BarbarianCamp | null {
  const existingPositions = new Set(existingCamps.map(c => hexKey(c.position)));

  const candidates = Object.values(map.tiles).filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    if (existingPositions.has(hexKey(tile.coord))) return false;

    // Must be far from cities
    for (const cityPos of cityPositions) {
      if (hexDistance(tile.coord, cityPos) < 6) return false;
    }

    // Must be far from other camps
    for (const camp of existingCamps) {
      if (hexDistance(tile.coord, camp.position) < 4) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  return {
    id: `camp-${nextCampId++}`,
    position: { ...chosen.coord },
    strength: 5 + Math.floor(Math.random() * 5),
    spawnCooldown: 5,
  };
}

export function resetCampId(): void {
  nextCampId = 1;
}

export function destroyCamp(camp: BarbarianCamp): number {
  // Gold reward based on camp strength
  return 15 + camp.strength * 2;
}

export interface BarbarianProcessResult {
  updatedCamps: BarbarianCamp[];
  spawnedUnits: Array<{ campId: string; position: HexCoord }>;
}

export function processBarbarians(
  camps: BarbarianCamp[],
  map: GameMap,
  playerUnits: Unit[],
): BarbarianProcessResult {
  const updatedCamps: BarbarianCamp[] = [];
  const spawnedUnits: Array<{ campId: string; position: HexCoord }> = [];

  for (const camp of camps) {
    const newCooldown = camp.spawnCooldown - 1;

    if (newCooldown <= 0) {
      // Spawn a raider near the camp
      spawnedUnits.push({ campId: camp.id, position: { ...camp.position } });
      updatedCamps.push({
        ...camp,
        spawnCooldown: 4 + Math.floor(Math.random() * 3),
        strength: camp.strength + 1,
      });
    } else {
      updatedCamps.push({ ...camp, spawnCooldown: newCooldown });
    }
  }

  return { updatedCamps, spawnedUnits };
}
