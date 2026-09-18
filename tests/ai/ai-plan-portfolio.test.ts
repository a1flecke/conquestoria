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
    ownedCityIds: new Set<string>(),
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

  it('refreshes a retained plan\'s target position from the matching candidate (repel-plan staleness bug)', () => {
    // Found investigating #1107's Task 7 long-horizon verification: `repel` plans
    // (crisisDispatchPlanCandidates -- pirates/stampedes/rogue-elephant-hosts) target
    // a MOVING unit. Every round, a fresh candidate is generated with the target's
    // CURRENT position -- but the retention branch below only ever refreshed
    // reasonCodes/requiredRoles/commitment/lastProgressTurn from the matching
    // candidate, never `target` itself. A retained repel plan's lastKnownPosition
    // stayed frozen at plan-creation time while the real unit kept moving, until the
    // actor's fog eventually forgot the stale tile -- at which point
    // `assertPlanInvariants`' targetWasPerceived check (a real information-safety
    // invariant, not just a test nicety) correctly flagged the plan as having an
    // "unearned exact target": the AI was tracking a position it could no longer
    // actually see or remember. Reproduced against the real long-horizon matrix in
    // lh-standard-medium/lh-hotseat-medium; not caused by #1107's own coastal-recovery
    // change, which never touches unit targets -- exposed by it via a different game
    // trajectory, not introduced by it.
    const staleUnitPlan = plan('repel-raider', {
      objective: 'repel',
      target: { kind: 'unit', id: 'raider-1', lastKnownPosition: { q: 1, r: 1 } },
      commitment: 0.25,
    });
    const freshCandidate: AIPlanCandidate = {
      objective: 'repel',
      target: { kind: 'unit', id: 'raider-1', lastKnownPosition: { q: 9, r: 9 } },
      theaterId: 'local:9,9',
      score: 50,
      reasonCodes: ['urgent-defense'],
      requiredRoles: { 'naval-combat': 1 },
      commitment: 0.25,
      targetValid: true,
      reasonValid: true,
      expectedLossRatio: 0,
      progress: false,
    };

    const result = refreshMajorCivPortfolio(context({
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: staleUnitPlan },
      candidates: [freshCandidate],
    }));

    expect(result.portfolio.primaryPlan?.id).toBe('repel-raider');
    expect(result.portfolio.primaryPlan?.target).toMatchObject({
      kind: 'unit',
      id: 'raider-1',
      lastKnownPosition: { q: 9, r: 9 },
    });
    expect(result.portfolio.primaryPlan?.theaterId).toBe('local:9,9');
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

  it('does not retain a defense plan beyond its explicit expiry', () => {
    const expired = plan('defend-expired', {
      objective: 'defend',
      target: { kind: 'city', id: 'old', lastKnownPosition: { q: 1, r: 1 } },
      expiresAfterTurn: 9,
      lastProgressTurn: 9,
    });

    const result = refreshMajorCivPortfolio(context({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        defensePlansByCityId: { old: expired },
      },
      cityThreats: [{
        cityId: 'old',
        position: { q: 1, r: 1 },
        theaterId: 'home',
        travelTurns: 2,
        alreadyAttackedTerritory: true,
        captureRisk: 80,
        hostileStrength: 30,
        isCapital: false,
        isLastCity: false,
        threatStillValid: true,
      }],
    }));

    expect(result.portfolio.defensePlansByCityId.old?.id).not.toBe('defend-expired');
    expect(result.portfolio.defensePlansByCityId.old?.createdTurn).toBe(10);
  });

  it('derives receding-defense grace from persisted progress when no counter is supplied', () => {
    const recent = plan('defend-recent', {
      objective: 'defend',
      target: { kind: 'city', id: 'old', lastKnownPosition: { q: 1, r: 1 } },
      lastProgressTurn: 9,
    });
    const stale = { ...recent, id: 'defend-stale', lastProgressTurn: 8 };
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
    };

    expect(refreshMajorCivPortfolio(context({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        defensePlansByCityId: { old: recent },
      },
      cityThreats: [threat],
    })).portfolio.defensePlansByCityId.old).toBeDefined();
    expect(refreshMajorCivPortfolio(context({
      portfolio: {
        ...createEmptyMajorCivPortfolio(),
        defensePlansByCityId: { old: stale },
      },
      cityThreats: [threat],
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

  describe('#1088 consolidating-plan retention', () => {
    // #1088: traced against a real domination campaign -- the round after a capture
    // plan captures its target and enters 'consolidating', objectiveCandidates() never
    // emits another 'capture' candidate for that same city (it's owned now), so the
    // pre-fix retention rule (which requires a live matching candidate) discarded the
    // plan and replaced it with whatever scored highest -- typically a brand-new,
    // distant objective -- leaving the just-captured city with zero assigned
    // defenders and no grace period to heal/garrison/hold.
    const consolidatingPlan = (overrides: Partial<AIStrategicPlan> = {}) => plan('capture-city5', {
      phase: 'consolidating',
      target: { kind: 'city', id: 'city5', lastKnownPosition: { q: 3, r: 2 } },
      assignedUnitIds: ['tank-1', 'tank-2'],
      lastProgressTurn: 10,
      ...overrides,
    });

    it('retains a consolidating capture plan with no matching opportunity candidate', () => {
      const result = refreshMajorCivPortfolio(context({
        portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: consolidatingPlan() },
        // No 'city5' candidate at all -- objectiveCandidates() never emits one for a
        // city the civ already owns -- but a fresh, higher-scoring opportunity exists
        // elsewhere, which is exactly what displaced the plan pre-fix.
        candidates: [candidate('city7', 90)],
        ownedCityIds: new Set(['city5']),
      }));

      expect(result.portfolio.primaryPlan?.id).toBe('capture-city5');
      expect(result.portfolio.primaryPlan?.phase).toBe('consolidating');
      expect(result.portfolio.primaryPlan?.target).toMatchObject({ kind: 'city', id: 'city5' });
      expect(result.portfolio.primaryPlan?.assignedUnitIds).toEqual(['tank-1', 'tank-2']);
    });

    it('does not retain a consolidating plan once its city is lost to recapture', () => {
      const result = refreshMajorCivPortfolio(context({
        portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: consolidatingPlan() },
        candidates: [candidate('city7', 90)],
        // city5 is NOT in ownedCityIds -- lost to a counterattack mid-consolidation.
        ownedCityIds: new Set<string>(),
      }));

      expect(result.portfolio.primaryPlan?.id).not.toBe('capture-city5');
      expect(result.portfolio.primaryPlan?.target).toMatchObject({ kind: 'city', id: 'city7' });
    });

    it('still expires a consolidating plan past its explicit expiresAfterTurn', () => {
      const result = refreshMajorCivPortfolio(context({
        portfolio: {
          ...createEmptyMajorCivPortfolio(),
          primaryPlan: consolidatingPlan({ expiresAfterTurn: 9 }),
        },
        candidates: [candidate('city7', 90)],
        ownedCityIds: new Set(['city5']),
        turn: 10,
      }));

      expect(result.portfolio.primaryPlan?.id).not.toBe('capture-city5');
    });

    it('still enforces the unacceptable-loss-ratio cap when a matching candidate does exist', () => {
      // A plan can be BOTH consolidating AND matched by a fresh candidate (e.g. the
      // city was lost and immediately re-targeted for recapture) -- the loss-ratio
      // safety valve must still apply in that case.
      const result = refreshMajorCivPortfolio(context({
        portfolio: {
          ...createEmptyMajorCivPortfolio(),
          primaryPlan: consolidatingPlan({
            target: { kind: 'city', id: 'close', lastKnownPosition: { q: 3, r: 2 } },
          }),
        },
        candidates: [
          candidate('close', 40, { expectedLossRatio: 1.8 }),
          candidate('fallback', 30),
        ],
        ownedCityIds: new Set<string>(),
      }));

      expect(result.portfolio.primaryPlan?.target).toMatchObject({ kind: 'city', id: 'fallback' });
    });

    it('does not exempt a non-consolidating plan targeting an owned city', () => {
      // Sanity check that the exemption is phase-gated, not just ownership-gated --
      // an 'advancing' plan against a city the civ somehow already owns (e.g. a stale
      // fixture) must still require a matching candidate like any other plan.
      const result = refreshMajorCivPortfolio(context({
        portfolio: {
          ...createEmptyMajorCivPortfolio(),
          primaryPlan: consolidatingPlan({ phase: 'advancing' }),
        },
        candidates: [candidate('city7', 90)],
        ownedCityIds: new Set(['city5']),
      }));

      expect(result.portfolio.primaryPlan?.id).not.toBe('capture-city5');
    });

    it('lets the retained plan be reached deterministically twice in a row', () => {
      const built = () => refreshMajorCivPortfolio(context({
        portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: consolidatingPlan() },
        candidates: [candidate('city7', 90)],
        ownedCityIds: new Set(['city5']),
      }));

      expect(built().portfolio.primaryPlan).toEqual(built().portfolio.primaryPlan);
    });
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

describe('#1064 settle-plan stability', () => {
  // Named to avoid shadowing this file's module-level `candidate` helper, which
  // builds a capture candidate.
  const settlePlan = (anchor: { q: number; r: number }, createdTurn: number) => ({
    id: `ai-plan:ai-1:expand:region:settle:${anchor.q},${anchor.r}:${createdTurn}`,
    actorId: 'ai-1',
    objective: 'expand' as const,
    target: { kind: 'region' as const, id: `settle:${anchor.q},${anchor.r}`, anchor },
    theaterId: `local:${anchor.q},${anchor.r}`,
    phase: 'advancing' as const,
    reasonCodes: ['nearby-opportunity' as const],
    commitment: 0.25,
    createdTurn,
    reconsiderAfterTurn: createdTurn + 3,
    expiresAfterTurn: createdTurn + 12,
    lastProgressTurn: createdTurn + 2,
    requiredRoles: { settlement: 1 },
    assignedUnitIds: ['settler-1'],
  });

  const expandCandidate = (anchor: { q: number; r: number }, score: number) => ({
    objective: 'expand' as const,
    target: { kind: 'region' as const, id: `settle:${anchor.q},${anchor.r}`, anchor },
    theaterId: `local:${anchor.q},${anchor.r}`,
    score,
    reasonCodes: ['nearby-opportunity' as const],
    requiredRoles: { settlement: 1 },
    commitment: 0.25,
    targetValid: true,
    reasonValid: true,
    expectedLossRatio: 0,
    progress: false,
  });

  it('keeps the incumbent site when a rival site is only marginally better', () => {
    const current = settlePlan({ q: 6, r: 0 }, 10);
    const result = refreshMajorCivPortfolio({
      actorId: 'ai-1',
      turn: 12,
      actorEliminated: false,
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: current },
      // +5 is well inside switchingBonus (10 + 20 * 0.25 = 15).
      candidates: [expandCandidate({ q: 6, r: 0 }, 40), expandCandidate({ q: 9, r: 3 }, 45)],
      cityThreats: [],
      ownedCityIds: new Set<string>(),
      modernization: {
        bestTrainableStrength: 10, deployedStrength: 10, actorEra: 1, globalEra: 1,
        knownRivalMaxStrength: 0, obsoleteUnitShare: 0, treasuryCanAct: true,
      },
    });

    expect(result.portfolio.primaryPlan?.target).toMatchObject({ id: 'settle:6,0' });
  });

  it('drops the plan when its site stops qualifying', () => {
    // Someone founded nearby, so the site no longer produces a candidate. Note
    // targetStillValid alone does NOT catch this -- for a region target it only checks
    // that the tile exists -- so the candidate-driven path is what does the work.
    const current = settlePlan({ q: 6, r: 0 }, 10);
    const result = refreshMajorCivPortfolio({
      actorId: 'ai-1',
      turn: 12,
      actorEliminated: false,
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: current },
      candidates: [expandCandidate({ q: 12, r: 4 }, 30)],
      cityThreats: [],
      ownedCityIds: new Set<string>(),
      modernization: {
        bestTrainableStrength: 10, deployedStrength: 10, actorEra: 1, globalEra: 1,
        knownRivalMaxStrength: 0, obsoleteUnitShare: 0, treasuryCanAct: true,
      },
    });

    expect(result.portfolio.primaryPlan?.target).toMatchObject({ id: 'settle:12,4' });
  });
});
