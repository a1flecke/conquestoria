import type {
  BarbarianEligibility,
  BarbarianObservationRequirement,
  UnitType,
} from '@/core/types';
import { seededLcg, weightedPick } from './seeded-lcg';
import { BARBARIAN_ELIGIBILITY_BY_UNIT } from './barbarian-roster';

type EligibleBarbarianUnit = Extract<BarbarianEligibility, { status: 'eligible' }>;

export interface BarbarianForceCompositionContext {
  era: number;
  /** Upper bound. The composer may underfill rather than violate a role cap. */
  forceSize: number;
  escalated: boolean;
  seed: number;
  /** Coarse camp-local facts; persistence and collection arrive in #698. */
  observedThreats?: readonly BarbarianObservationRequirement[];
}

interface Candidate {
  unitType: UnitType;
  eligibility: EligibleBarbarianUnit;
}

const FRONTLINE_MINIMUM = 0.4;
const FRONTLINE_MAXIMUM = 0.6;
const RANGED_AND_SIEGE_MAXIMUM = 0.3;
const MOBILE_MAXIMUM = 0.4;
const SPECIALIST_MAXIMUM = 0.25;

function normalizeEra(era: number): number {
  return Number.isFinite(era) ? Math.max(1, Math.floor(era)) : 1;
}

function normalizeForceSize(forceSize: number): number {
  return Number.isFinite(forceSize) ? Math.max(0, Math.floor(forceSize)) : 0;
}

function candidateForContext(
  unitType: UnitType,
  context: BarbarianForceCompositionContext,
): Candidate | null {
  const eligibility = BARBARIAN_ELIGIBILITY_BY_UNIT[unitType];
  if (eligibility.status !== 'eligible') return null;
  if (context.era < eligibility.eraWindow.min
    || context.era > (eligibility.eraWindow.max ?? Infinity)) return null;
  if (eligibility.requiresObservation
    && context.observedThreats?.includes(eligibility.requiresObservation) !== true) return null;
  return { unitType, eligibility };
}

function candidatesFor(context: BarbarianForceCompositionContext): Candidate[] {
  const candidates: Candidate[] = [];
  for (const unitType of Object.keys(BARBARIAN_ELIGIBILITY_BY_UNIT) as UnitType[]) {
    const candidate = candidateForContext(unitType, context);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((left, right) => left.unitType.localeCompare(right.unitType));
}

function countRole(force: readonly Candidate[], role: EligibleBarbarianUnit['roleSlot']): number {
  return force.filter(candidate => candidate.eligibility.roleSlot === role).length;
}

function maxFrontline(forceSize: number): number {
  const minimum = Math.ceil(forceSize * FRONTLINE_MINIMUM);
  return Math.max(minimum, Math.floor(forceSize * FRONTLINE_MAXIMUM));
}

function hasMutualExclusion(candidate: Candidate, force: readonly Candidate[]): boolean {
  return force.some(selected =>
    candidate.eligibility.excludesUnits?.includes(selected.unitType)
    || selected.eligibility.excludesUnits?.includes(candidate.unitType));
}

function canAddCandidate(
  candidate: Candidate,
  force: readonly Candidate[],
  context: BarbarianForceCompositionContext,
): boolean {
  if (hasMutualExclusion(candidate, force)) return false;
  if (candidate.eligibility.maxPerCamp !== undefined
    && force.filter(selected => selected.unitType === candidate.unitType).length >= candidate.eligibility.maxPerCamp) {
    return false;
  }

  const role = candidate.eligibility.roleSlot;
  const size = context.forceSize;
  if (role === 'frontline' && countRole(force, 'frontline') >= maxFrontline(size)) return false;
  if ((role === 'ranged' || role === 'siege')
    && countRole(force, 'ranged') + countRole(force, 'siege') >= Math.floor(size * RANGED_AND_SIEGE_MAXIMUM)) return false;
  if (role === 'mobile' && countRole(force, 'mobile') >= Math.floor(size * MOBILE_MAXIMUM)) return false;
  if (role === 'specialist' && countRole(force, 'specialist') >= Math.floor(size * SPECIALIST_MAXIMUM)) return false;
  if (role === 'anti-air' && countRole(force, 'anti-air') >= 1) return false;
  if (role === 'siege' && !context.escalated
    && countRole(force, 'siege') >= 1) return false;
  if (!context.escalated && candidate.eligibility.maxPerCampBeforeEscalation !== undefined
    && force.filter(selected => selected.unitType === candidate.unitType).length
      >= candidate.eligibility.maxPerCampBeforeEscalation) return false;

  const frontlineNeeded = Math.ceil(size * FRONTLINE_MINIMUM) - countRole(force, 'frontline');
  const slotsAfterSelection = size - force.length - 1;
  return role === 'frontline' || slotsAfterSelection >= frontlineNeeded;
}

/**
 * Creates a deterministic, data-driven prospective camp force. This is dark
 * until #699 owns the live reinforcement integration.
 */
export function composeBarbarianForce(context: BarbarianForceCompositionContext): UnitType[] {
  const size = normalizeForceSize(context.forceSize);
  if (size === 0) return [];

  const normalizedContext = { ...context, era: normalizeEra(context.era), forceSize: size };
  const candidates = candidatesFor(normalizedContext);
  const frontlineFallback = candidates.find(candidate => candidate.eligibility.roleSlot === 'frontline');
  const fallback = frontlineFallback ?? candidates[0];
  if (!fallback) return [];

  const rng = seededLcg(context.seed);
  const force: Candidate[] = [];
  for (let slot = 0; slot < size; slot++) {
    const legal = candidates.filter(candidate => canAddCandidate(candidate, force, normalizedContext));
    if (legal.length === 0) break;
    force.push(weightedPick(legal, legal.map(candidate => candidate.eligibility.weight), rng));
  }

  return force.length > 0 ? force.map(candidate => candidate.unitType) : [fallback.unitType];
}
