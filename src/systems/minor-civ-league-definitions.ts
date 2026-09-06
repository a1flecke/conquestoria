import type {
  Building,
  MinorCivLeagueCharter,
  UnitType,
} from '@/core/types';
import type { MinorCivLeaguePreference } from './minor-civ-league-system';

export const MINOR_CIV_LEAGUE_RULES = {
  minWorldTurn: 20,
  admissionGraceTurns: 10,
  minPopulation: 3,
  minBuildings: 1,
  radius: 10,
  minMembers: 2,
  maxMembers: 4,
  maxLeagues: 8,
  peacefulScoreBonus: 12,
  defenseScoreBonus: 25,
  knownCompactGiftBonus: 5,
} as const;

export const MINOR_CIV_LEAGUE_TIMING = {
  explorer: { checkInterval: 6, warningTurns: 3, coolingTurns: 6 },
  standard: { checkInterval: 4, warningTurns: 2, coolingTurns: 4 },
  veteran: { checkInterval: 3, warningTurns: 1, coolingTurns: 3 },
} as const;

export const MINOR_CIV_LEAGUE_NAME_KEYS = [
  'amber', 'willow', 'hearth', 'dawn', 'cedar', 'lantern', 'meadow', 'silver',
  'oak', 'reed', 'copper', 'laurel', 'stone', 'birch', 'star', 'olive',
] as const;

export const MINOR_CIV_LEAGUE_CHARTERS: Record<MinorCivLeagueCharter, {
  label: string;
  purpose: string;
  preferredYieldKeys: readonly ('food' | 'production' | 'gold' | 'science')[];
  preferredBuildingIds: readonly string[];
}> = {
  commerce: {
    label: 'Commerce', purpose: 'Trade and local prosperity',
    preferredYieldKeys: ['gold'], preferredBuildingIds: ['marketplace'],
  },
  learning: {
    label: 'Learning', purpose: 'Knowledge and civic institutions',
    preferredYieldKeys: ['science'], preferredBuildingIds: ['library', 'temple', 'monument'],
  },
  security: {
    label: 'Security', purpose: 'Local safety and preparedness',
    preferredYieldKeys: [], preferredBuildingIds: ['walls', 'barracks'],
  },
  cooperation: {
    label: 'Cooperation', purpose: 'Shared local development',
    preferredYieldKeys: ['food', 'production'], preferredBuildingIds: [],
  },
};

/**
 * Returns a score adjustment only for a candidate that has already passed its
 * ordinary legality and baseline score gates. The caller owns those gates.
 */
export function getMinorCivLeagueScoreBonus(
  preference: MinorCivLeaguePreference,
  candidate: { kind: 'building'; building: Pick<Building, 'id' | 'yields'> }
    | { kind: 'unit'; unitType: UnitType },
): number {
  if (preference.kind === 'none' || preference.kind === 'defense' || candidate.kind !== 'building') {
    return 0;
  }
  const charter = MINOR_CIV_LEAGUE_CHARTERS[preference.kind];
  const matchesYield = charter.preferredYieldKeys.some(yieldKey => candidate.building.yields[yieldKey] > 0);
  const matchesId = charter.preferredBuildingIds.includes(candidate.building.id);
  return matchesYield || matchesId ? MINOR_CIV_LEAGUE_RULES.peacefulScoreBonus : 0;
}
