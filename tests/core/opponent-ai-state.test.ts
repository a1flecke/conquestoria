import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  createEmptyOpponentAIState,
  createEmptyMajorCivPlanPortfolio,
  normalizeOpponentAIState,
} from '@/core/opponent-ai-state';
import type { AIStrategicPlan, GameState } from '@/core/types';

function makePlan(overrides: Partial<AIStrategicPlan> = {}): AIStrategicPlan {
  return {
    id: 'ai-plan:ai-1:capture:city:foreign-city:1',
    actorId: 'ai-1',
    objective: 'capture',
    target: {
      kind: 'city',
      id: 'foreign-city',
      lastKnownPosition: { q: 8, r: 4 },
    },
    theaterId: 'region:8:4',
    phase: 'mobilizing',
    reasonCodes: ['nearby-opportunity'],
    commitment: 0.5,
    createdTurn: 1,
    reconsiderAfterTurn: 3,
    expiresAfterTurn: 8,
    lastProgressTurn: 1,
    requiredRoles: { capture: 1 },
    assignedUnitIds: [],
    ...overrides,
  };
}

function makeState(): GameState {
  const state = createNewGame({
    civType: 'rome',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Normalization',
    seed: 'opponent-ai-normalization',
  });
  const aiUnitIds = state.civilizations['ai-1'].units;
  state.opponentAI = createEmptyOpponentAIState();
  state.opponentAI.majorCivs['ai-1'] = {
    primaryPlan: makePlan({ assignedUnitIds: [aiUnitIds[0]!, 'missing', state.civilizations.player.units[0]!] }),
    defensePlansByCityId: {},
    upgradeRoutesByUnitId: {
      [aiUnitIds[1]!]: { cityId: 'missing-city', createdTurn: 1 },
      missing: { cityId: 'missing-city', createdTurn: 1 },
    },
    modernizationDemand: 0,
    researchTargetTechId: null,
    lastPlannedTurn: 1,
    lastExecutedTurn: 0,
  };
  return state;
}

describe('opponent AI state normalization', () => {
  it('creates a serializable empty versioned state', () => {
    expect(createEmptyOpponentAIState()).toEqual({
      version: 1,
      migrationGraceRoundsRemaining: 0,
      majorCivs: {},
      barbarianCamps: {},
      barbarianHomeCampByUnitId: {},
      minorCivs: {},
      pressureByHuman: {},
      lastPlannedRound: null,
      lastProcessedRound: null,
      lastFinalizedRound: null,
    });
  });

  it('creates compact portfolio state without transient planner data', () => {
    const portfolio = createEmptyMajorCivPlanPortfolio();

    expect(portfolio).toEqual({
      primaryPlan: null,
      defensePlansByCityId: {},
      upgradeRoutesByUnitId: {},
      modernizationDemand: 0,
      researchTargetTechId: null,
      lastPlannedTurn: -1,
      lastExecutedTurn: -1,
    });
    expect((portfolio as typeof portfolio & { traces?: unknown }).traces).toBeUndefined();
  });

  it('removes dead or wrong-owner assignments without mutating the loaded object', () => {
    const legacy = makeState();
    const snapshot = structuredClone(legacy);

    const normalized = normalizeOpponentAIState(legacy);

    expect(normalized.opponentAI!.majorCivs['ai-1'].primaryPlan!.assignedUnitIds)
      .toEqual([legacy.civilizations['ai-1'].units[0]]);
    expect(normalized.opponentAI!.majorCivs['ai-1'].upgradeRoutesByUnitId).toEqual({});
    expect(legacy).toEqual(snapshot);
    expect(normalizeOpponentAIState(normalized)).toEqual(normalized);
  });

  it('keeps a remembered foreign target when the live city is absent', () => {
    const state = makeState();

    const normalized = normalizeOpponentAIState(state);

    expect(normalized.opponentAI!.majorCivs['ai-1'].primaryPlan?.target)
      .toEqual(expect.objectContaining({ kind: 'city', id: 'foreign-city' }));
  });

  it('removes stale barbarian home mappings and eliminated actor portfolios', () => {
    const state = makeState();
    const aiUnitId = state.civilizations['ai-1'].units[0]!;
    state.opponentAI!.barbarianHomeCampByUnitId = {
      missing: 'missing-camp',
      [aiUnitId]: 'missing-camp',
    };
    state.civilizations['ai-1'].isEliminated = true;

    const normalized = normalizeOpponentAIState(state);

    expect(normalized.opponentAI!.barbarianHomeCampByUnitId).toEqual({});
    expect(normalized.opponentAI!.majorCivs['ai-1']).toBeUndefined();
  });

  it('rebuilds unknown versions while retaining the campaign challenge', () => {
    const state = makeState();
    state.opponentChallenge = 'explorer';
    state.opponentAI = { ...state.opponentAI!, version: 999 as 1 };

    const normalized = normalizeOpponentAIState(state);

    expect(normalized.opponentChallenge).toBe('explorer');
    expect(normalized.opponentAI).toEqual(createEmptyOpponentAIState());
  });

  it('rejects malformed plan enums and unsafe upgrade-route records', () => {
    const state = makeState();
    state.opponentAI!.majorCivs['ai-1'].primaryPlan = makePlan({
      objective: 'teleport' as AIStrategicPlan['objective'],
    });
    (state.opponentAI!.majorCivs['ai-1'].upgradeRoutesByUnitId as Record<string, unknown>)
      .broken = null;
    state.opponentAI!.migrationGraceRoundsRemaining = 999;

    expect(() => normalizeOpponentAIState(state)).not.toThrow();
    const normalized = normalizeOpponentAIState(state);
    expect(normalized.opponentAI!.majorCivs['ai-1'].primaryPlan).toBeNull();
    expect(normalized.opponentAI!.majorCivs['ai-1'].upgradeRoutesByUnitId).toEqual({});
    expect(normalized.opponentAI!.migrationGraceRoundsRemaining).toBe(2);
  });
});
