import { describe, expect, it } from 'vitest';
import {
  createEmptyAutonomyCivState,
  type NetworkPlan,
} from '@/core/autonomy-state';
import { createNewGame } from '@/core/game-state';

describe('autonomy network state', () => {
  it('creates an independent empty serializable state for a civilization', () => {
    const first = createEmptyAutonomyCivState();
    const second = createEmptyAutonomyCivState();

    first.plans['network-plan-1'] = {
      id: 'network-plan-1',
      ownerCivId: 'player',
      definitionId: 'exploit',
      sourceUnitId: 'unit-1',
      target: { kind: 'city', cityId: 'city-2' },
      status: 'preparing',
      createdTurn: 12,
      nextResolutionTurn: 13,
      warnedTurn: null,
    };

    expect(second).toEqual({ plans: {}, detections: {} });
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('keeps closed target data rather than a live target reference', () => {
    const plan: NetworkPlan = {
      id: 'network-plan-8',
      ownerCivId: 'ai-1',
      definitionId: 'harden',
      sourceUnitId: 'unit-4',
      target: { kind: 'city', cityId: 'city-3' },
      status: 'active',
      createdTurn: 9,
      nextResolutionTurn: 10,
      warnedTurn: null,
    };

    expect(plan.target).toEqual({ kind: 'city', cityId: 'city-3' });
    expect(Object.keys(plan.target)).toEqual(['kind', 'cityId']);
  });

  it('initializes independent empty autonomy records for every new civilization', () => {
    const state = createNewGame('rome', 'autonomy-state-new-game', 'small');

    expect(state.autonomyByCiv).toEqual(Object.fromEntries(
      Object.keys(state.civilizations).map(civId => [civId, { plans: {}, detections: {} }]),
    ));
    expect(state.networkCivicPressureByCity).toEqual({});
  });
});
