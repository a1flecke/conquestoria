// #1397 Own-force operational readiness: what, if anything, currently limits the viewer's armed forces.
//
// Pure, deterministic, read-only: no RNG, no mutation, no events, no save field, no cache. It reads only the
// viewer's OWN units (owner === viewerCivId), so nothing about any other civilization can change the answer.
//
// It deliberately owns NO rule. Every limitation is an existing domain's own answer:
//   - which units count        -> `isMilitaryStrengthUnit` (the diplomatic-strength definition) and "not carried as cargo"
//   - land supply              -> `unitParticipatesInLandSupply` + the unit's persisted `landSupply.state`
//   - aircraft                 -> `getAirReadinessState` (status, strike denial, base support)
//   - fleets                   -> `unitParticipatesInNavalOperations` + `getNavalEnduranceStatus`
//   - penalties quoted to the player come from the same constants combat reads
//
// Operational readiness is NOT combat strength and not a forecast: nothing here compares against another civilization
// or says anything about winning. It is a bounded list of "N of your units are limited by X, and X means Y".
import type { GameState, Unit } from '@/core/types';
import { isMilitaryStrengthUnit } from '@/systems/diplomatic-strength';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';
import { OVEREXTENDED_COMBAT_MULTIPLIER } from '@/systems/supply-combat';
import { AIR_WORN_COMBAT_MULTIPLIER, getAirReadinessState, unitParticipatesInAirReadiness } from '@/systems/air-readiness';
import {
  NAVAL_DEPLETED_COMBAT_MULTIPLIER,
  NAVAL_DEPLETED_MOVEMENT_PENALTY,
  NAVAL_EXTENDED_COMBAT_MULTIPLIER,
  getNavalEnduranceStatus,
  unitParticipatesInNavalOperations,
} from '@/systems/naval-endurance';

/** At or below half health a unit is "badly wounded". A reporting bucket only: combat itself scales strength by health continuously. */
export const BADLY_WOUNDED_HEALTH = 50;

export type ForceLimitationKind =
  | 'wounded'
  | 'unsupplied'
  | 'air-worn'
  | 'air-cannot-strike'
  | 'naval-extended'
  | 'naval-depleted';

export interface ForceLimitation {
  kind: ForceLimitationKind;
  /** Eligible units affected by this limitation. A unit may appear under more than one kind (it can be wounded AND unsupplied). */
  units: number;
  /** True when the unit loses a capability outright (cannot strike, cut off, depleted), not just strength. */
  severe: boolean;
  /** Plain-language effect, quoted from the owning domain's own constants. */
  effect: string;
}

export interface OwnForceReadiness {
  civId: string;
  /** Own, military, not carried as cargo. */
  eligibleUnits: number;
  /** Eligible units with no limitation of any kind. */
  availableUnits: number;
  /** Distinct eligible units with at least one limitation (each unit counted once however many apply). */
  limitedUnits: number;
  /** Same, ignoring land supply -- supply already has its own Council constraint, so war guidance must not restate it. */
  limitedUnitsExcludingSupply: number;
  /** Non-empty kinds only, most severe first, then most units, then kind name: stable and bounded (at most six). */
  limitations: ForceLimitation[];
}

const KIND_ORDER: Record<ForceLimitationKind, number> = {
  'air-cannot-strike': 0,
  'naval-depleted': 1,
  unsupplied: 2,
  'naval-extended': 3,
  'air-worn': 4,
  wounded: 5,
};

const percentLess = (multiplier: number): number => Math.round((1 - multiplier) * 100);

const EFFECTS: Record<ForceLimitationKind, { severe: boolean; effect: string }> = {
  wounded: { severe: false, effect: 'Badly wounded units fight with reduced strength until they heal.' },
  unsupplied: { severe: true, effect: `Cut-off units fight ${percentLess(OVEREXTENDED_COMBAT_MULTIPLIER)}% weaker and cannot heal until supply returns.` },
  'air-worn': { severe: false, effect: `Worn aircraft fight ${percentLess(AIR_WORN_COMBAT_MULTIPLIER)}% weaker until they rest.` },
  'air-cannot-strike': { severe: true, effect: 'Aircraft that cannot strike are limited to lighter missions (recon, patrol, rebase) until they rest or their carrier is back in port.' },
  'naval-extended': { severe: false, effect: `Ships far from a friendly port fight ${percentLess(NAVAL_EXTENDED_COMBAT_MULTIPLIER)}% weaker.` },
  'naval-depleted': { severe: true, effect: `Depleted ships fight ${percentLess(NAVAL_DEPLETED_COMBAT_MULTIPLIER)}% weaker and move ${NAVAL_DEPLETED_MOVEMENT_PENALTY} less.` },
};

function isEligible(unit: Unit, civId: string): boolean {
  return unit.owner === civId
    && !unit.transportId
    && Number.isFinite(unit.health)
    && unit.health > 0
    && isMilitaryStrengthUnit(unit.type);
}

/** Every limitation that applies to one eligible unit, from the owning domains' own queries. */
function limitationsOf(state: GameState, unit: Unit): ForceLimitationKind[] {
  const kinds: ForceLimitationKind[] = [];
  if (unit.health <= BADLY_WOUNDED_HEALTH) kinds.push('wounded');
  if (unitParticipatesInLandSupply(unit)) {
    const supply = unit.landSupply?.state;
    if (supply === 'degraded' || supply === 'severe') kinds.push('unsupplied');
  }
  if (unitParticipatesInAirReadiness(unit)) {
    const air = getAirReadinessState(state, unit);
    if (air.strikeDenial) kinds.push('air-cannot-strike');
    else if (air.status === 'worn') kinds.push('air-worn');
  }
  if (unitParticipatesInNavalOperations(unit)) {
    const naval = getNavalEnduranceStatus(unit);
    if (naval === 'depleted') kinds.push('naval-depleted');
    else if (naval === 'extended') kinds.push('naval-extended');
  }
  return kinds;
}

export function getOwnForceReadiness(state: GameState, viewerCivId: string): OwnForceReadiness {
  const counts = new Map<ForceLimitationKind, number>();
  let eligible = 0;
  let limited = 0;
  let limitedExcludingSupply = 0;

  // One pass over the unit table; no pathfinding, no map access, no clone.
  for (const unit of Object.values(state.units ?? {})) {
    if (!isEligible(unit, viewerCivId)) continue;
    eligible += 1;
    const kinds = limitationsOf(state, unit);
    if (kinds.length === 0) continue;
    limited += 1;
    if (kinds.some(kind => kind !== 'unsupplied')) limitedExcludingSupply += 1;
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  const limitations: ForceLimitation[] = [...counts.entries()]
    .map(([kind, units]) => ({ kind, units, severe: EFFECTS[kind].severe, effect: EFFECTS[kind].effect }))
    .sort((a, b) => Number(b.severe) - Number(a.severe) || b.units - a.units || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return {
    civId: viewerCivId,
    eligibleUnits: eligible,
    availableUnits: eligible - limited,
    limitedUnits: limited,
    limitedUnitsExcludingSupply: limitedExcludingSupply,
    limitations,
  };
}
