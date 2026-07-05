import type {
  CivDefinition,
  HexCoord,
  MapScript,
  StartPlacementMode,
} from '@/core/types';
import {
  getGeographicStartAnchor,
  getStartPositionDistance,
  type GeographicMapScript,
} from '@/systems/map-generator';

export interface AIRosterSelectionInput {
  definitions: readonly CivDefinition[];
  humanCivilizationTypeIds: readonly string[];
  count: number;
  mapScript: MapScript;
  mapSize: 'small' | 'medium' | 'large';
  placementMode: StartPlacementMode;
  seed: string;
}

export interface AIRosterSelection {
  civilizationTypeIds: string[];
  minimumHistoricalDistance: number | null;
  fallbackCivilizationTypeIds: string[];
}

const MAP_WIDTHS = { small: 30, medium: 50, large: 80 } as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isGeographic(script: MapScript): script is GeographicMapScript {
  return script === 'earth' || script === 'old-world' || script === 'new-world';
}

function virtualFallback(
  civilizationTypeId: string,
  input: AIRosterSelectionInput,
): HexCoord {
  const width = MAP_WIDTHS[input.mapSize];
  const hash = stableHash(`${input.seed}:fallback:${civilizationTypeId}`);
  return {
    q: hash % width,
    r: Math.floor(hash / width) % width,
  };
}

function locationFor(
  civilizationTypeId: string,
  input: AIRosterSelectionInput,
): { coord: HexCoord; fallback: boolean } {
  const anchor = isGeographic(input.mapScript)
    ? getGeographicStartAnchor(input.mapScript, input.mapSize, civilizationTypeId)
    : null;
  return anchor
    ? { coord: anchor, fallback: false }
    : { coord: virtualFallback(civilizationTypeId, input), fallback: true };
}

function distance(
  a: HexCoord,
  b: HexCoord,
  input: AIRosterSelectionInput,
): number {
  return getStartPositionDistance({
    width: MAP_WIDTHS[input.mapSize],
    wrapsHorizontally: input.mapScript === 'earth' || !isGeographic(input.mapScript),
  }, a, b);
}

export function selectAIRoster(input: AIRosterSelectionInput): AIRosterSelection {
  const excluded = new Set(input.humanCivilizationTypeIds);
  const available = [...input.definitions]
    .filter(definition => !excluded.has(definition.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const selected: string[] = [];
  const selectedLocations = input.humanCivilizationTypeIds.map(id => locationFor(id, input).coord);
  const requested = Math.max(0, Math.min(input.count, available.length));

  while (selected.length < requested) {
    const next = available
      .filter(definition => !selected.includes(definition.id))
      .map(definition => {
        const location = locationFor(definition.id, input).coord;
        const distances = selectedLocations.map(existing => distance(location, existing, input));
        return {
          id: definition.id,
          location,
          minimum: distances.length > 0 ? Math.min(...distances) : Infinity,
          total: distances.reduce((sum, value) => sum + value, 0),
          tie: stableHash(`${input.seed}:roster:${definition.id}`),
        };
      })
      .sort((a, b) =>
        b.minimum - a.minimum
        || b.total - a.total
        || a.tie - b.tie
        || a.id.localeCompare(b.id),
      )[0];
    if (!next) break;
    selected.push(next.id);
    selectedLocations.push(next.location);
  }

  let minimumHistoricalDistance: number | null = null;
  if (selectedLocations.length > 1) {
    minimumHistoricalDistance = Infinity;
    for (let i = 0; i < selectedLocations.length; i++) {
      for (let j = i + 1; j < selectedLocations.length; j++) {
        minimumHistoricalDistance = Math.min(
          minimumHistoricalDistance,
          distance(selectedLocations[i], selectedLocations[j], input),
        );
      }
    }
  }

  return {
    civilizationTypeIds: selected,
    minimumHistoricalDistance,
    fallbackCivilizationTypeIds: selected
      .filter(id => locationFor(id, input).fallback),
  };
}
