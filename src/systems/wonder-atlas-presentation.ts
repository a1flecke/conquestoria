import type { GameState, HexCoord, ResourceYield } from '@/core/types';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export type WonderAtlasEntry =
  | NaturalWonderAtlasEntry
  | LegendaryWonderAtlasEntry;

export interface NaturalWonderAtlasEntry {
  kind: 'natural';
  wonderId: string;
  visibility: 'discovered';
  name: string;
  effectSummary: string;
  locationLabel: string;
  coord: HexCoord | null;
  canViewOnMap: boolean;
  visual: WonderVisualDefinition;
}

export interface LegendaryWonderAtlasEntry {
  kind: 'legendary';
  wonderId: string;
  visibility: 'masked';
  name: string;
  maskedLabel: string;
  canViewOnMap: false;
  visual: WonderVisualDefinition;
}

function findWonderCoord(state: GameState, wonderId: string): HexCoord | null {
  const tile = Object.values(state.map.tiles).find(candidate => candidate.wonder === wonderId);
  return tile ? { ...tile.coord } : null;
}

function formatLocation(coord: HexCoord | null): string {
  return coord ? `Q${coord.q}, R${coord.r}` : 'Location unknown';
}

function formatYieldSummary(yields: ResourceYield): string {
  const parts = [
    ['Food', yields.food],
    ['Production', yields.production],
    ['Gold', yields.gold],
    ['Science', yields.science],
  ]
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([label, value]) => `+${value} ${label}`);

  return parts.length > 0 ? `Yields ${parts.join(', ')}` : 'No direct tile yields';
}

function formatEffectSummary(wonderId: string): string {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return 'Unknown wonder effect';

  const yieldSummary = formatYieldSummary(definition.yields);
  switch (definition.effect.type) {
    case 'adjacent_yield_bonus':
      return `${yieldSummary}. Improves adjacent tile yields.`;
    case 'combat_bonus':
      return `${yieldSummary}. Grants a defensive combat bonus.`;
    case 'eruption':
      return `${yieldSummary}. May erupt and damage nearby improvements.`;
    case 'healing':
      return `${yieldSummary}. Heals units on the wonder tile.`;
    case 'vision':
      return `${yieldSummary}. Extends vision nearby.`;
    case 'none':
    default:
      return yieldSummary;
  }
}

function naturalWonderEntry(state: GameState, wonderId: string): NaturalWonderAtlasEntry | null {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return null;

  const coord = findWonderCoord(state, wonderId);
  return {
    kind: 'natural',
    wonderId,
    visibility: 'discovered',
    name: definition.name,
    effectSummary: formatEffectSummary(wonderId),
    locationLabel: formatLocation(coord),
    coord,
    canViewOnMap: coord !== null,
    visual: getWonderVisualDefinition(wonderId),
  };
}

function legendaryWonderEntry(wonderId: string, name: string): LegendaryWonderAtlasEntry {
  const visual = getWonderVisualDefinition(wonderId);
  return {
    kind: 'legendary',
    wonderId,
    visibility: 'masked',
    name,
    maskedLabel: visual.maskedLabel ?? 'Legendary wonder',
    canViewOnMap: false,
    visual,
  };
}

export function getWonderAtlasEntries(state: GameState, viewerId: string): WonderAtlasEntry[] {
  const naturalEntries = Object.entries(state.wonderDiscoverers ?? {})
    .filter(([, discoverers]) => discoverers.includes(viewerId))
    .map(([wonderId]) => naturalWonderEntry(state, wonderId))
    .filter((entry): entry is NaturalWonderAtlasEntry => entry !== null);

  const legendaryEntries = getLegendaryWonderDefinitions().map(definition =>
    legendaryWonderEntry(definition.id, definition.name),
  );

  return [...naturalEntries, ...legendaryEntries];
}
