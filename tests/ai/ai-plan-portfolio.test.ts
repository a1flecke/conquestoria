import { describe, expect, it } from 'vitest';
import type { AIStrategicPlan, MajorCivPlanPortfolio } from '@/core/types';
import {
  createEmptyMajorCivPortfolio,
  refreshMajorCivPortfolio,
  type AIPlanCandidate,
  type AICityThreat,
} from '@/ai/ai-plan-portfolio';

function candidate(id: string, score: number, overrides: Partial<AIPlanCandidate> = {}): AIPlanCandidate {
  return {
    objective: 'capture',
    target: { kind: 'city', id, lastKnownPosition: { q: 3, r: 2 } },
    theaterId: 'region-0',
    score,
    reasonCodes: ['nearby-opportunity'],
    requiredRoles: { capture: 1, frontline: 1 },
    commitment: 0.3,
    targetValid: true,
    reasonValid: true,
    expectedLossRatio: 0.5,
    progress: false,
    ...overrides,
  };
}

function plan(id: string, overrides: Partial<AIStrategicPlan> = {}): AIStrategicPlan {
  return {
    id,
    actorId: 'ai-1',
    objective: 'capture',
    target: { kind: 'city', id: 'close', lastKnownPosition: { q: 3, r: 2 } },
    theaterId: 'region-0',
    phase: 'advancing',
    reasonCodes: ['nearby-opportunity'],
    commitment: 0.7,
    createdTurn: 5,
    reconsiderAfterTurn: 12,
    expiresAfterTurn: 20,
    lastProgressTurn: 9,
    requiredRoles: { capture: 1, frontline: 1 },
    assignedUnitIds: [],
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    actorId: 'ai-1',
    turn: 10,
    actorEliminated: false,
    portfolio: {
      ...createEmptyMajorCivPortfolio(),
      primaryPlan: plan('capture-close'),
    },
    candidates: [candidate('close', 40), candidate('new', 44)],
    cityThreats: [] as AICityThreat[],
    modernization: {
      bestTrainableStrength: 30,
      deployedStrength: 25,
      actorEra: 3,
      globalEra: 3,
      knownRivalMaxStrength: 30,
      obsoleteUnitShare: 0.1,
      treasuryCanAct: true,
    },
    ...overrides,
  };
}

describe('major-civilization plan portfolios', () => {
  it('retains a progressing local campaign over a marginally higher new score', () => {
    const result = refreshMajorCivPortfolio(context({
      candidates: [
        candidate('close', 40, { progress: true }),
        candidate('new', 44),
      ],
    }));

    expect(result.portfolio.primaryPlan?.id).toBe('capture-close');
    expect(result.portfolio.primaryPlan?.lastProgressTurn).toBe(10);
  });

  it('switches when the new plan clears the commitment-weighted threshold', () => {
    const result = refreshMajorCivPortfolio(context({
      candidates: [candidate('close', 40), candidate('decisive', 70)],
    }));

    expect(result.portfolio.primaryPlan?.target).toMatchObject({ kind: 'city', id: 'decisive' });
  });

  it('abandons missing targets, stale plans, unacceptable losses, and expired reasons', () => {
    for (const currentCandidate of [
      candidate('close', 40, { targetValid: false }),
      candidate('close', 40, { expectedLossRatio: 1.8 }),
      candidate('close', 40, { reasonValid: false }),
    ]) {
      const result = refreshMajorCivPortfolio(context({
        candidates: [currentCandidate, candidate('fallback', 30)],
      }));
      expect(result.portfolio.primaryPlan?.target).toMatchObject({ kind: 'city', id: 'fallback' });
    }

    const stale = plan('stale', {
      reconsiderAfterTurn: 8,
      lastProgressTurn: 6,
    });
    const staleResult = refreshMajorCivPortfolio(context({
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: stale },
      candidates: [candidate('close', 40), candidate('fallback', 30)],
    }));
    expect(staleResult.portfolio.primaryPlan?.id).not.toBe('stale');
  });

  it('clears strategic plans for an eliminated actor', () => {
    const result = refreshMajorCivPortfolio(context({ actorEliminated: true }));

    expect(result.portfolio.primaryPlan).toBeNull();
    expect(result.portfolio.defensePlansByCityId).toEqual({});
  });

  it('adds urgent city defense without deleting the primary plan', () => {
    const result = refreshMajorCivPortfolio(context({
      cityThreats: [{
        cityId: 'capital',
        position: { q: 2, r: 2 },
        theaterId: 'region-home',
        travelTurns: 2,
        alreadyAttackedTerritory: false,
        captureRisk: 80,
        hostileStrength: 35,
        isCapital: true,
        isLastCity: false,
        threatStillValid: true,
      }],
    }));

    expect(result.portfolio.primaryPlan).not.toBeNull();
    expect(Object.keys(result.portfolio.defensePlansByCityId)).toContain('capital');
  });

  it('deduplicates and caps defense plans while retaining overflow demand', () => {
    const threats: AICityThreat[] = Array.from({ length: 6 }, (_, index) => ({
      cityId: `city-${index}`,
      position: { q: index, r: 0 },
      theaterId: 'region-home',
      travelTurns: 1,
      alreadyAttackedTerritory: index === 5,
      captureRisk: 50 + index,
      hostileStrength: 20 + index,
      isCapital: index === 4,
      isLastCity: false,
      threatStillValid: true,
    }));
    threats.push({ ...threats[0] });

    const result = refreshMajorCivPortfolio(context({ cityThreats: threats }));

    expect(Object.keys(result.portfolio.defensePlansByCityId)).toHaveLength(4);
    expect(result.unplannedDefenseCityIds).toHaveLength(2);
    expect(new Set(result.unplannedDefenseCityIds).size).toBe(2);
  });

  it('removes defense when its threat is no longer valid or urgent', () => {
    const existing = plan('defend-old', {
      objective: 'defend',
      target: { kind: 'city', id: 'old', lastKnownPosition: { q: 1, r: 1 } },
    });
    const portfolio: MajorCivPlanPortfolio = {
      ...createEmptyMajorCivPortfolio(),
      primaryPlan: plan('primary'),
      defensePlansByCityId: { old: existing },
    };
    const result = refreshMajorCivPortfolio(context({
      portfolio,
      cityThreats: [{
        cityId: 'old',
        position: { q: 1, r: 1 },
        theaterId: 'home',
        travelTurns: 7,
        alreadyAttackedTerritory: false,
        captureRisk: 10,
        hostileStrength: 10,
        isCapital: false,
        isLastCity: false,
        threatStillValid: false,
      }],
    }));

    expect(result.portfolio.defensePlansByCityId).toEqual({});
  });

  it('retains a receding defense until it is beyond six turns for two planning phases', () => {
    const existing = plan('defend-old', {
      objective: 'defend',
      target: { kind: 'city', id: 'old', lastKnownPosition: { q: 1, r: 1 } },
    });
    const portfolio: MajorCivPlanPortfolio = {
      ...createEmptyMajorCivPortfolio(),
      primaryPlan: plan('primary'),
      defensePlansByCityId: { old: existing },
    };
    const threat: AICityThreat = {
      cityId: 'old',
      position: { q: 1, r: 1 },
      theaterId: 'home',
      travelTurns: 7,
      alreadyAttackedTerritory: false,
      captureRisk: 10,
      hostileStrength: 10,
      isCapital: false,
      isLastCity: false,
      threatStillValid: true,
      consecutiveBeyondSixPhases: 1,
    };

    expect(refreshMajorCivPortfolio(context({
      portfolio,
      cityThreats: [threat],
    })).portfolio.defensePlansByCityId.old).toBeDefined();
    expect(refreshMajorCivPortfolio(context({
      portfolio,
      cityThreats: [{ ...threat, consecutiveBeyondSixPhases: 2 }],
    })).portfolio.defensePlansByCityId.old).toBeUndefined();
  });

  it('uses deterministic plan IDs and clamps commitment', () => {
    const first = refreshMajorCivPortfolio(context({
      portfolio: createEmptyMajorCivPortfolio(),
      candidates: [candidate('target', 50, { commitment: 3 })],
    }));
    const second = refreshMajorCivPortfolio(context({
      portfolio: createEmptyMajorCivPortfolio(),
      candidates: [candidate('target', 50, { commitment: 3 })],
    }));

    expect(first.portfolio.primaryPlan?.id).toBe(
      'ai-plan:ai-1:capture:city:target:10',
    );
    expect(first.portfolio.primaryPlan).toEqual(second.portfolio.primaryPlan);
    expect(first.portfolio.primaryPlan?.commitment).toBe(1);
  });

  it('keeps modernization bounded and non-spatial', () => {
    const result = refreshMajorCivPortfolio(context({
      modernization: {
        bestTrainableStrength: 100,
        deployedStrength: 10,
        actorEra: 2,
        globalEra: 5,
        knownRivalMaxStrength: 100,
        obsoleteUnitShare: 0.9,
        treasuryCanAct: false,
      },
    }));

    expect(result.portfolio.modernizationDemand).toBeGreaterThan(50);
    expect(result.portfolio.modernizationDemand).toBeLessThanOrEqual(100);
    expect(result.portfolio.primaryPlan?.target.kind).not.toBe('region');
  });
});
