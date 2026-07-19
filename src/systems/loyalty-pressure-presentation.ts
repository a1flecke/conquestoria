import type { GameState, HexCoord } from '@/core/types';
import { isLoyaltyTrackEligible } from '@/systems/religion-loyalty-system';

export interface LoyaltyPressureBadge {
  cityId: string;
  coord: HexCoord;
}

export interface LoyaltyPressurePresentation {
  cityBadges: LoyaltyPressureBadge[];
}

const EMPTY: LoyaltyPressurePresentation = { cityBadges: [] };

// #593 MR6: "both sides see a map badge" -- the pressuring civ (religion owner) and the
// pressured city's current owner (if it's a real civ the viewer IS -- a minor civ owner
// has no viewer of its own). Only fires once loyaltyProgress is actively tracked (not
// merely eligible), so the badge means "a flip is actively counting down", matching the
// city-panel row's same gate.
//
// Inline review fix: re-verify isLoyaltyTrackEligible against the LIVE state rather than
// trusting the stored loyaltyProgress field alone. A city can change owner mid-turn via
// unrelated combat (conquest, breakaway reabsorption) before processLoyaltyTurn's own
// next-turn self-heal runs -- without this check, a human player who just captured a
// city with stale loyaltyProgress would briefly see a misleading "under loyalty
// pressure" badge on their own now-immune city for the rest of that turn.
export function getLoyaltyPressurePresentationForViewer(
  state: GameState,
  viewerCivId: string,
): LoyaltyPressurePresentation {
  const cityBadges: LoyaltyPressureBadge[] = [];
  for (const [cityId, faith] of Object.entries(state.cityFaith ?? {})) {
    const progress = faith.loyaltyProgress;
    if (!progress) continue;
    const city = state.cities[cityId];
    if (!city) continue;
    const live = isLoyaltyTrackEligible(state, cityId);
    if (!live || live.pressuringCivId !== progress.toCivId || progress.sinceOwnerId !== city.owner) continue;
    const isPressuringViewer = progress.toCivId === viewerCivId;
    const isPressuredViewer = city.owner === viewerCivId;
    if (!isPressuringViewer && !isPressuredViewer) continue;
    cityBadges.push({ cityId, coord: city.position });
  }
  return cityBadges.length > 0 ? { cityBadges } : EMPTY;
}
