import type { BarbarianRoleSlot, GameState, Unit } from '@/core/types';
import { createStableIdentityRng } from './simulation-rng';
import { mapDistance } from './hex-utils';

/**
 * #1089: bounded, legible behavioral identities for barbarian camps. Each archetype changes
 * target selection, commitment, retreat/recovery, and force composition -- never a bare combat
 * stat multiplier. See docs/superpowers/specs/2026-09-22-issue-1089-nonmajor-archetypes-design.md
 * for the full design and the rejected alternatives (persisted field, more than 3 archetypes).
 */
export const BARBARIAN_ARCHETYPES = ['raider', 'predator', 'warlord'] as const;
export type BarbarianArchetype = (typeof BARBARIAN_ARCHETYPES)[number];

export interface BarbarianArchetypeDefinition {
  archetype: BarbarianArchetype;
  /** Predator only: hunts any sensed hostile combat unit that is wounded or isolated. */
  huntsIsolatedWounded: boolean;
  /** Predator only: never considers a city a raid target, regardless of HP. */
  avoidsCities: boolean;
  /** Warlord only: minimum locally assigned force size before advancing on a city target. */
  mobilizationThreshold: number;
  /** Raider only: turns of no new raid/hunt plan selection after returning from a raid. */
  recoveryCooldownTurns: number;
  /** How committed the archetype is to a chosen (non-defend) plan; matches AIStrategicPlan.commitment's 0-1 scale. */
  commitment: number;
  /** Multiplies BarbarianEligibility.weight per role slot before the weighted reinforcement pick. */
  roleWeightMultipliers: Record<BarbarianRoleSlot, number>;
}

const NEUTRAL_ROLE_WEIGHTS: Record<BarbarianRoleSlot, number> = {
  frontline: 1, ranged: 1, siege: 1, mobile: 1, specialist: 1, 'anti-air': 1,
};

export const BARBARIAN_ARCHETYPE_DEFINITIONS: Record<BarbarianArchetype, BarbarianArchetypeDefinition> = {
  raider: {
    archetype: 'raider',
    huntsIsolatedWounded: false,
    avoidsCities: false,
    mobilizationThreshold: 0,
    recoveryCooldownTurns: 4,
    commitment: 0.7,
    roleWeightMultipliers: { ...NEUTRAL_ROLE_WEIGHTS, mobile: 1.5, siege: 0.1, specialist: 0.5, 'anti-air': 0.5, ranged: 0.7 },
  },
  predator: {
    archetype: 'predator',
    huntsIsolatedWounded: true,
    avoidsCities: true,
    mobilizationThreshold: 0,
    recoveryCooldownTurns: 0,
    commitment: 0.85,
    roleWeightMultipliers: { ...NEUTRAL_ROLE_WEIGHTS, mobile: 1.8, frontline: 1.2, siege: 0.05, specialist: 0.3, 'anti-air': 0.3, ranged: 0.8 },
  },
  warlord: {
    archetype: 'warlord',
    huntsIsolatedWounded: false,
    avoidsCities: false,
    mobilizationThreshold: 4,
    recoveryCooldownTurns: 0,
    commitment: 1,
    roleWeightMultipliers: { ...NEUTRAL_ROLE_WEIGHTS, frontline: 1.3, siege: 2, ranged: 1, mobile: 0.6 },
  },
};

export function getBarbarianArchetypeDefinition(archetype: BarbarianArchetype): BarbarianArchetypeDefinition {
  return BARBARIAN_ARCHETYPE_DEFINITIONS[archetype];
}

/**
 * Deterministic, stable, derived from already-persisted identity (gameId + camp id) -- never
 * persisted itself. Same campaign + same camp ⇒ same archetype forever, including across any
 * number of save/reload cycles. See the design doc's "Identity: derived, not persisted" section
 * for why this is preferred over a new `BarbarianCamp.archetype` field.
 */
export function resolveBarbarianArchetype(
  state: Pick<GameState, 'gameId'>,
  campId: string,
): BarbarianArchetype {
  const roll = createStableIdentityRng(state, { domain: 'barbarian-archetype', actorId: campId })();
  const index = Math.floor(roll * BARBARIAN_ARCHETYPES.length);
  return BARBARIAN_ARCHETYPES[Math.min(index, BARBARIAN_ARCHETYPES.length - 1)]!;
}

const PREDATOR_WOUNDED_HEALTH_THRESHOLD = 50;
const PREDATOR_ISOLATION_RADIUS = 2;

/**
 * Predator's proactive hunt target: any sensed hostile combat unit (any type with positive
 * strength -- reuses the same `UNIT_DEFINITIONS[type].strength > 0` combat-capability test the
 * orchestrator's own camp-defense branch already applies) that is either wounded or has no
 * other sensed unit of the same owner within `PREDATOR_ISOLATION_RADIUS`. `sensedUnits` MUST be
 * the camp's own already-locally-filtered set (see `barbarian-system.ts`'s `sensedByCamp`) --
 * this function never widens visibility, so "isolated" correctly means "the camp cannot sense
 * an escort," not "no escort exists anywhere in the world."
 */
export function findPredatorHuntTarget(
  state: Pick<GameState, 'map'>,
  campPosition: { q: number; r: number },
  sensedUnits: readonly Unit[],
  isCombatCapable: (unit: Unit) => boolean,
): Unit | undefined {
  const candidates = sensedUnits.filter(isCombatCapable);
  const wounded = (unit: Unit) => unit.health < PREDATOR_WOUNDED_HEALTH_THRESHOLD;
  const isolated = (unit: Unit) => !candidates.some(other =>
    other.id !== unit.id
    && other.owner === unit.owner
    && mapDistance(state.map, other.position, unit.position) <= PREDATOR_ISOLATION_RADIUS);

  return candidates
    .filter(unit => wounded(unit) || isolated(unit))
    .sort((a, b) => {
      // Prefer the most exploitable prey first: wounded-and-isolated, then wounded, then
      // isolated, tie-broken by proximity to camp then id for determinism.
      const score = (unit: Unit) => (wounded(unit) ? 2 : 0) + (isolated(unit) ? 1 : 0);
      return score(b) - score(a)
        || mapDistance(state.map, campPosition, a.position) - mapDistance(state.map, campPosition, b.position)
        || a.id.localeCompare(b.id);
    })[0];
}

/** Warlord's mobilization gate: has this camp assembled enough local force to advance? */
export function isMobilizedForAssault(assignedCount: number, archetype: BarbarianArchetype): boolean {
  return assignedCount >= getBarbarianArchetypeDefinition(archetype).mobilizationThreshold;
}
