// Loader for S6 natural-wonder hex tiles.
// Same pattern as terrain-tile-loader.ts: preload SVGs to HTMLImageElement,
// cache by wonder ID. Falls back gracefully (returns null) for any wonder
// whose tile hasn't been delivered yet — the canvas renderer keeps its
// existing procedural landmark drawing as the fallback.
//
// ID alias table: maps game natural-wonder IDs → S6 tile IDs so sprites
// appear immediately for the closest thematic match.
// Update this table when game wonder IDs change or new tiles arrive.
import { NATURAL_WONDER_TILES } from './wonder-tiles';

/** Maps game wonder IDs → S6 tile keys (best thematic match). */
const WONDER_TILE_ALIAS: Record<string, string> = {
  great_volcano:     'krakatoa',      // volcanic island with active lava vent
  sacred_mountain:   'mount_olympus', // dramatic grey peak with lightning bolt
  singing_sands:     'el_dorado',     // treasure-discovery in exotic terrain
  bioluminescent_bay:'fountain_of_youth', // magical glowing water
  // Direct keys also resolve (wonderId === S6 tile key):
  mount_olympus:     'mount_olympus',
  el_dorado:         'el_dorado',
  fountain_of_youth: 'fountain_of_youth',
  krakatoa:          'krakatoa',
};

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

// Cache: tile key → HTMLImageElement
const cache = new Map<string, HTMLImageElement>();

export async function preloadNaturalWonderTiles(): Promise<void> {
  await Promise.all(
    Object.entries(NATURAL_WONDER_TILES).map(([key, svg]) =>
      svgToImage(svg).then(img => cache.set(key, img)).catch(() => {})
    )
  );
}

/** Returns the cached tile image for a given game wonder ID, or null if none. */
export function getNaturalWonderTileImage(wonderId: string): HTMLImageElement | null {
  const tileKey = WONDER_TILE_ALIAS[wonderId] ?? wonderId;
  return cache.get(tileKey) ?? null;
}
