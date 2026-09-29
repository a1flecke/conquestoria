import type { GameState } from '../core/types';
import type { GovernanceFaction, GovernancePolicyId, GovernancePosture } from './governance-types';
import { GOVERNANCE_POLICY_DEFINITIONS } from './governance-policy-definitions';
import { getGovernanceCapacity, getGovernanceLoad, getGovernancePosture, GOVERNOR_LOAD_COST } from './governance-capacity';
import { isGovernancePolicyActive, canToggleGovernancePolicy, getGovernancePolicyLockedUntilTurn } from './governance-policy-system';
import { isCityGoverned, canToggleGovernor, getGovernorLockedUntilTurn } from './governor-system';
import { computeUnrestPressure } from './faction-system';

/**
 * #987 — own-empire-only governance projection. Deliberately does not expose
 * any OTHER civ's posture or policies: this PR does not add a foreign-facing
 * governance surface (no diplomacy-panel change, no espionage integration).
 * Every field here is read from the viewer's own civilization only, so there
 * is no fog-of-war/hot-seat leak surface to differentially test — hot seat
 * naturally works because the caller always passes `state.currentPlayer`.
 */
export interface GovernancePolicyPresentation {
  id: GovernancePolicyId;
  name: string;
  description: string;
  loadCost: number;
  pleases: GovernanceFaction[];
  angers: GovernanceFaction[];
  active: boolean;
  /** Whether toggling (in either direction) is legal right now — capacity for
   * enabling, the per-policy lock for either direction. */
  canToggle: boolean;
  lockedUntilTurn: number | null;
}

export interface GovernorCityPresentation {
  cityId: string;
  cityName: string;
  pressure: number;
  governed: boolean;
  /** Whether assign (if ungoverned) or remove (if governed) is legal right now. */
  canToggle: boolean;
  lockedUntilTurn: number | null;
}

export interface GovernancePresentation {
  posture: GovernancePosture;
  capacityTotal: number;
  loadTotal: number;
  policies: GovernancePolicyPresentation[];
  governorCities: GovernorCityPresentation[];
}

export function getGovernancePresentation(state: GameState, civId: string): GovernancePresentation {
  const capacity = getGovernanceCapacity(state, civId);
  const load = getGovernanceLoad(state, civId);
  const posture = getGovernancePosture(state, civId);

  const policies: GovernancePolicyPresentation[] = GOVERNANCE_POLICY_DEFINITIONS.map(def => {
    const active = isGovernancePolicyActive(state, civId, def.id);
    const lockedUntilTurn = getGovernancePolicyLockedUntilTurn(state, civId, def.id);
    const lockOpen = canToggleGovernancePolicy(state, civId, def.id);
    const wouldFitCapacity = active || load.total + def.loadCost <= capacity.total;
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      loadCost: def.loadCost,
      pleases: def.pleases,
      angers: def.angers,
      active,
      canToggle: lockOpen && wouldFitCapacity,
      lockedUntilTurn: Number.isFinite(lockedUntilTurn) ? lockedUntilTurn : null,
    };
  });

  const governorCities: GovernorCityPresentation[] = Object.values(state.cities)
    .filter(city => city.owner === civId)
    .map(city => {
      const governed = isCityGoverned(state, city.id);
      const lockedUntilTurn = getGovernorLockedUntilTurn(state, civId, city.id);
      const lockOpen = canToggleGovernor(state, civId, city.id);
      const wouldFitCapacity = governed || load.total + GOVERNOR_LOAD_COST <= capacity.total;
      return {
        cityId: city.id,
        cityName: city.name,
        pressure: computeUnrestPressure(city.id, state),
        governed,
        canToggle: lockOpen && wouldFitCapacity,
        lockedUntilTurn: Number.isFinite(lockedUntilTurn) ? lockedUntilTurn : null,
      };
    })
    .sort((a, b) => b.pressure - a.pressure);

  return { posture, capacityTotal: capacity.total, loadTotal: load.total, policies, governorCities };
}
