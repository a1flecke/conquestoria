import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import type { AIForceDemand } from '@/ai/ai-unit-assignment';
import { applyAIProduction, applyAIProductionWithReport, generateAIProductionCandidates } from '@/ai/ai-production';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { createNeutralCityProductionMaterials } from '@/core/types/commerce';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { getCityMaterialProjection } from '@/systems/city-production-materials';
import { getMaterialRecipe } from '@/systems/resource-material-costs';
import { getRecommendedIdleCityChoice } from '@/systems/planning-system';

/**
 * #1506 MR09 task 10 — AI funds useful work without stalling.
 *
 * The AI still enumerates the full plannable catalog, but selection prefers an item whose whole
 * hard recipe is available now. A waiting AI head is retained only when a pure one-resource-phase
 * projection (capped extraction + existing claims in stable order) can fund its whole recipe;
 * otherwise it is replaced through canonical queue commands, with the progress loss reported.
 * The projections are read-only: the real state and its accrual marker never change.
 */

const iron = resourceGoodId('iron');
const calm = { traits: [] as never[], warLikelihood: 0.2, diplomacyFocus: 0.4, expansionDrive: 0.2 };

function demand(role: AIForceDemand['role'], missing = 2): AIForceDemand {
  return { role, desired: missing, assigned: 0, missing, priority: 100, sourcePlanIds: ['primary'] };
}

function setupState(cityIds = ['city-a']): GameState {
  const state = createNewGame(undefined, `ai-material-${cityIds.join('-')}`, 'small');
  const civ = state.civilizations['ai-1'];
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  for (const [index, cityId] of cityIds.entries()) {
    const city = foundCity(
      civ.id,
      index === 0 ? settler.position : { q: settler.position.q + index * 4, r: settler.position.r },
      state.map,
      state.idCounters,
    );
    city.id = cityId;
    city.population = 4;
    city.productionQueue = [];
    city.productionProgress = 0;
    city.productionMaterials = createNeutralCityProductionMaterials();
    state.cities[cityId] = city;
    civ.cities.push(cityId);
    for (const coord of [city.position, ...hexNeighbors(city.position)]) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) tile.terrain = 'plains';
      if (tile) tile.resource = null;
    }
  }
  civ.techState.completed = ['bronze-working'];
  civ.gold = 500;
  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    'ai-1': { balances: {}, reservations: [], incoming: [], lastAccruedTurn: -1 },
  };
  return state;
}

/** One revealed, usable city-center iron source and the requested native stock. */
function withIron(state: GameState, native: number, sourceCityId = 'city-a'): GameState {
  const city = state.cities[sourceCityId];
  const tile = state.map.tiles[hexKey(city.position)];
  if (tile) tile.resource = 'iron';
  if (!city.ownedTiles.some(coord => coord.q === city.position.q && coord.r === city.position.r)) {
    city.ownedTiles.push({ ...city.position });
  }
  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    'ai-1': {
      balances: native > 0 ? { [iron]: { native, imported: 0 } } : {},
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };
  return state;
}

/** Access without stock: bronze-working plus a purchased iron entry, exactly the legacy shortcut. */
function withIronAccessOnly(state: GameState): GameState {
  state.marketplace = {
    ...(state.marketplace ?? { prices: {}, priceHistory: {}, tradeRoutes: [] }),
    purchasedResources: [{ civId: 'ai-1', resource: 'iron', expiresOnTurn: state.turn + 10 }],
  } as NonNullable<GameState['marketplace']>;
  return state;
}

function queueHead(state: GameState, cityId: string, itemId: string, progress = 0): GameState {
  state.cities[cityId] = {
    ...state.cities[cityId],
    productionQueue: [itemId],
    productionProgress: progress,
  };
  return state;
}

function queued(state: GameState, cityId: string): string[] {
  return state.cities[cityId].productionQueue;
}

describe('#1506 MR09 task 10 — AI material-aware selection', () => {
  it('distinguishes plannable candidates from those fundable now', () => {
    const state = withIron(setupState(), 0);
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [demand('frontline')], calm);
    const swordsman = candidates.find(candidate => candidate.itemId === 'swordsman');
    const spearman = candidates.find(candidate => candidate.itemId === 'spearman');
    expect(swordsman).toBeDefined();
    expect(spearman).toBeDefined();
    expect(swordsman!.plannable).toBe(true);
    expect(swordsman!.fundableNow).toBe(false);
    expect(spearman!.fundableNow).toBe(true);
  });

  it('funds at most one of two iron units, and gives the other city a useful free alternative', () => {
    const state = withIron(setupState(['city-a', 'city-b']), 10);
    const after = applyAIProduction(state, 'ai-1', [demand('frontline')], calm);

    const swordsmen = ['city-a', 'city-b'].filter(id => queued(after, id)[0] === 'swordsman');
    const free = ['city-a', 'city-b'].filter(id => {
      const head = queued(after, id)[0];
      return head && head !== 'swordsman';
    });
    expect(swordsmen).toHaveLength(1);
    expect(free).toHaveLength(1);
    expect(getCityMaterialProjection(after, free[0]).funded).toBe(true);
  });

  it('retains invested waiting work when the next resource phase funds the whole recipe', () => {
    const state = queueHead(withIron(setupState(), 8), 'city-a', 'swordsman', 23);
    const before = structuredClone(state);
    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [demand('frontline')], calm);

    expect(queued(after, 'city-a')).toEqual(['swordsman']);
    expect(after.cities['city-a'].productionProgress).toBe(23);
    expect(report.replacedWaiting).toEqual([]);
    // The projection is read-only: the real ledger and accrual marker are untouched.
    expect(state.materialReservesByCiv!['ai-1']).toEqual(before.materialReservesByCiv!['ai-1']);
    expect(after.materialReservesByCiv!['ai-1'].lastAccruedTurn).toBe(-1);
  });

  it('lets only the stable-order winner retain the shared next-phase stock', () => {
    let state = withIron(setupState(['city-a', 'city-b']), 8);
    state = queueHead(state, 'city-a', 'swordsman');
    state = queueHead(state, 'city-b', 'swordsman');
    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [demand('frontline')], calm);

    expect(queued(after, 'city-a')).toEqual(['swordsman']);
    expect(queued(after, 'city-b')).not.toEqual(['swordsman']);
    expect(queued(after, 'city-b')).toHaveLength(1);
    expect(getCityMaterialProjection(after, 'city-b').funded).toBe(true);
    expect(report.replacedWaiting).toEqual([
      expect.objectContaining({ cityId: 'city-b', itemId: 'swordsman' }),
    ]);
  });

  it('replaces a waiting head the next phase cannot fund and traces the progress loss', () => {
    const state = queueHead(withIron(setupState(), 0), 'city-a', 'swordsman', 23);
    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [demand('frontline')], calm);

    expect(queued(after, 'city-a')).not.toEqual(['swordsman']);
    expect(queued(after, 'city-a')).toHaveLength(1);
    expect(after.cities['city-a'].productionProgress).toBe(0);
    expect(getCityMaterialProjection(after, 'city-a').funded).toBe(true);
    expect(report.replacedWaiting).toEqual([
      expect.objectContaining({ cityId: 'city-a', itemId: 'swordsman', progressLost: 23 }),
    ]);
  });

  it('produces useful free work when iron is inaccessible and never enqueues it', () => {
    const state = setupState();
    const after = applyAIProduction(state, 'ai-1', [demand('recon')], calm);

    expect(queued(after, 'city-a')).toHaveLength(1);
    expect(queued(after, 'city-a')[0]).not.toBe('swordsman');
    expect(getCityMaterialProjection(after, 'city-a').funded).toBe(true);

    // Several real rounds complete useful work instead of waiting on a material that cannot arrive.
    let current = after;
    for (let turn = 0; turn < 6; turn++) current = processTurn(current, new EventBus());
    expect(Object.values(current.units).some(unit => unit.owner === 'ai-1' && unit.type === 'scout')).toBe(true);
    expect(current.cities['city-a'].productionQueue).not.toContain('swordsman');
  });

  it('keeps late-era land/economic alternatives when no aluminum or uranium can be had', () => {
    const state = setupState();
    state.civilizations['ai-1'].techState.completed = [
      'bronze-working', 'aluminium-smelting', 'nuclear-physics', 'siege-warfare', 'writing', 'masonry',
    ];
    const after = applyAIProduction(state, 'ai-1', [demand('siege')], calm);
    const head = queued(after, 'city-a')[0];

    expect(head).toBeDefined();
    expect(getCityMaterialProjection(after, 'city-a').funded).toBe(true);
    const recipe = getMaterialRecipe(head);
    expect(recipe.known).toBe(true);
    if (recipe.known) expect(recipe.recipe.rows).toEqual([]);
  });

  it('does not count a waiting head as fulfilled force demand', () => {
    let state = withIron(setupState(['city-a', 'city-b']), 0);
    state = queueHead(state, 'city-a', 'swordsman');
    const after = applyAIProduction(state, 'ai-1', [demand('frontline', 1)], calm);

    expect(queued(after, 'city-b')).toHaveLength(1);
    expect(getCityMaterialProjection(after, 'city-b').funded).toBe(true);
  });

  it('never spends the human ledger for an AI with access but no stock', () => {
    let state = withIronAccessOnly(setupState());
    state.currentPlayer = 'player';
    state.materialReservesByCiv = {
      ...(state.materialReservesByCiv ?? {}),
      player: {
        balances: { [iron]: { native: 100, imported: 0 } },
        reservations: [],
        incoming: [],
        lastAccruedTurn: -1,
      },
    };
    const humanBefore = structuredClone(state.materialReservesByCiv!.player);

    const after = applyAIProduction(state, 'ai-1', [demand('frontline')], calm);

    expect(queued(after, 'city-a')[0]).not.toBe('swordsman');
    expect(getCityMaterialProjection(after, 'city-a').funded).toBe(true);
    expect(after.materialReservesByCiv!.player).toEqual(humanBefore);
  });
});

describe('#1506 MR09 task 10 — idle recommendations', () => {
  it('recommends a fundable candidate instead of an access-only material item', () => {
    const state = withIronAccessOnly(setupState());
    const choice = getRecommendedIdleCityChoice(state, 'ai-1', 'city-a');

    expect(choice).not.toBeNull();
    expect(choice!.itemId).not.toBe('swordsman');
    expect(choice!.fundableNow).toBe(true);
    expect(choice!.label).not.toContain('plan and wait');
  });
});
