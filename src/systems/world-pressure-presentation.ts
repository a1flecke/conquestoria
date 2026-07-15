import type { GameState, HexCoord, CrisisArchetype } from '@/core/types';
import { getVisibility } from './fog-of-war';
import { getCrisisFlavor, getCrisisDisplayName } from './crisis-flavor-definitions';
import { resolveWorldPressureFlags } from './world-pressure-flags';

export interface WorldPressureCityBadge {
  cityId: string;
  coord: HexCoord;
  archetype: CrisisArchetype;
}

export interface WorldPressureStatusLine {
  civId: string;
  text: string; // e.g. "Suffering: Red Tide outbreak — 3 cities, 4 turns"
}

export interface WorldPressurePresentation {
  cityBadges: WorldPressureCityBadge[];
  statusLinesByCivId: Record<string, WorldPressureStatusLine>;
}

const EMPTY_PRESENTATION: WorldPressurePresentation = { cityBadges: [], statusLinesByCivId: {} };

// Single viewer-safe read path for all AI-pressure UI (spec §Visibility). Every
// panel/renderer surface must go through this — never read state.activeCrises directly.
export function getWorldPressurePresentationForViewer(
  state: GameState,
  viewerCivId: string,
): WorldPressurePresentation {
  const flags = resolveWorldPressureFlags(state.settings);
  if (!flags.aiPressureVisibility) return EMPTY_PRESENTATION;

  const viewer = state.civilizations[viewerCivId];
  if (!viewer) return EMPTY_PRESENTATION;
  const known = new Set(viewer.knownCivilizations ?? []);

  const cityBadges: WorldPressureCityBadge[] = [];
  const statusLinesByCivId: Record<string, WorldPressureStatusLine> = {};

  for (const crisis of Object.values(state.activeCrises ?? {})) {
    const targetCivId = crisis.targetCivId;
    // The viewer's own crises are covered by their existing crisis UI (city panel).
    if (targetCivId === viewerCivId) continue;
    if (!known.has(targetCivId)) continue;

    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) continue;

    const displayName = getCrisisDisplayName(flavor, state.era);
    const cityCount = crisis.cityIds.length;
    const turns = crisis.turnsInStage;
    statusLinesByCivId[targetCivId] = {
      civId: targetCivId,
      text: `Suffering: ${displayName} — ${cityCount} ${cityCount === 1 ? 'city' : 'cities'}, ${turns} ${turns === 1 ? 'turn' : 'turns'}`,
    };

    if (!viewer.visibility) continue;
    for (const cityId of crisis.cityIds) {
      const city = state.cities[cityId];
      if (!city) continue;
      if (getVisibility(viewer.visibility, city.position) !== 'visible') continue;
      cityBadges.push({ cityId, coord: city.position, archetype: crisis.archetype });
    }
  }

  return { cityBadges, statusLinesByCivId };
}
