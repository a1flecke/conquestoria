/**
 * Visibility refresh (#1243), split out of `selection-controller.ts`.
 *
 * `refreshCurrentPlayerVisibility` recomputes the current player's fog, fires at
 * most one resource-discovered advisor tip per update, syncs first-contact
 * discovery, and rescans beast/submarine sightings. It touches selection only
 * through `deps.currentCiv`/`session`, so it is a self-contained use-case slice.
 *
 * No behaviour change: same commits, same events, same copy.
 */
import { getVisibility } from '@/systems/fog-of-war';
import { parseHexKey } from '@/systems/hex-utils';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { fireResourceDiscoveredTip } from '@/ui/advisor-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import type { SelectionCommonDeps } from './selection-shared';

export function createSelectionVisibilitySlice(deps: SelectionCommonDeps): {
  refreshCurrentPlayerVisibility(): void;
} {
  function refreshCurrentPlayerVisibility(): void {
    if (!deps.currentCiv()?.visibility) return;

    // Snapshot unexplored tile keys before the update so we can detect fog-lift transitions
    const currentVisibility = deps.currentCiv()!.visibility!;
    const prevUnexplored = new Set(
      Object.keys(currentVisibility.tiles).filter(k => getVisibility(currentVisibility, parseHexKey(k)) === 'unexplored'),
    );

    deps.session.commit(updateAndRefreshVisibility(deps.session.getState(), deps.session.getState().currentPlayer));

    // Fire at most one resource-discovered tip per visibility update to avoid
    // flooding the player when a scout reveals several resource tiles at once.
    const updatedVisibility = deps.currentCiv()?.visibility;
    for (const key of prevUnexplored) {
      if ((updatedVisibility ? getVisibility(updatedVisibility, parseHexKey(key)) : 'unexplored') !== 'unexplored') {
        const tile = deps.session.getState().map.tiles[key];
        if (tile?.resource) {
          const fired = fireResourceDiscoveredTip(tile.resource, deps.session.getState(), deps.bus);
          if (fired) break; // one tip per move is enough
        }
      }
    }

    for (const contact of syncCivilizationContactsFromVisibility(deps.session.getState(), deps.session.getState().currentPlayer)) {
      deps.bus.emit('civilization:first-contact', contact);
    }

    deps.scanBeastSightings();
    deps.scanSubmarineSightings();
  }

  return { refreshCurrentPlayerVisibility };
}
