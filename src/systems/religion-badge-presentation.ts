import type { GameState, HexCoord } from '@/core/types';

export interface ReligionBadgeEntry {
  cityId: string;
  coord: HexCoord;
  isOwnFaith: boolean;
}

export interface ReligionBadgePresentation {
  cityBadges: ReligionBadgeEntry[];
}

const EMPTY: ReligionBadgePresentation = { cityBadges: [] };

// #594 MR7: "religion map badge" -- marks any city with a resolved cityFaith entry
// (it follows SOME religion). isOwnFaith distinguishes "follows my religion" from
// "follows a religion I don't own", so the render pass can style them differently.
// No discovery/visibility gate beyond the existing fog-of-war the map already applies
// to city rendering itself -- a city the viewer can see on the map already reveals its
// population/owner/etc, and faith-following is comparably low-stakes public info,
// consistent with how loyaltyPressure and worldPressureCrisis are also un-gated beyond
// their own explicit pressuring/pressured-party checks.
export function getReligionBadgePresentationForViewer(
  state: GameState,
  viewerCivId: string,
): ReligionBadgePresentation {
  const cityBadges: ReligionBadgeEntry[] = [];
  for (const [cityId, faith] of Object.entries(state.cityFaith ?? {})) {
    const city = state.cities[cityId];
    if (!city) continue;
    const religion = state.religions?.[faith.religionId];
    if (!religion) continue;
    cityBadges.push({ cityId, coord: city.position, isOwnFaith: religion.ownerCivId === viewerCivId });
  }
  return cityBadges.length > 0 ? { cityBadges } : EMPTY;
}
