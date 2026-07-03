import { describe, expect, it } from 'vitest';
import type { AIStrategicPlan, MajorCivPlanPortfolio, UnitType } from '@/core/types';
import {
  assignUnitsToPortfolio,
  type AIUnitAssignmentCandidate,
} from '@/ai/ai-unit-assignment';
import { createEmptyMajorCivPortfolio } from '@/ai/ai-plan-portfolio';

function plan(
  id: string,
  objective: AIStrategicPlan['objective'],
  requiredRoles: AIStrategicPlan['requiredRoles'],
): AIStrategicPlan {
  return {
    id,
    actorId: 'ai-1',
    objective,
    target: { kind: 'city', id: `${id}-target`, lastKnownPosition: { q: 5, r: 0 } },
    theaterId: 'region-0',
    phase: 'mobilizing',
    reasonCodes: objective === 'defend' ? ['urgent-defense'] : ['nearby-opportunity'],
    commitment: 0.5,
    createdTurn: 5,
    reconsiderAfterTurn: 9,
    expiresAfterTurn: 20,
    lastProgressTurn: 8,
    requiredRoles,
    assignedUnitIds: [],
  };
}

function unit(
  id: string,
  type: UnitType,
  travel: Record<string, number>,
  overrides: Partial<AIUnitAssignmentCandidate> = {},
): AIUnitAssignmentCandidate {
  return {
    id,
    type,
    health: 100,
    experience: 0,
    embarked: false,
    activeOtherDuty: false,
    travelTurnsByPlanId: travel,
    ...overrides,
  };
}

function portfolio(): MajorCivPlanPortfolio {
  return {
    ...createEmptyMajorCivPortfolio(),
    primaryPlan: plan('capture-rival', 'capture', { frontline: 1, capture: 1 }),
    defensePlansByCityId: {
      capital: plan('defend-capital', 'defend', { frontline: 1 }),
    },
  };
}

describe('AI unit assignment', () => {
  it('keeps route-committed modernization units unavailable to plans', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('attack', 'capture', { frontline: 1 }),
      },
      units: [
        unit('routed', 'warrior', { attack: 1 }, { activeOtherDuty: true }),
      ],
      profile: { maxPrimaryForce: 3, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId.attack).toEqual([]);
  });

  it('never assigns one unit to two plans', () => {
    const result = assignUnitsToPortfolio({
      portfolio: portfolio(),
      units: [
        unit('near-swordsman', 'swordsman', { 'defend-capital': 1, 'capture-rival': 2 }),
        unit('warrior', 'warrior', { 'defend-capital': 2, 'capture-rival': 1 }),
        unit('horseman', 'horseman', { 'defend-capital': 3, 'capture-rival': 2 }),
      ],
      profile: { maxPrimaryForce: 3, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: { 'defend-capital': 90 },
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });
    const assigned = Object.values(result.assignmentsByPlanId).flat();

    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('preempts the nearest viable offensive unit for urgent defense', () => {
    const result = assignUnitsToPortfolio({
      portfolio: portfolio(),
      units: [
        unit('near-swordsman', 'swordsman', { 'defend-capital': 1, 'capture-rival': 1 }),
        unit('far-warrior', 'warrior', { 'defend-capital': 4, 'capture-rival': 2 }),
      ],
      profile: { maxPrimaryForce: 3, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: { 'defend-capital': 90 },
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId['defend-capital']).toContain('near-swordsman');
    expect(result.assignmentsByPlanId['capture-rival']).not.toContain('near-swordsman');
  });

  it('never fills combat requirements with support specialists', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('attack', 'capture', { frontline: 2 }),
      },
      units: [
        unit('settler', 'settler', { attack: 0 }),
        unit('worker', 'worker', { attack: 0 }),
        unit('expedition', 'expedition', { attack: 0 }),
        unit('caravan', 'caravan', { attack: 0 }),
      ],
      profile: { maxPrimaryForce: 4, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId.attack).toEqual([]);
    expect(result.forceDemands).toContainEqual(expect.objectContaining({
      role: 'frontline',
      desired: 2,
      assigned: 0,
      missing: 2,
    }));
  });

  it('keeps settlement, worker, expedition, and trade demand distinct', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('develop', 'expand', {
          settlement: 1,
          worker: 1,
          'resource-expedition': 1,
          trade: 1,
        }),
      },
      units: [
        unit('settler', 'settler', { develop: 1 }),
        unit('worker', 'worker', { develop: 1 }),
        unit('expedition', 'expedition', { develop: 1 }),
        unit('caravan', 'caravan', { develop: 1 }),
      ],
      profile: { maxPrimaryForce: 4, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId.develop).toEqual([
      'settler',
      'worker',
      'expedition',
      'caravan',
    ]);
  });

  it('sends damaged units to recovery unless they alone prevent immediate capture', () => {
    const base = {
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        defensePlansByCityId: {
          capital: plan('defend', 'defend', { frontline: 1 }),
        },
      },
      units: [unit('damaged', 'warrior', { defend: 0 }, { health: 20 })],
      profile: { maxPrimaryForce: 4, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: { defend: 100 },
      eliminationDefensePlanIds: ['defend'],
      requiresEmbarkationByPlanId: {},
    };

    const recovering = assignUnitsToPortfolio({
      ...base,
      onlyImmediateDefenderUnitIds: [],
    });
    const lastStand = assignUnitsToPortfolio({
      ...base,
      onlyImmediateDefenderUnitIds: ['damaged'],
    });

    expect(recovering.recoveryUnitIds).toContain('damaged');
    expect(recovering.assignmentsByPlanId.defend).toEqual([]);
    expect(lastStand.assignmentsByPlanId.defend).toContain('damaged');
  });

  it('excludes embarked cargo and protects siege with a frontline unit', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('siege', 'capture', { frontline: 1, siege: 1 }),
      },
      units: [
        unit('embarked-warrior', 'warrior', { siege: 0 }, { embarked: true }),
        unit('catapult', 'catapult', { siege: 1 }),
      ],
      profile: { maxPrimaryForce: 4, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId.siege).toEqual([]);
    expect(result.forceDemands.find(demand => demand.role === 'frontline')?.missing).toBe(1);
    expect(result.forceDemands.find(demand => demand.role === 'siege')?.missing).toBe(1);
  });

  it('respects transport capacity and cargo size for overseas plans', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('overseas', 'capture', { transport: 1, capture: 2 }),
      },
      units: [
        unit('transport', 'transport', { overseas: 1 }),
        unit('cavalry', 'cavalry', { overseas: 1 }),
        unit('warrior', 'warrior', { overseas: 1 }),
      ],
      profile: { maxPrimaryForce: 4, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: { overseas: true },
    });

    expect(result.assignmentsByPlanId.overseas).toContain('transport');
    expect(result.assignmentsByPlanId.overseas).toContain('cavalry');
    expect(result.assignmentsByPlanId.overseas).not.toContain('warrior');
    expect(result.forceDemands.find(demand => demand.role === 'capture')?.missing).toBe(1);
    expect(result.forceDemands.find(demand => demand.role === 'transport')).toMatchObject({
      assigned: 1,
      missing: 1,
    });
  });

  it('uses stable IDs to break equal assignment ties and caps the primary force', () => {
    const result = assignUnitsToPortfolio({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: plan('primary', 'capture', { frontline: 3 }),
      },
      units: [
        unit('unit-b', 'warrior', { primary: 1 }),
        unit('unit-a', 'warrior', { primary: 1 }),
        unit('unit-c', 'warrior', { primary: 1 }),
      ],
      profile: { maxPrimaryForce: 2, retreatHealthPercent: 30 },
      defenseThreatScoreByPlanId: {},
      eliminationDefensePlanIds: [],
      onlyImmediateDefenderUnitIds: [],
      requiresEmbarkationByPlanId: {},
    });

    expect(result.assignmentsByPlanId.primary).toEqual(['unit-a', 'unit-b']);
    expect(result.forceDemands.find(demand => demand.role === 'frontline')).toMatchObject({
      desired: 2,
      assigned: 2,
      missing: 0,
    });
  });
});
