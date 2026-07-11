import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { processAIResourceMarketplace } from '@/ai/ai-resource-marketplace';

describe('processAIResourceMarketplace', () => {
  it('buys a missing hard input for an otherwise eligible idle-city candidate', () => {
    const state = createNewGame(undefined, 'ai-resource-candidate', 'small');
    const ai = state.civilizations['ai-1'];
    const player = state.civilizations.player;
    const aiSettler = ai.units.map(id => state.units[id]).find(unit => unit?.type === 'settler');
    const playerSettler = player.units.map(id => state.units[id]).find(unit => unit?.type === 'settler');
    if (!aiSettler || !playerSettler || !state.marketplace) throw new Error('missing setup state');

    const aiCity = foundCity(ai.id, aiSettler.position, state.map, state.idCounters);
    aiCity.productionProgress = 180;
    state.cities[aiCity.id] = aiCity;
    ai.cities = [aiCity.id];
    ai.gold = 100;
    ai.techState.completed = ['petroleum-industry'];
    state.map.tiles[hexKey(aiCity.position)].resource = null;

    const sellerCity = foundCity(player.id, playerSettler.position, state.map, state.idCounters);
    state.cities[sellerCity.id] = sellerCity;
    player.cities = [sellerCity.id];
    player.techState.completed = ['petroleum-industry'];
    const sellerTile = state.map.tiles[hexKey(sellerCity.position)];
    sellerTile.resource = 'oil';
    sellerTile.improvement = 'none';
    sellerTile.improvementTurnsLeft = 0;
    ai.diplomacy.relationships[player.id] = 10;
    state.marketplace.prices.oil = 12;

    const result = processAIResourceMarketplace(state, ai.id);

    expect(result.marketplace?.purchasedResources).toContainEqual({
      civId: ai.id,
      resource: 'oil',
      expiresOnTurn: state.turn + 10,
    });
    expect(result.civilizations[ai.id].gold).toBe(64);
  });
});
