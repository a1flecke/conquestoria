import type { GameState } from '../core/types';
import type { GovernancePosture } from './governance-types';
import { GOVERNANCE_POLICY_DEFINITIONS } from './governance-policy-definitions';
import { getCapitalCity } from './capital-system';
import { hexDistance } from './hex-utils';

/**
 * #987 — administrative capacity, modeled on `autonomy-capacity.ts`'s
 * capacity/load shape (a *different* system — the late-era Cyber/network
 * "Autonomy" posture, `src/systems/autonomy-capacity.ts` — which this module
 * deliberately does not import from or extend; see CLAUDE.md's #987 guardrail
 * against touching the `autonomy*` modules).
 *
 * This is NOT another unrest pressure row: it is a wholly separate resource
 * that gates how many governance policies a civ can run at once, exactly the
 * way autonomy capacity gates how many network plans a civ can run at once.
 * Policy PRESSURE effects (a policy's own unrest-row contribution) are
 * unrelated to this file and live in governance-policy-definitions.ts /
 * faction-system.ts.
 */
export interface GovernanceCapacity {
  total: number;
  byCategory: Record<string, number>;
}

export interface GovernanceLoad {
  total: number;
  byCity: Record<string, number>;
  byPolicy: Record<string, number>;
  byGovernor: Record<string, number>;
}

const INFRA_CAPACITY_MAX = 4;
const POSTURE_CAPACITY_MAX = 4;
const CENTRALIZED_CAPACITY_PER_CITIES = 3; // +1 capacity per 3 owned cities, capped

/** #928: a governor assignment's own load cost — heavier than a policy's (1),
 * reflecting a bigger administrative commitment to one city. Lives here, not
 * in governor-system.ts, because this file already owns every load-cost
 * constant (see byPolicy below); governor-system.ts imports it from here
 * rather than the reverse, avoiding a governance-capacity <-> governor-system
 * import cycle (governor-system.ts needs getGovernanceCapacity/getGovernanceLoad
 * to validate an assignment). */
export const GOVERNOR_LOAD_COST = 2;

/**
 * `'autonomous'` reuses `civ.federalismEnabled` exactly as-is — see
 * governance-types.ts's own doc comment. No new field, no new toggle
 * mechanics: Federal Autonomy already IS one endpoint of this spectrum.
 */
export function getGovernancePosture(state: GameState, civId: string): GovernancePosture {
  return state.civilizations[civId]?.federalismEnabled === true ? 'autonomous' : 'centralized';
}

/**
 * Capacity is purely structural — posture and already-built administration-
 * ladder infrastructure — and does NOT depend on which policies are
 * currently active. Reads existing buildings/techs; changes none of their
 * own formulas (the #927 ladder's relief math is untouched).
 */
export function getGovernanceCapacity(state: GameState, civId: string): GovernanceCapacity {
  const civ = state.civilizations[civId];
  if (!civ) return { total: 0, byCategory: {} };

  const cities = Object.values(state.cities).filter(city => city.owner === civId);
  const completed = civ.techState.completed;

  let infra = 0;
  if (cities.some(city => city.buildings.includes('courthouse'))) infra += 1;
  if (cities.some(city => city.buildings.includes('regional_capital'))) infra += 1;
  if (completed.includes('separation-of-powers')) infra += 1;
  if (completed.includes('railway-expansion')) infra += 1;
  infra = Math.min(INFRA_CAPACITY_MAX, infra);

  const posture = getGovernancePosture(state, civId);
  const postureBonus = posture === 'centralized'
    ? Math.min(POSTURE_CAPACITY_MAX, Math.floor(cities.length / CENTRALIZED_CAPACITY_PER_CITIES))
    : 0;

  const base = 3;
  return {
    total: base + infra + postureBonus,
    byCategory: { base, infrastructure: infra, posture: postureBonus },
  };
}

/**
 * Load is purely distance-from-capital sprawl (dampened by distance under
 * `autonomous` posture — a wide, delegated empire administers distant cities
 * more cheaply, the tall-vs-wide difference the issue asks for) plus the load
 * cost of every currently-active policy. Deliberately NOT a flat per-city
 * charge: capacity's own per-city bonus is capped (POSTURE_CAPACITY_MAX), so
 * an unbounded "1 load per city" term would make governance capacity
 * unusable for exactly the large, sprawling empires the feature exists to
 * help — a close-to-capital city (the common case for a compact/tall empire)
 * costs zero load here.
 */
export function getGovernanceLoad(state: GameState, civId: string): GovernanceLoad {
  const civ = state.civilizations[civId];
  if (!civ) return { total: 0, byCity: {}, byPolicy: {}, byGovernor: {} };

  const cities = Object.values(state.cities).filter(city => city.owner === civId);
  const capital = getCapitalCity(state, civId);
  const posture = getGovernancePosture(state, civId);

  const byCity: Record<string, number> = {};
  let cityTotal = 0;
  for (const city of cities) {
    const distance = capital && capital.id !== city.id ? hexDistance(city.position, capital.position) : 0;
    const distanceLoad = Math.floor(distance / 5);
    const load = posture === 'autonomous' ? Math.floor(distanceLoad / 2) : distanceLoad;
    byCity[city.id] = load;
    cityTotal += load;
  }

  const byPolicy: Record<string, number> = {};
  let policyTotal = 0;
  for (const policy of GOVERNANCE_POLICY_DEFINITIONS) {
    if (civ.governancePolicies?.[policy.id] !== true) continue;
    byPolicy[policy.id] = policy.loadCost;
    policyTotal += policy.loadCost;
  }

  // #928: a governor assignment for a city this civ no longer owns (captured,
  // razed) is inert -- filtered out here rather than scrubbed on capture, so
  // the former owner's capacity frees up automatically and the captor never
  // inherits it, with no city-capture-system.ts teardown code needed.
  const byGovernor: Record<string, number> = {};
  let governorTotal = 0;
  for (const cityId of Object.keys(civ.governorAssignments ?? {})) {
    if (civ.governorAssignments?.[cityId] !== true) continue;
    if (state.cities[cityId]?.owner !== civId) continue;
    byGovernor[cityId] = GOVERNOR_LOAD_COST;
    governorTotal += GOVERNOR_LOAD_COST;
  }

  return { total: cityTotal + policyTotal + governorTotal, byCity, byPolicy, byGovernor };
}
