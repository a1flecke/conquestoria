import type { GameState } from '@/core/types';
import { hasAllianceTreaty } from './diplomacy-system';

export type LandSupplyTerritoryClass = 'friendly' | 'allied' | 'unclaimed' | 'hostile';

/**
 * There is an `open_borders` `TreatyType` in the diplomacy data model
 * (proposable, trackable, has AI/UI support), but nothing in
 * `unit-movement-system.ts` ever consumes it — only `hasAllianceTreaty`
 * gates whether a foreign city blocks movement (`isBlockingCityFor` in
 * `unit-system.ts`). So for land-supply purposes every tile that is not
 * friendly, not allied, and not unclaimed is treated as `'hostile'`,
 * regardless of literal war state or an unconsumed Open Borders treaty (see
 * MR1 design-spec §4 Finding 2 / deferred issue C).
 */
export function classifyLandSupplyTerritory(
  state: Pick<GameState, 'civilizations'>,
  viewerCivId: string,
  tileOwner: string | null,
): LandSupplyTerritoryClass {
  if (tileOwner === null) return 'unclaimed';
  if (tileOwner === viewerCivId) return 'friendly';
  if (hasAllianceTreaty(state as GameState, viewerCivId, tileOwner)) return 'allied';
  return 'hostile';
}
