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

  it('preserves live barbarian assignments owned through a camp mapping', () => {
    const state = makeState();
    const unitId = state.civilizations.player.units[0]!;
    state.units[unitId].owner = 'barbarian';
    state.barbarianCamps['camp-purposeful'] = {
      id: 'camp-purposeful',
      position: state.units[unitId].position,
      strength: 5,
      spawnCooldown: 3,
    };
    state.opponentAI!.barbarianHomeCampByUnitId[unitId] = 'camp-purposeful';
    state.opponentAI!.barbarianCamps['camp-purposeful'] = makePlan({
      id: 'barbarian-plan:camp-purposeful',
      actorId: 'camp-purposeful',
      objective: 'raid',
      target: {
        kind: 'resource',
        resource: 'iron',
        position: { q: 3, r: 3 },
      },
      assignedUnitIds: [unitId],
    });

    const normalized = normalizeOpponentAIState(state);

    expect(normalized.opponentAI!.barbarianCamps['camp-purposeful'].assignedUnitIds)
      .toEqual([unitId]);
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

  it('normalizes persisted portfolio turn markers while preserving the never-run sentinel', () => {
    const state = makeState();
    state.opponentAI!.majorCivs['ai-1'].lastPlannedTurn = -4.8;
    state.opponentAI!.majorCivs['ai-1'].lastExecutedTurn = 7.9;

    const portfolio = normalizeOpponentAIState(state).opponentAI!.majorCivs['ai-1'];

    expect(portfolio.lastPlannedTurn).toBe(-1);
    expect(portfolio.lastExecutedTurn).toBe(7);
  });

  it('defaults missing saved turn markers to the never-run sentinel', () => {
    const state = makeState();
    const saved = state.opponentAI!.majorCivs['ai-1'] as unknown as Record<string, unknown>;
    delete saved.lastPlannedTurn;
    delete saved.lastExecutedTurn;

    const portfolio = normalizeOpponentAIState(state).opponentAI!.majorCivs['ai-1'];

    expect(portfolio.lastPlannedTurn).toBe(-1);
    expect(portfolio.lastExecutedTurn).toBe(-1);
  });

  it('bounds saved role demand and rejects mislabeled defense plans', () => {
    const state = makeState();
    const aiUnitId = state.civilizations['ai-1'].units[0]!;
    const ownCity = structuredClone(Object.values(state.cities)[0]);
    ownCity.id = 'ai-owned-city';
    ownCity.owner = 'ai-1';
    state.cities[ownCity.id] = ownCity;
    state.civilizations['ai-1'].cities.push(ownCity.id);
    state.opponentAI!.majorCivs['ai-1'].primaryPlan = makePlan({
      requiredRoles: { frontline: Number.MAX_SAFE_INTEGER },
      assignedUnitIds: [aiUnitId, 7 as unknown as string],
    });
    state.opponentAI!.majorCivs['ai-1'].defensePlansByCityId[ownCity.id] = makePlan({
      objective: 'capture',
      target: {
        kind: 'city',
        id: ownCity.id,
        lastKnownPosition: ownCity.position,
      },
    });

    const portfolio = normalizeOpponentAIState(state).opponentAI!.majorCivs['ai-1'];

    expect(portfolio.primaryPlan?.requiredRoles.frontline).toBeLessThanOrEqual(32);
    expect(portfolio.primaryPlan?.assignedUnitIds).toEqual([aiUnitId]);
    expect(portfolio.defensePlansByCityId).toEqual({});
  });

  it('strips transient and unknown fields from normalized saved plans', () => {
    const state = makeState();
    const savedPlan = state.opponentAI!.majorCivs['ai-1'].primaryPlan as
      AIStrategicPlan & { traces?: unknown; cachedPath?: unknown };
    savedPlan.traces = [{ selectedId: 'private-debug-data' }];
    savedPlan.cachedPath = [{ q: 1, r: 1 }];

    const plan = normalizeOpponentAIState(state).opponentAI!.majorCivs['ai-1'].primaryPlan as
      AIStrategicPlan & { traces?: unknown; cachedPath?: unknown };

    expect(plan.traces).toBeUndefined();
    expect(plan.cachedPath).toBeUndefined();
  });

  it('normalizes living-human ledger owners while preserving valid threat IDs for resolution', () => {
    const state = makeState();
    const player = state.civilizations.player;
    state.civilizations['player-2'] = {
      ...structuredClone(player),
      id: 'player-2',
      name: 'Second Player',
      cities: [],
      units: [],
    };
    state.civilizations['dead-human'] = {
      ...structuredClone(player),
      id: 'dead-human',
      name: 'Dead Player',
      cities: [],
      units: [],
      isEliminated: true,
    };
    state.barbarianCamps.live = {
      id: 'live',
      position: { q: 1, r: 1 },
      strength: 5,
      spawnCooldown: 1,
    };
    state.opponentAI!.pressureByHuman = {
      player: {
        activeIndependentThreatIds: [
          'barbarian:missing',
          'barbarian:live',
          'pirate:missing',
          'beast:missing',
          'major:ai-1',
          'barbarian:live',
        ],
        recoveryUntilTurn: Number.NaN,
        lastResolvedThreatTurn: Number.NaN,
        lastWarningTurnByKey: { valid: 3, invalid: Number.NaN },
        lastStrategicAudioTurn: Number.NaN,
      },
      'dead-human': {
        activeIndependentThreatIds: [],
        recoveryUntilTurn: 0,
        lastResolvedThreatTurn: null,
        lastWarningTurnByKey: {},
        lastStrategicAudioTurn: null,
      },
    };
    const snapshot = structuredClone(state);

    const normalized = normalizeOpponentAIState(state);

    expect(Object.keys(normalized.opponentAI!.pressureByHuman)).toEqual(['player', 'player-2']);
    expect(normalized.opponentAI!.pressureByHuman.player).toEqual({
      activeIndependentThreatIds: [
        'barbarian:live',
        'barbarian:missing',
        'beast:missing',
        'pirate:missing',
      ],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: { valid: 3 },
      lastStrategicAudioTurn: null,
    });
    expect(normalized.opponentAI!.pressureByHuman['player-2'].activeIndependentThreatIds)
      .toEqual([]);
    expect(state).toEqual(snapshot);
  });
});
