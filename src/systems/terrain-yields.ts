/**
 * Base yield of each terrain, before improvements, rivers, wonders or technology. A leaf with no imports, so map
 * generation and start placement can read it without pulling in the tile-yield system (which imports them back).
 * `tile-yield.ts` re-exports it; that is still where a tile's real yield is computed.
 */
export interface TerrainBaseYield {
  food: number;
  production: number;
  gold: number;
  science: number;
}

export const TERRAIN_YIELDS: Record<string, TerrainBaseYield> = {
  grassland:  { food: 2, production: 0, gold: 0, science: 0 },
  plains:     { food: 1, production: 1, gold: 0, science: 0 },
  desert:     { food: 0, production: 0, gold: 0, science: 0 },
  tundra:     { food: 1, production: 0, gold: 0, science: 0 },
  snow:       { food: 0, production: 0, gold: 0, science: 0 },
  forest:     { food: 1, production: 1, gold: 0, science: 0 },
  hills:      { food: 0, production: 2, gold: 0, science: 0 },
  mountain:   { food: 0, production: 1, gold: 0, science: 0 },
  ocean:      { food: 1, production: 0, gold: 0, science: 0 },
  coast:      { food: 2, production: 0, gold: 1, science: 0 },
  jungle:     { food: 2, production: 0, gold: 0, science: 0 },
  swamp:      { food: 1, production: 0, gold: 0, science: 0 },
  volcanic:   { food: 0, production: 0, gold: 0, science: 0 },
};
