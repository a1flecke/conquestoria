import type { GeographicMapScript } from './geo-map-data';
import { GEO_START_CAPACITY } from './geo-start-capacity-data';

/** Player limit per map size; mirrors `MAP_DIMENSIONS` without importing the game-creation module into the UI leaf. */
const MAX_PLAYERS: Record<'small' | 'medium' | 'large', number> = { small: 3, medium: 5, large: 8 };

/** Structural parameter types keep this UI-facing leaf off the core type barrel. */
const isGeographic = (script: string): script is GeographicMapScript =>
  script === 'earth' || script === 'old-world' || script === 'new-world';

/** Separated, livable major starts a real-world map holds in Anywhere (balanced) placement. */
export function getGeographicStartCapacity(script: GeographicMapScript, size: 'small' | 'medium' | 'large'): number {
  return GEO_START_CAPACITY[script][size];
}

/**
 * The most civilizations (human and AI) the setup screens may offer. Only real-world maps in Anywhere placement are
 * capped, at measured capacity; generated maps retry another map instead, and True Start keeps its homelands.
 */
export function getMaxCivilizationsForSetup(
  script: string,
  size: 'small' | 'medium' | 'large',
  mode: 'balanced' | 'historical',
): number {
  const limit = MAX_PLAYERS[size];
  if (!isGeographic(script) || mode !== 'balanced') return limit;
  return Math.min(limit, getGeographicStartCapacity(script, size));
}
