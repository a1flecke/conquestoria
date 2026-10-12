import { loadStaticSvgImage } from '@/renderer/static-svg-image';
// src/renderer/terrain/terrain-tile-loader.ts
import type { TerrainType } from '@/core/types';
import { TERRAIN_TILES } from './terrain-tiles';
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';


// Cache: "terrain:variant" -> HTMLImageElement
const cache = new Map<string, HTMLImageElement>();

export async function preloadTerrainTiles(): Promise<void> {
  const entries = Object.entries(TERRAIN_TILES) as [TerrainType, [string, string, string, string]][];
  await Promise.all(
    entries.flatMap(([terrain, variants]) =>
      variants.map((svg, i) =>
        loadStaticSvgImage(svg).then(img => { cache.set(`${terrain}:${i}`, img); notifyCanvasAssetReady(); })
      )
    )
  );
}

export function getTerrainTileImage(terrain: TerrainType, q: number, r: number): HTMLImageElement | null {
  const idx = Math.abs(q * 7 + r * 13) % 4;
  return cache.get(`${terrain}:${idx}`) ?? null;
}
