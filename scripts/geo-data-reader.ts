/**
 * Reads the Earth map's bulk tile/river JSON for the developer scan scripts (#1456). The game fetches the same
 * file on demand (src/systems/geo-map-data.ts); these scripts run under tsx and just read it from disk.
 */
import { readFileSync } from 'node:fs';
import type { GeoTile } from '../src/systems/geo-map-loader.js';

type MapSize = 'small' | 'medium' | 'large';
type RiverSegment = { from: { q: number; r: number }; to: { q: number; r: number } };

const earth = JSON.parse(
  readFileSync(new URL('../src/systems/geo-data/earth-map.json', import.meta.url), 'utf8'),
) as { tiles: Record<MapSize, GeoTile[]>; rivers: Record<MapSize, RiverSegment[]> };

export const EARTH_TILES = earth.tiles;
export const EARTH_RIVERS = earth.rivers;
