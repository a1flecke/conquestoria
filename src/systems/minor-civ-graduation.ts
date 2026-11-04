import type { GameState, MinorCivState } from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { isMajorCivOwner } from '@/core/owner-kind';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { evaluateMinorCivEconomyPosture, getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { getMinorCivLeagueForMember } from '@/systems/minor-civ-league-system';
import {
  MINOR_CIV_GRADUATION_TUNING,
  type MinorCivGraduationEligibility,
  type MinorCivGraduationIneligibleReason,
  type MinorCivGraduationSignals,
} from '@/systems/minor-civ-graduation-rules';

/**
 * City-state graduation (#497), read side. Everything here is a pure function of `GameState`: no
 * writes, no events, no randomness. Nothing in `src/` calls it yet — the conversion that would act
 * on a decision lands in a later PR of the arc, and the architecture rule
 * `minor-civ-graduation-is-test-only-until-497-pr3` keeps it that way until then.
 */

function ineligible(minorCivId: string, reason: MinorCivGraduationIneligibleReason): MinorCivGraduationEligibility {
  return { eligible: false, minorCivId, reason };
}

/** The founding turn as a survival age, or null when it is absent, corrupt or in the future. */
function readAgeTurns(state: GameState, minorCiv: MinorCivState): number | null {
  const founded: unknown = minorCiv.foundedTurn;
  if (typeof founded !== 'number' || !Number.isInteger(founded) || founded < 0 || founded > state.turn) return null;
  return state.turn - founded;
}

function isInActiveCoalition(state: GameState, minorCivId: string): boolean {
  return Object.values(state.minorCivCoalitions ?? {}).some(coalition => (
    coalition.memberIds.includes(minorCivId)
    && (coalition.status === 'forming' || coalition.status === 'active')
  ));
}

/** Distinct major civilizations on the far end of a route that ends in this city-state's city. */
function countTradePartners(state: GameState, minorCiv: MinorCivState): number {
  const partners = new Set<string>();
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const otherCityId = route.fromCityId === minorCiv.cityId ? route.toCityId
      : route.toCityId === minorCiv.cityId ? route.fromCityId
        : null;
    if (otherCityId === null) continue;
    const partner = state.cities[otherCityId]?.owner;
    if (partner && isMajorCivOwner(partner) && state.civilizations[partner]) partners.add(partner);
  }
  return partners.size;
}

function countAlliedPatrons(minorCiv: MinorCivState): number {
  return Object.entries(minorCiv.chainStatusByCiv ?? {})
    .filter(([civId, status]) => isMajorCivOwner(civId) && status.status === 'allied')
    .length;
}

/**
 * Whether one city-state is a graduation candidate right now, judged only on recorded state. The
 * first failing gate is the reason returned; the gates run cheapest and most structural first, so
 * a malformed record is reported as malformed rather than as whatever it would have scored.
 * Whether the world as a whole is ready (cadence, world age, caps) is the planner's question.
 */
export function evaluateMinorCivGraduationEligibility(
  state: GameState,
  minorCivId: string,
): MinorCivGraduationEligibility {
  const minorCiv = state.minorCivs?.[minorCivId];
  if (!minorCiv) return ineligible(minorCivId, 'missing-minor-civ');
  if (minorCiv.isDestroyed) return ineligible(minorCivId, 'destroyed');
  if (!MINOR_CIV_DEFINITIONS.some(definition => definition.id === minorCiv.definitionId)) {
    return ineligible(minorCivId, 'unknown-definition');
  }
  const city = state.cities?.[minorCiv.cityId];
  if (!city) return ineligible(minorCivId, 'city-missing');
  if (city.owner !== minorCivId) return ineligible(minorCivId, 'city-not-owned');

  const tuning = MINOR_CIV_GRADUATION_TUNING[resolveOpponentChallenge(state)];
  const ageTurns = readAgeTurns(state, minorCiv);
  if (ageTurns === null) return ineligible(minorCivId, 'age-unknown');
  if (ageTurns < tuning.minAgeTurns) return ineligible(minorCivId, 'too-young');

  const populationCeiling = getMinorCivPopulationCeiling(state, minorCivId);
  const population = city.population;
  if (!Number.isFinite(population) || population < populationCeiling - tuning.populationHeadroom) {
    return ineligible(minorCivId, 'population-below-threshold');
  }
  const buildingCount = Array.isArray(city.buildings) ? city.buildings.length : 0;
  if (buildingCount < tuning.minBuildings) return ineligible(minorCivId, 'too-few-buildings');

  if ((minorCiv.diplomacy?.atWarWith?.length ?? 0) > 0) return ineligible(minorCivId, 'at-war');
  // Named before the generic threat below, because membership already makes the posture mobilizing.
  if (isInActiveCoalition(state, minorCivId)) return ineligible(minorCivId, 'coalition-member');
  const posture = evaluateMinorCivEconomyPosture(state, minorCivId);
  if (posture === 'mobilizing' || posture === 'recovering') return ineligible(minorCivId, 'under-threat');
  const league = getMinorCivLeagueForMember(state, minorCivId);
  if (league?.readiness.kind === 'concern') return ineligible(minorCivId, 'league-mobilized');

  const signals: MinorCivGraduationSignals = {
    ageTurns,
    population,
    populationCeiling,
    buildingCount,
    tradePartnerCount: countTradePartners(state, minorCiv),
    alliedPatronCount: countAlliedPatrons(minorCiv),
    leagueMember: league !== null,
  };
  return { eligible: true, minorCivId, signals };
}
