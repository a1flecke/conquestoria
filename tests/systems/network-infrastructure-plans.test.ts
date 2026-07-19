import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getNetworkCityYieldBonus } from '@/systems/network-infrastructure-plans';

describe('network infrastructure plans', () => {
  it('returns Fabrication Sprint from an active city-sourced plan using the unmodified base cap', () => {
    const state = createNewGame('rome', 'fabrication-bonus', 'small');
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId: 'city-1' }, target: { kind: 'city', cityId: 'city-1' },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkCityYieldBonus(state, 'city-1', { production: 50, science: 0 })).toEqual({ production: 4, science: 0 });
  });
});
