import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import {
  getCivSupplySourceCandidates,
  getLandSupplySourceCoverage,
} from '@/systems/supply-sources';
import { getShoreSupplyCapability } from '@/systems/supply-participation';
import { getNavalShoreSupplyAssignments } from '@/systems/supply-naval';

export interface SupplyOverlayTile {
  coord: HexCoord;
  coverage: 'full' | 'stable-unsupported';
}

export interface SupplyOverlaySource {
  kind: 'city' | 'fort' | 'ship';
  coord: HexCoord;
}

export interface SupplyOverlayPresentation {
  tiles: SupplyOverlayTile[];
  sources: SupplyOverlaySource[];
}

/**
 * Viewer-scoped, friendly/allied-territory-only supply overlay data (contract
 * §12). Every returned tile/source is currently `'visible'` to `viewerId`'s
 * own `VisibilityMap` — never rendered from remembered/fogged state, and
 * never computed for any civ other than `viewerId` (design spec §8 Safeguard
 * for MR2: this and `getPrimarySupplySource` read ground-truth
 * `state.map.tiles` directly, so a call with an opponent's civId would leak
 * undiscovered infrastructure). `getCivSupplySourceCandidates` is computed
 * once, not per tile — the exact perf bug MR1's post-implementation review
 * fixed in the backend resolver.
 *
 * Naval shore supply assigns Full Supply directly to specific *units*
 * (closest-ship-wins, capacity-limited), not to a tile-radius area the way
 * Fort/Citadel/City coverage works — so it's folded in as a per-unit tile
 * override below, including tiles the viewer doesn't own (a landing force on
 * a foreign/unclaimed shore is exactly what shore supply exists for).
 */
export function getSupplyOverlayPresentationForViewer(
  state: GameState,
  viewerId: string,
): SupplyOverlayPresentation {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return { tiles: [], sources: [] };

  const candidates = getCivSupplySourceCandidates(state, viewerId);
  const shipSources: SupplyOverlaySource[] = Object.values(state.units)
    .filter(unit => unit.owner === viewerId && getShoreSupplyCapability(unit.type) !== null)
    .map(unit => ({ kind: 'ship' as const, coord: unit.position }));
  const sources: SupplyOverlaySource[] = [
    ...candidates.cities.map(city => ({ kind: 'city' as const, coord: city.position })),
    ...candidates.fortCoords.map(coord => ({ kind: 'fort' as const, coord })),
    ...shipSources,
  ].filter(source => getVisibility(visibility, source.coord) === 'visible');

  const tiles: SupplyOverlayTile[] = [];
  const tileByKey = new Map<string, SupplyOverlayTile>();
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.owner !== viewerId) continue;
    if (getVisibility(visibility, tile.coord) !== 'visible') continue;
    const covered = getLandSupplySourceCoverage(state, viewerId, tile.coord, candidates);
    const entry: SupplyOverlayTile = { coord: tile.coord, coverage: covered ? 'full' : 'stable-unsupported' };
    tiles.push(entry);
    tileByKey.set(hexKey(tile.coord), entry);
  }

  for (const unitId of getNavalShoreSupplyAssignments(state, viewerId)) {
    const unit = state.units[unitId];
    if (!unit || unit.owner !== viewerId) continue;
    const key = hexKey(unit.position);
    const existing = tileByKey.get(key);
    if (existing) {
      existing.coverage = 'full';
    } else {
      const entry: SupplyOverlayTile = { coord: unit.position, coverage: 'full' };
      tiles.push(entry);
      tileByKey.set(key, entry);
    }
  }

  return { tiles, sources };
}
