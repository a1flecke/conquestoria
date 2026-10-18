import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { processAIResourceMarketplace } from '@/ai/ai-resource-marketplace';

describe('processAIResourceMarketplace — MR01 containment (#1498)', () => {
  it('does not buy instant resource access even when every legacy purchase condition holds', () => {
    // Widest-open fixture, kept from the pre-containment regression: the AI has gold, the required
    // technology, a missing hard input on an otherwise eligible candidate, a peaceful known seller
    // with the resource, and a cost that fits the old 10-turn window. Before MR01 this bought.
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

    // The AI consults the same canonical denial the human paths use, so it buys nothing: no
    // purchased access is recorded and the treasury is untouched (no compensating free resources).
    expect(result).toBe(state);
    expect(result.marketplace?.purchasedResources ?? []).toEqual([]);
    expect(result.civilizations[ai.id].gold).toBe(100);
  });
});
