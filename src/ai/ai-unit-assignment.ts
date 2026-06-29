import type {
  AIStrategicPlan,
  AIStrategicRole,
  MajorCivPlanPortfolio,
  UnitType,
} from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getAIStrategicRoles } from './ai-unit-roles';

export interface AIUnitAssignmentCandidate {
  id: string;
  type: UnitType;
  health: number;
  experience: number;
  embarked: boolean;
  activeOtherDuty: boolean;
  travelTurnsByPlanId: Record<string, number>;
}

export interface AIForceDemand {
  role: AIStrategicRole;
  desired: number;
  assigned: number;
  missing: number;
  priority: number;
  sourcePlanIds: string[];
}

export interface AIUnitAssignmentContext {
  portfolio: MajorCivPlanPortfolio;
  units: readonly AIUnitAssignmentCandidate[];
  profile: {
    maxPrimaryForce: number;
    retreatHealthPercent: number;
  };
  defenseThreatScoreByPlanId: Record<string, number>;
  eliminationDefensePlanIds: readonly string[];
  onlyImmediateDefenderUnitIds: readonly string[];
  requiresEmbarkationByPlanId: Record<string, boolean>;
}

export interface AIUnitAssignmentResult {
  portfolio: MajorCivPlanPortfolio;
  assignmentsByPlanId: Record<string, string[]>;
  recoveryUnitIds: string[];
  forceDemands: AIForceDemand[];
  rejectedByUnitId: Record<string, string[]>;
}

const ROLE_ORDER: AIStrategicRole[] = [
  'transport',
  'frontline',
  'capture',
  'ranged',
  'siege',
  'mobile',
  'air-combat',
  'naval-combat',
  'escort',
  'recon',
  'detection',
  'settlement',
  'worker',
  'resource-expedition',
  'trade',
  'espionage',
];

const COMPATIBLE_ROLES: Partial<Record<AIStrategicRole, readonly AIStrategicRole[]>> = {
  frontline: ['capture'],
  capture: ['frontline'],
  recon: ['mobile'],
  mobile: ['recon'],
  escort: ['naval-combat'],
  'naval-combat': ['escort'],
};

function roleFit(type: UnitType, required: AIStrategicRole): number {
  const roles = getAIStrategicRoles(type);
  if (roles.includes(required)) return 1;
  if (COMPATIBLE_ROLES[required]?.some(role => roles.includes(role))) return 0.7;
  return 0;
}

function veterancyTier(experience: number): number {
  if (experience >= 50) return 3;
  if (experience >= 25) return 2;
  if (experience >= 10) return 1;
  return 0;
}

function clonePlan(plan: AIStrategicPlan, assignedUnitIds: string[]): AIStrategicPlan {
  return {
    ...plan,
    target: structuredClone(plan.target),
    reasonCodes: [...plan.reasonCodes],
    requiredRoles: { ...plan.requiredRoles },
    assignedUnitIds,
  };
}

function orderedPlans(context: AIUnitAssignmentContext): AIStrategicPlan[] {
  const eliminationIds = new Set(context.eliminationDefensePlanIds);
  const defenses = Object.values(context.portfolio.defensePlansByCityId);
  const elimination = defenses
    .filter(plan => eliminationIds.has(plan.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const ordinaryDefense = defenses
    .filter(plan => !eliminationIds.has(plan.id))
    .sort((left, right) =>
      (context.defenseThreatScoreByPlanId[right.id] ?? 0)
      - (context.defenseThreatScoreByPlanId[left.id] ?? 0)
      || left.id.localeCompare(right.id));
  return [
    ...elimination,
    ...ordinaryDefense,
    ...(context.portfolio.primaryPlan ? [context.portfolio.primaryPlan] : []),
  ];
}

function planPriority(
  plan: AIStrategicPlan,
  context: AIUnitAssignmentContext,
): number {
  if (context.eliminationDefensePlanIds.includes(plan.id)) return 1000;
  if (plan.objective === 'defend') {
    return 500 + (context.defenseThreatScoreByPlanId[plan.id] ?? 0);
  }
  return 100;
}

export function assignUnitsToPortfolio(
  context: AIUnitAssignmentContext,
): AIUnitAssignmentResult {
  const plans = orderedPlans(context);
  const primaryId = context.portfolio.primaryPlan?.id;
  const usedUnitIds = new Set<string>();
  const immediateDefenders = new Set(context.onlyImmediateDefenderUnitIds);
  const recoveryUnitIds = context.units
    .filter(unit =>
      !unit.embarked
      && unit.health < context.profile.retreatHealthPercent
      && !immediateDefenders.has(unit.id))
    .map(unit => unit.id)
    .sort();
  const recovering = new Set(recoveryUnitIds);
  const assignmentsByPlanId: Record<string, string[]> = Object.fromEntries(
    plans.map(plan => [plan.id, []]),
  );
  const assignedSlotsByPlanId: Record<string, AIStrategicRole[]> = Object.fromEntries(
    plans.map(plan => [plan.id, []]),
  );
  const desiredSlotsByPlanId: Record<string, Partial<Record<AIStrategicRole, number>>> = {};
  const capacityBlockedPlanIds = new Set<string>();
  const rejectedByUnitId: Record<string, string[]> = {};

  for (const plan of plans) {
    let transportCapacity = 0;
    let cargoCapacityUsed = 0;
    let remainingPrimarySlots = plan.id === primaryId
      ? Math.max(0, Math.floor(context.profile.maxPrimaryForce))
      : Number.POSITIVE_INFINITY;
    const requiredEntries = (Object.entries(plan.requiredRoles) as Array<[AIStrategicRole, number]>)
      .sort((left, right) =>
        ROLE_ORDER.indexOf(left[0]) - ROLE_ORDER.indexOf(right[0]))
      .map(([role, desired]) => {
        const effectiveDesired = Math.min(
          Math.max(0, Math.floor(desired)),
          remainingPrimarySlots,
        );
        remainingPrimarySlots -= effectiveDesired;
        return [role, effectiveDesired] as const;
      });
    desiredSlotsByPlanId[plan.id] = Object.fromEntries(requiredEntries);

    for (const [role, desired] of requiredEntries) {
      for (let slot = 0; slot < desired; slot++) {
        if (
          role === 'siege'
          && !assignedSlotsByPlanId[plan.id].some(assigned =>
            assigned === 'frontline' || assigned === 'capture')
        ) {
          continue;
        }

        const compatibleCandidates = context.units
          .filter(unit =>
            !usedUnitIds.has(unit.id)
            && !recovering.has(unit.id)
            && !unit.embarked
            && roleFit(unit.type, role) > 0
            && Number.isFinite(unit.travelTurnsByPlanId[plan.id]));
        const capacityEligibleCandidates = compatibleCandidates.filter(unit => {
            if (!context.requiresEmbarkationByPlanId[plan.id]) return true;
            const definition = UNIT_DEFINITIONS[unit.type];
            if (role === 'transport') return definition.cargoCapacity !== undefined;
            if ((definition.domain ?? 'land') !== 'land') return true;
            const cargoSize = definition.cargoSize ?? 1;
            return cargoCapacityUsed + cargoSize <= transportCapacity;
          });
        if (
          capacityEligibleCandidates.length === 0
          && compatibleCandidates.some(unit => {
            const definition = UNIT_DEFINITIONS[unit.type];
            return context.requiresEmbarkationByPlanId[plan.id]
              && role !== 'transport'
              && (definition.domain ?? 'land') === 'land'
              && cargoCapacityUsed + (definition.cargoSize ?? 1) > transportCapacity;
          })
        ) {
          capacityBlockedPlanIds.add(plan.id);
        }
        const candidates = capacityEligibleCandidates
          .map(unit => ({
            unit,
            score: roleFit(unit.type, role) * 40
              - unit.travelTurnsByPlanId[plan.id] * 5
              + Math.max(0, Math.min(100, unit.health)) * 0.2
              + veterancyTier(unit.experience) * 3
              - (unit.activeOtherDuty ? 20 : 0),
          }))
          .sort((left, right) =>
            right.score - left.score || left.unit.id.localeCompare(right.unit.id));
        const selected = candidates[0]?.unit;
        if (!selected) continue;

        usedUnitIds.add(selected.id);
        assignmentsByPlanId[plan.id].push(selected.id);
        assignedSlotsByPlanId[plan.id].push(role);
        const definition = UNIT_DEFINITIONS[selected.type];
        if (role === 'transport') {
          transportCapacity += definition.cargoCapacity ?? 0;
        } else if (
          context.requiresEmbarkationByPlanId[plan.id]
          && (definition.domain ?? 'land') === 'land'
        ) {
          cargoCapacityUsed += definition.cargoSize ?? 1;
        }
      }
    }
  }

  for (const unit of context.units) {
    if (usedUnitIds.has(unit.id) || recovering.has(unit.id)) continue;
    rejectedByUnitId[unit.id] = unit.embarked ? ['embarked'] : ['no-open-compatible-slot'];
  }

  const demandByRole = new Map<AIStrategicRole, AIForceDemand>();
  for (const plan of plans) {
    for (const [role, desiredRaw] of Object.entries(desiredSlotsByPlanId[plan.id] ?? {}) as Array<[AIStrategicRole, number]>) {
      const desired = Math.max(0, Math.floor(desiredRaw));
      const assigned = assignedSlotsByPlanId[plan.id].filter(slot => slot === role).length;
      const existing = demandByRole.get(role) ?? {
        role,
        desired: 0,
        assigned: 0,
        missing: 0,
        priority: 0,
        sourcePlanIds: [],
      };
      existing.desired += desired;
      existing.assigned += assigned;
      existing.missing = existing.desired - existing.assigned;
      existing.priority = Math.max(existing.priority, planPriority(plan, context));
      existing.sourcePlanIds.push(plan.id);
      demandByRole.set(role, existing);
    }
  }
  for (const planId of capacityBlockedPlanIds) {
    const plan = plans.find(candidate => candidate.id === planId);
    if (!plan) continue;
    const existing = demandByRole.get('transport') ?? {
      role: 'transport',
      desired: 0,
      assigned: 0,
      missing: 0,
      priority: 0,
      sourcePlanIds: [],
    };
    existing.desired += 1;
    existing.missing = Math.max(0, existing.desired - existing.assigned);
    existing.priority = Math.max(existing.priority, planPriority(plan, context));
    existing.sourcePlanIds.push(plan.id);
    demandByRole.set('transport', existing);
  }

  const defensePlansByCityId = Object.fromEntries(
    Object.entries(context.portfolio.defensePlansByCityId).map(([cityId, plan]) => [
      cityId,
      clonePlan(plan, assignmentsByPlanId[plan.id] ?? []),
    ]),
  );
  const primaryPlan = context.portfolio.primaryPlan
    ? clonePlan(
        context.portfolio.primaryPlan,
        assignmentsByPlanId[context.portfolio.primaryPlan.id] ?? [],
      )
    : null;

  return {
    portfolio: {
      ...context.portfolio,
      primaryPlan,
      defensePlansByCityId,
      upgradeRoutesByUnitId: { ...context.portfolio.upgradeRoutesByUnitId },
    },
    assignmentsByPlanId,
    recoveryUnitIds,
    forceDemands: [...demandByRole.values()]
      .map(demand => ({
        ...demand,
        sourcePlanIds: [...new Set(demand.sourcePlanIds)].sort(),
      }))
      .sort((left, right) =>
        right.priority - left.priority || left.role.localeCompare(right.role)),
    rejectedByUnitId,
  };
}
