import type { GameState, MinorCivState, HexCoord, City, Unit } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { createDiplomacyState } from './diplomacy-system';
import { hexDistance, hexKey } from './hex-utils';
import { createUnit } from './unit-system';
import { foundCity } from './city-system';

const PLACEMENT_COUNTS: Record<string, [number, number]> = {
  small: [2, 4],
  medium: [4, 6],
  large: [6, 8],
};

const IMPASSABLE: Set<string> = new Set(['ocean', 'coast', 'mountain']);

export interface PlacementResult {
  minorCivs: Record<string, MinorCivState>;
  cities: Record<string, City>;
  units: Record<string, Unit>;
}

export function placeMinorCivs(
  state: GameState,
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): PlacementResult {
  const [min, max] = PLACEMENT_COUNTS[mapSize] ?? [2, 4];

  // Seeded RNG
  let rngState = hashSeed(seed + '-mc');
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  const count = min + Math.floor(rng() * (max - min + 1));

  // Shuffle definitions
  const shuffled = [...MINOR_CIV_DEFINITIONS].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, count);

  // Get positions to avoid
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);
  const cityPositions = Object.values(state.cities).map(c => c.position);

  // Get passable tiles
  const candidates = Object.values(state.map.tiles)
    .filter(t => !IMPASSABLE.has(t.terrain) && !t.wonder)
    .map(t => t.coord)
    .sort(() => rng() - 0.5);

  const majorCivIds = Object.keys(state.civilizations);
  const placedPositions: HexCoord[] = [];
  const result: PlacementResult = {
    minorCivs: {},
    cities: { ...state.cities },
    units: { ...state.units },
  };

  for (const def of selected) {
    const pos = findValidPosition(
      candidates,
      startPositions,
      cityPositions,
      placedPositions,
    );
    if (!pos) continue;

    placedPositions.push(pos);

    // Create city with archetype buildings
    const city = foundCity(`mc-${def.id}`, pos, state.map);
    city.population = 3;
    const archetypeBuilding = def.archetype === 'militaristic' ? 'barracks'
      : def.archetype === 'mercantile' ? 'marketplace'
      : 'library';
    if (!city.buildings.includes(archetypeBuilding)) {
      city.buildings.push(archetypeBuilding);
    }
    result.cities[city.id] = city;

    // Create garrison unit
    const garrison = createUnit('warrior', `mc-${def.id}`, pos);
    result.units[garrison.id] = garrison;

    // Create minor civ state
    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    result.minorCivs[mcState.id] = mcState;
  }

  return result;
}

function findValidPosition(
  candidates: HexCoord[],
  startPositions: HexCoord[],
  cityPositions: HexCoord[],
  placedPositions: HexCoord[],
): HexCoord | null {
  for (const pos of candidates) {
    if (startPositions.some(s => hexDistance(pos, s) < 8)) continue;
    if (cityPositions.some(c => hexDistance(pos, c) < 6)) continue;
    if (placedPositions.some(p => hexDistance(pos, p) < 10)) continue;
    return pos;
  }
  return null;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
