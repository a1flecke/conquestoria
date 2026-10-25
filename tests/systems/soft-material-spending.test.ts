import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { selectSoftMaterialTerms } from '@/systems/soft-material-terms';
import {
  beginCityMaterialOccurrence,
  releaseCityMaterialCommitment,
  spendActiveMaterialRecipe,
} from '@/systems/city-production-materials';
import { getProductionCostForCivItem } from '@/systems/production-cost-context';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { EventBus } from '@/core/event-bus';
import { getFreeQuantity } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1507 MR10 — finite soft-material terms.
 *
 * A soft advantage is optional: it needs a real, finite stock allotment (or an
 * eligible Circular Manufacturing substitution), and one unit can never unlock
 * an unlimited number of discounts. Normal-cost production remains available.
 */

const coal = resourceGoodId('coal');

function cityWorld(options: { coalStock?: number; queue: string[] }): { state: GameState; cityId: string } {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed: `soft-${options.queue.join('-')}`, gameTitle: 'soft' });
  const civ = state.civilizations.player;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler');
  if (!settler) throw new Error('no settler');
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  city.id = 'soft-city';
  city.productionQueue = [...options.queue];
  city.productionProgress = 0;
  city.productionMaterials = { queueRevision: 0, activeOccurrence: 0, commitment: null, softTerms: null };
  state.cities[city.id] = city;
  civ.cities = [city.id];
  civ.units = civ.units.filter(id => id !== settler.id);
  delete state.units[settler.id];
  civ.techState.completed = ['steam-power', 'steel-production'];
  civ.techState.currentResearch = 'natural-philosophy';
  state.currentPlayer = civ.id;
  state.marketplace = {
    ...(state.marketplace ?? { prices: {}, priceHistory: {}, tradeRoutes: [] }),
    purchasedResources: [{ civId: civ.id, resource: 'coal', expiresOnTurn: state.turn + 10 }],
  } as NonNullable<GameState['marketplace']>;
  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    [civ.id]: {
      balances: options.coalStock ? { [coal]: { native: options.coalStock, imported: 0 } } : {},
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };
  return { state, cityId: city.id };
}

function state(options: {
  techs?: string[];
  coalStock?: number;
  coalAccess?: boolean;
  circular?: boolean;
  circularChoice?: string;
} = {}): GameState {
  const techs = options.techs ?? ['steam-power'];
  return {
    currentPlayer: 'player',
    turn: 10,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    cities: {},
    units: {},
    marketplace: {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
      purchasedResources: options.coalAccess
        ? [{ civId: 'player', resource: 'coal', expiresOnTurn: 30 }]
        : [],
    },
    civilizations: {
      player: {
        id: 'player',
        cities: [],
        units: [],
        isHuman: true,
        civType: 'generic',
        techState: { completed: techs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        gold: 100,
        diplomacy: { atWarWith: [] },
      },
    },
    materialReservesByCiv: {
      player: {
        balances: options.coalStock ? { [coal]: { native: options.coalStock, imported: 0 } } : {},
        reservations: [],
        incoming: [],
        lastAccruedTurn: -1,
      },
    },
    ...(options.circular
      ? {
        builtNationalProjects: { 'player:circular_manufacturing_network': { civId: 'player', cityId: 'c', eraBuilt: 1 } },
        nationalProjectChoices: { 'player:circular_manufacturing_network': options.circularChoice ?? 'aluminum' },
      }
      : {}),
  } as unknown as GameState;
}

describe('#1507 MR10 — finite soft-material selection', () => {
  it('selects a five-unit coal term when the stock and access are real', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 5, coalAccess: true }), 'player', 'factory');
    expect(selected).toMatchObject({
      multiplier: 0.8,
      rows: [{ goodId: coal, quantity: 5 }],
      substitutions: [],
    });
  });

  it('does not grant the discount with less than a full soft allotment', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 4, coalAccess: true }), 'player', 'factory');
    expect(selected).toMatchObject({ multiplier: 1, rows: [], substitutions: [] });
  });

  it('leaves normal-cost production available without any coal', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 0, coalAccess: false }), 'player', 'factory');
    expect(selected.multiplier).toBe(1);
    expect(selected.rows).toEqual([]);
  });

  it('uses Circular Manufacturing as a substitution without creating stock or a hard recipe row', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: [], circular: true, circularChoice: 'aluminum' }),
      'player',
      'jet_fighter',
    );
    expect(selected).toMatchObject({
      multiplier: 0.85,
      rows: [],
      substitutions: ['aluminum'],
    });
  });

  it('never lets the substitution satisfy a hard uranium weapon', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: ['nuclear-submarines'], circular: true, circularChoice: 'aluminum' }),
      'player',
      'missile_submarine',
    );
    expect(selected).toMatchObject({ multiplier: 1, rows: [], substitutions: [] });
  });

  it('prefers finite stock over substitution when both are available', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: ['steam-power'], coalStock: 5, coalAccess: true }),
      'player',
      'factory',
    );
    expect(selected.substitutions).toEqual([]);
    expect(selected.rows).toEqual([{ goodId: coal, quantity: 5 }]);
  });
});

describe('#1507 MR10 — frozen active soft terms', () => {
  it('reserves the finite coal allotment and freezes the active discount', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const activated = beginCityMaterialOccurrence(state, cityId);
    const city = activated.cities[cityId];

    expect(getFreeQuantity(activated.materialReservesByCiv!.player, coal)).toBe(0);
    expect(city.productionMaterials!.commitment?.softRows).toEqual([{ goodId: coal, quantity: 5 }]);
    expect(city.productionMaterials!.softTerms).toMatchObject({
      itemId: 'factory',
      multiplier: 0.8,
      rows: [{ goodId: coal, quantity: 5 }],
    });
  });

  it('leaves a second item without free coal at normal cost and no reservation', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory', 'factory'] });
    const activated = beginCityMaterialOccurrence(state, cityId);
    expect(activated.cities[cityId].productionMaterials!.softTerms?.multiplier).toBe(0.8);

    // Promote the second item: the first occurrence's stock is released, so the new head can use it.
    const next = beginCityMaterialOccurrence(
      { ...activated, cities: { ...activated.cities, [cityId]: { ...activated.cities[cityId], productionQueue: ['factory', 'factory'] } } },
      cityId,
    );
    expect(next.cities[cityId].productionMaterials!.softTerms?.multiplier).toBe(0.8);
  });

  it('returns the soft allotment on release and spends it exactly once on completion', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const activated = beginCityMaterialOccurrence(state, cityId);
    expect(activated.cities[cityId].productionMaterials!.commitment).not.toBeNull();

    const released = releaseCityMaterialCommitment(activated, cityId);
    expect(getFreeQuantity(released.materialReservesByCiv!.player, coal)).toBe(5);
    expect(released.cities[cityId].productionMaterials!.softTerms).toBeNull();

    const spent = spendActiveMaterialRecipe(activated, cityId);
    expect(spent.ok).toBe(true);
    expect(spent.state.materialReservesByCiv!.player.balances[coal]).toEqual({ native: 0, imported: 0 });
    const again = spendActiveMaterialRecipe(spent.state, cityId);
    expect(again.ok).toBe(true);
    expect(again.state.materialReservesByCiv!.player.balances[coal]).toEqual({ native: 0, imported: 0 });
  });

  it('lets only one of two active factories hold the same finite coal allotment', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const civ = state.civilizations.player;
    const second = {
      ...state.cities[cityId],
      id: 'soft-city-2',
      position: { q: state.cities[cityId].position.q + 4, r: state.cities[cityId].position.r },
    };
    state.cities[second.id] = second;
    civ.cities.push(second.id);
    state.cities[cityId] = { ...state.cities[cityId], productionQueue: ['factory'] };

    const first = beginCityMaterialOccurrence(state, cityId);
    const both = beginCityMaterialOccurrence(first, second.id);

    const firstTerm = both.cities[cityId].productionMaterials!.softTerms?.multiplier ?? 1;
    const secondTerm = both.cities[second.id].productionMaterials!.softTerms?.multiplier ?? 1;
    expect([firstTerm, secondTerm].filter(value => value < 1)).toHaveLength(1);
    expect(getFreeQuantity(both.materialReservesByCiv!.player, coal)).toBe(0);
  });

  it('keeps the frozen term when unrelated access disappears', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const activated = beginCityMaterialOccurrence(state, cityId);
    const withoutAccess = {
      ...activated,
      marketplace: { ...activated.marketplace!, purchasedResources: [] },
    } as GameState;
    expect(withoutAccess.cities[cityId].productionMaterials!.softTerms?.multiplier).toBe(0.8);
    expect(withoutAccess.cities[cityId].productionMaterials!.softTerms?.rows).toEqual([{ goodId: coal, quantity: 5 }]);
  });

  it('rush-buys the active soft-discounted item and spends the allotment once', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const activated = beginCityMaterialOccurrence(state, cityId);
    activated.civilizations.player.gold = 5000;
    const result = rushBuyActiveProduction(
      activated,
      'player',
      cityId,
      new EventBus(),
      { expectedOccurrence: activated.cities[cityId].productionMaterials!.activeOccurrence },
    );
    expect(result.success).toBe(true);
    expect(result.state.cities[cityId].buildings).toContain('factory');
    expect(result.state.materialReservesByCiv!.player.balances[coal]).toEqual({ native: 0, imported: 0 });
  });

  it('prices the active snapshot in the canonical context and leaves other work at normal cost', () => {
    const { state, cityId } = cityWorld({ coalStock: 5, queue: ['factory'] });
    const noCoal = cityWorld({ coalStock: 0, queue: [] });
    noCoal.state.marketplace = { ...noCoal.state.marketplace!, purchasedResources: [] } as GameState['marketplace'];
    const normalCost = getProductionCostForCivItem(noCoal.state, 'player', noCoal.cityId, 'factory');

    const activated = beginCityMaterialOccurrence(state, cityId);
    const activeCost = getProductionCostForCivItem(activated, 'player', cityId, 'factory');
    expect(activeCost).toBe(Math.ceil(normalCost * 0.8));

    const afterAccessLoss = {
      ...activated,
      marketplace: { ...activated.marketplace!, purchasedResources: [] },
    } as GameState;
    expect(getProductionCostForCivItem(afterAccessLoss, 'player', cityId, 'factory')).toBe(activeCost);

    const secondCity = {
      ...activated.cities[cityId],
      id: 'soft-city-2',
      position: { q: activated.cities[cityId].position.q + 4, r: activated.cities[cityId].position.r },
      productionQueue: [],
    };
    const withSecond = { ...activated, cities: { ...activated.cities, [secondCity.id]: secondCity } };
    withSecond.civilizations = {
      ...withSecond.civilizations,
      player: { ...withSecond.civilizations.player, cities: [...withSecond.civilizations.player.cities, secondCity.id] },
    };
    expect(getProductionCostForCivItem(withSecond, 'player', secondCity.id, 'factory')).toBe(normalCost);
  });
});
