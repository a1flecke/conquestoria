import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { getAIProcurementTerms, processAIResourceMarketplace } from '@/ai/ai-resource-marketplace';
import { refreshMarketOffers, setCommerceResourcePolicy } from '@/systems/resource-market-offers';
import { resourceGoodId } from '@/systems/trade-good-definitions';

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
    aiCity.productionQueue = ['steel_mill'];
    state.cities[aiCity.id] = aiCity;
    ai.cities = [aiCity.id];
    ai.gold = 100;
    ai.techState.completed = ['bronze-working', 'steel-production'];
    state.map.tiles[hexKey(aiCity.position)].resource = null;

    const sellerCity = foundCity(player.id, playerSettler.position, state.map, state.idCounters);
    state.cities[sellerCity.id] = sellerCity;
    player.cities = [sellerCity.id];
    player.techState.completed = ['bronze-working', 'steel-production'];
    const sellerTile = state.map.tiles[hexKey(sellerCity.position)];
    sellerTile.resource = 'iron';
    sellerTile.improvement = 'none';
    sellerTile.improvementTurnsLeft = 0;
    ai.diplomacy.relationships[player.id] = 10;
    state.marketplace.prices.iron = 8;

    const result = processAIResourceMarketplace(state, ai.id);

    // #1509 MR12: the AI writes only a conservative standing procurement policy; it buys nothing
    // until a real trader loads at a permitted supplier.
    expect(result).not.toBe(state);
    expect(result.marketplace?.purchasedResources ?? []).toEqual([]);
    expect(result.civilizations[ai.id].gold).toBe(100);
    expect(result.commerceMarket?.procurementByCiv?.[ai.id]).toMatchObject({
      maxUnitPrice: 50,
      treasuryFloor: 50,
      roundBudget: 33,
    });

    // A permitted, knowledgeable supplier makes the same conservative terms available to the route
    // the AI establishes later; no stock moves yet.
    ai.diplomacy.treaties = [{ type: 'trade_agreement', civA: ai.id, civB: player.id, turnsRemaining: -1 }];
    result.materialReservesByCiv = {
      [player.id]: {
        balances: { [resourceGoodId('iron')]: { native: 20, imported: 0 } },
        reservations: [],
        incoming: [],
      },
    };
    const withPolicy = setCommerceResourcePolicy(result, {
      civId: player.id,
      goodId: resourceGoodId('iron'),
      protectedReserve: 0,
      partnerCivIds: [ai.id],
    });
    const refreshed = refreshMarketOffers(withPolicy);
    const terms = getAIProcurementTerms(refreshed, ai.id, sellerCity.id);
    expect(terms?.orders[0]).toMatchObject({
      goodId: resourceGoodId('iron'),
      targetQuantity: 10,
    });
  });
});
