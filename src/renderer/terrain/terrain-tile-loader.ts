// src/renderer/terrain/terrain-tile-loader.ts
import type { TerrainType } from '@/core/types';
import { TERRAIN_TILES } from './terrain-tiles';

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

// Cache: "terrain:variant" -> HTMLImageElement
const cache = new Map<string, HTMLImageElement>();

export async function preloadTerrainTiles(): Promise<void> {
  const entries = Object.entries(TERRAIN_TILES) as [TerrainType, [string, string, string, string]][];
  await Promise.all(
    entries.flatMap(([terrain, variants]) =>
      variants.map((svg, i) =>
        svgToImage(svg).then(img => cache.set(`${terrain}:${i}`, img))
      )
    )
  );
}

export function getTerrainTileImage(terrain: TerrainType, q: number, r: number): HTMLImageElement | null {
  const idx = Math.abs(q * 7 + r * 13) % 4;
  return cache.get(`${terrain}:${idx}`) ?? null;
}
