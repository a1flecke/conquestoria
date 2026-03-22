import type { ResourceYield } from '@/core/types';

export interface AdjacencyRule {
  building: string;
  adjacentTo: string;
  bonus: Partial<ResourceYield>;
}

export const ADJACENCY_RULES: AdjacencyRule[] = [
  // Library bonuses
  { building: 'library', adjacentTo: 'temple', bonus: { science: 2 } },
  { building: 'library', adjacentTo: 'city-center', bonus: { science: 1 } },
  { building: 'library', adjacentTo: 'archive', bonus: { science: 1 } },

  // Marketplace bonuses
  { building: 'marketplace', adjacentTo: 'workshop', bonus: { gold: 1, production: 1 } },
  { building: 'marketplace', adjacentTo: 'city-center', bonus: { gold: 1 } },
  { building: 'marketplace', adjacentTo: 'harbor', bonus: { gold: 2 } },

  // Workshop bonuses
  { building: 'workshop', adjacentTo: 'city-center', bonus: { production: 1 } },
  { building: 'workshop', adjacentTo: 'forge', bonus: { production: 2 } },

  // Granary bonuses
  { building: 'granary', adjacentTo: 'city-center', bonus: { food: 1 } },
  { building: 'granary', adjacentTo: 'herbalist', bonus: { food: 1 } },
  { building: 'granary', adjacentTo: 'aqueduct', bonus: { food: 2 } },

  // Barracks bonuses
  { building: 'barracks', adjacentTo: 'walls', bonus: { production: 1 } },
  { building: 'barracks', adjacentTo: 'stable', bonus: { production: 1 } },

  // Temple bonuses
  { building: 'temple', adjacentTo: 'monument', bonus: { science: 1 } },
  { building: 'temple', adjacentTo: 'shrine', bonus: { science: 1 } },

  // Forge bonuses
  { building: 'forge', adjacentTo: 'quarry-building', bonus: { production: 1 } },

  // Archive bonuses
  { building: 'archive', adjacentTo: 'observatory', bonus: { science: 2 } },

  // Amphitheater bonuses
  { building: 'amphitheater', adjacentTo: 'forum', bonus: { gold: 1, science: 1 } },
];

function getGridNeighbors(row: number, col: number): Array<{ row: number; col: number }> {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];
}

function isSlotUnlocked(row: number, col: number, gridSize: number): boolean {
  const offset = Math.floor((5 - gridSize) / 2);
  return row >= offset && row < 5 - offset && col >= offset && col < 5 - offset;
}

export function calculateAdjacencyBonuses(
  grid: (string | null)[][],
  gridSize: number,
): Record<string, ResourceYield> {
  const bonuses: Record<string, ResourceYield> = {};

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const building = grid[r]?.[c];
      if (!building || !isSlotUnlocked(r, c, gridSize)) continue;

      const bonus: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
      const neighbors = getGridNeighbors(r, c);

      for (const n of neighbors) {
        const neighbor = grid[n.row]?.[n.col];
        if (!neighbor) continue;

        for (const rule of ADJACENCY_RULES) {
          if (rule.building === building && rule.adjacentTo === neighbor) {
            bonus.food += rule.bonus.food ?? 0;
            bonus.production += rule.bonus.production ?? 0;
            bonus.gold += rule.bonus.gold ?? 0;
            bonus.science += rule.bonus.science ?? 0;
          }
        }
      }

      bonuses[`${r},${c}`] = bonus;
    }
  }

  return bonuses;
}

export function getTotalAdjacencyYields(
  grid: (string | null)[][],
  gridSize: number,
): ResourceYield {
  const bonuses = calculateAdjacencyBonuses(grid, gridSize);
  const total: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };
  for (const bonus of Object.values(bonuses)) {
    total.food += bonus.food;
    total.production += bonus.production;
    total.gold += bonus.gold;
    total.science += bonus.science;
  }
  return total;
}

export function findOptimalSlot(
  grid: (string | null)[][],
  gridSize: number,
  buildingId: string,
): { row: number; col: number } | null {
  let bestSlot: { row: number; col: number } | null = null;
  let bestScore = -1;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!isSlotUnlocked(r, c, gridSize)) continue;
      if (grid[r]?.[c] !== null) continue;

      // Score by adjacency bonus this building would get here
      let score = 0;
      const neighbors = getGridNeighbors(r, c);
      for (const n of neighbors) {
        const neighbor = grid[n.row]?.[n.col];
        if (!neighbor) continue;
        for (const rule of ADJACENCY_RULES) {
          if (rule.building === buildingId && rule.adjacentTo === neighbor) {
            score += (rule.bonus.food ?? 0) + (rule.bonus.production ?? 0) +
                     (rule.bonus.gold ?? 0) + (rule.bonus.science ?? 0);
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSlot = { row: r, col: c };
      }
    }
  }

  // If no adjacency-scoring slot, return first empty unlocked slot
  if (bestSlot === null || bestScore === 0) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isSlotUnlocked(r, c, gridSize)) continue;
        if (grid[r]?.[c] === null) {
          return { row: r, col: c };
        }
      }
    }
  }

  return bestSlot;
}
