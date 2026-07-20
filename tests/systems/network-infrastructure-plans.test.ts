import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  getNetworkCityYieldBonus,
  getNetworkRouteGoldBonus,
  getNetworkUnitVisionBonus,
} from '@/systems/network-infrastructure-plans';

function addPlayerCity(state: ReturnType<typeof createNewGame>): string {
  const unit = state.units[state.civilizations.player.units[0]];
  const city = foundCity('player', unit.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  return city.id;
}

describe('network infrastructure plans', () => {
  it('returns Fabrication Sprint from an active city-sourced plan using the unmodified base cap', () => {
    const state = createNewGame('rome', 'fabrication-bonus', 'small');
    const cityId = addPlayerCity(state);
    state.cities[cityId].buildings = ['smart_grid'];
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkCityYieldBonus(state, cityId, { production: 50, science: 0 })).toEqual({ production: 4, science: 0 });
  });

  it('adds Logistics Routing gold to only the first two stable routes from its target city', () => {
    const state = createNewGame('rome', 'logistics-bonus', 'small');
    const cityId = addPlayerCity(state);
    state.cities[cityId].buildings = ['automated_port'];
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'logistics-routing',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };
    const route = (id: string) => ({ id, fromCityId: cityId, toCityId: cityId, goldPerTrip: 3, turnsPerTrip: 1 });
    state.marketplace!.tradeRoutes = [route('route-c'), route('route-a'), route('route-b')];

    expect(getNetworkRouteGoldBonus(state, state.marketplace!.tradeRoutes[0])).toBe(0);
    expect(getNetworkRouteGoldBonus(state, state.marketplace!.tradeRoutes[1])).toBe(1);
    expect(getNetworkRouteGoldBonus(state, state.marketplace!.tradeRoutes[2])).toBe(1);
  });

  it('adds Survey Grid vision only to its explicitly linked friendly units', () => {
    const state = createNewGame('rome', 'survey-vision', 'small');
    const cityId = addPlayerCity(state);
    const unitId = state.civilizations.player.units[0];
    state.cities[cityId].buildings = ['space_center'];
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'survey-grid',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      linkedUnitIds: [unitId],
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkUnitVisionBonus(state, unitId)).toBe(1);
    expect(getNetworkUnitVisionBonus(state, 'not-linked')).toBe(0);
  });

  it('adds Lunar Gateway vision only to an owned autonomous air unit', () => {
    const state = createNewGame('rome', 'lunar-vision', 'small');
    const unitId = state.civilizations.player.units[0];
    state.units[unitId] = { ...state.units[unitId], type: 'combat_drone' };
    state.completedLegendaryWonders = { 'lunar-gateway': { ownerId: 'player', cityId: 'city', turnCompleted: state.turn } };

    expect(getNetworkUnitVisionBonus(state, unitId)).toBe(1);
  });

  it('uses the enhanced Fabrication cap only for the resolved Surge turn', () => {
    const state = createNewGame('rome', 'fabrication-surge', 'small');
    const cityId = addPlayerCity(state);
    state.cities[cityId].buildings = ['smart_grid'];
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId }, surgeResolutionTurn: state.turn,
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkCityYieldBonus(state, cityId, { production: 50, science: 0 })).toEqual({ production: 6, science: 0 });
    expect(getNetworkCityYieldBonus({ ...state, turn: state.turn + 1 }, cityId, { production: 50, science: 0 })).toEqual({ production: 4, science: 0 });
  });

  it('stops a city bonus immediately when its source city is captured before turn cleanup runs', () => {
    const state = createNewGame('rome', 'captured-network-source', 'small');
    const sourceCityId = addPlayerCity(state);
    const targetCityId = addPlayerCity(state);
    state.cities[sourceCityId].buildings = ['smart_grid'];
    state.autonomyByCiv!.player.plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId: sourceCityId }, target: { kind: 'city', cityId: targetCityId },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };
    state.cities[sourceCityId].owner = 'ai-1';

    expect(getNetworkCityYieldBonus(state, targetCityId, { production: 50, science: 0 }))
      .toEqual({ production: 0, science: 0 });
  });
});
