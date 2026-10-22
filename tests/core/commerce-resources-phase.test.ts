import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { commerceResourcesPhase } from '@/core/round-phases/commerce-resources';
import { createRoundPhaseContext } from '@/core/round-phases/types';
import { processCity } from '@/systems/city-turn';
import { foundCity } from '@/systems/city-system';
import { buildProductionCostContext } from '@/systems/production-cost-context';
import { hexKey } from '@/systems/hex-utils';
import { getCityMaterialProjection, consumeCityMaterialCommitment } from '@/systems/city-production-materials';
import { getCommittedQuantity, getReserveBalance } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1506 MR09 task 5 — the commerce-resources phase.
 *
 * The exact round regression: stock 8, one eligible iron mine at +2, an active iron-10 item with progress
 * 23. The completed round accrues to 10, reserves the full recipe, and then applies that round's normal
 * production. A control whose mine is unfinished or occupied stays at 8 with progress 23 and withholds
 * the round's output.
 */

const iron = resourceGoodId('iron');

interface Fixture { state: GameState; cityId: string; mine: { q: number; r: number } }

function fixture(seed: string, options: { stock?: number; progress?: number; mine?: 'eligible' | 'unfinished' | 'occupied' | 'none' } = {}): Fixture {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed, gameTitle: seed });
  const civ = state.civilizations.player;
  civ.techState.completed = [...new Set([...civ.techState.completed, 'bronze-working', 'mining-tech'])];

  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
  if (!settler) throw new Error('no settler');
  const city = foundCity('player', settler.position, state.map, {
    nextUnitId: 9000, nextCityId: 9000, nextCampId: 9000, nextQuestId: 9000,
  }, { civType: civ.civType });
  state.cities[city.id] = city;
  civ.cities.push(city.id);
  delete state.units[settler.id];
  civ.units = civ.units.filter(id => id !== settler.id);

  // Strip natural iron, then place a controlled mine on a tile the city owns.
  for (const cityId of civ.cities) {
    for (const coord of state.cities[cityId].ownedTiles) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile?.resource === 'iron') delete (tile as { resource?: string }).resource;
    }
  }
  const mine = { q: 500, r: 500 };
  state.map.tiles[hexKey(mine)] = {
    ...state.map.tiles[hexKey(city.position)],
    coord: mine,
    resource: 'iron',
    improvement: 'mine',
    improvementTurnsLeft: options.mine === 'unfinished' ? 1 : 0,
    owner: 'player',
  } as GameState['map']['tiles'][string];
  city.ownedTiles = [...city.ownedTiles, mine];
  city.productionQueue = ['swordsman'];
  city.productionProgress = options.progress ?? 23;

  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    player: {
      balances: { [iron]: { native: options.stock ?? 8, imported: 0 } },
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };

  if (options.mine === 'occupied') {
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.units['unit-raider'] = {
      id: 'unit-raider', type: 'warrior', owner: 'ai-1', position: { ...mine },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as GameState['units'][string];
    state.civilizations['ai-1'].units.push('unit-raider');
  }

  return { state, cityId: city.id, mine };
}

function runPhase(state: GameState): GameState {
  return commerceResourcesPhase.run(state, createRoundPhaseContext(state, new EventBus()));
}

function ironBalance(state: GameState) {
  return getReserveBalance(state.materialReservesByCiv!.player, iron);
}

describe('#1506 MR09 — commerce-resources round phase', () => {
  it('accrues the round, funds the recipe, and then applies that round’s production', () => {
    const { state, cityId } = fixture('commerce-round', { stock: 8 });
    const afterPhase = runPhase(state);

    expect(ironBalance(afterPhase)).toEqual({ native: 10, imported: 0 });
    expect(getCommittedQuantity(afterPhase.materialReservesByCiv!.player, iron)).toBe(10);
    expect(afterPhase.materialReservesByCiv!.player.lastAccruedTurn).toBe(state.turn);
    expect(getCityMaterialProjection(afterPhase, cityId).funded).toBe(true);

    const city = afterPhase.cities[cityId];
    const result = processCity(
      city, afterPhase.map, 0, 2, buildProductionCostContext(afterPhase, 'player', cityId), 'generic', undefined, undefined, true,
    );
    expect(result.production.withheldByMaterials).toBe(false);
    expect(result.production.appliedToBuild).toBe(2);
    expect(result.city.productionProgress).toBe(25);
    expect(result.completedUnit).toBeNull();
  });

  it('keeps an unfinished or occupied mine at 8 and withholds the round’s output', () => {
    for (const mine of ['unfinished', 'occupied'] as const) {
      const { state, cityId } = fixture(`commerce-${mine}`, { stock: 8, mine });
      const afterPhase = runPhase(state);
      expect(ironBalance(afterPhase), mine).toEqual({ native: 8, imported: 0 });
      expect(getCommittedQuantity(afterPhase.materialReservesByCiv!.player, iron)).toBe(0);
      expect(getCityMaterialProjection(afterPhase, cityId).funded).toBe(false);

      const result = processCity(
        afterPhase.cities[cityId], afterPhase.map, 0, 2,
        buildProductionCostContext(afterPhase, 'player', cityId), 'generic', undefined, undefined, false,
      );
      expect(result.city.productionProgress, mine).toBe(23);
      expect(result.production.withheldByMaterials, mine).toBe(true);
      expect(result.production.appliedToBuild, mine).toBe(0);
      expect(result.production.carriedOver, mine).toBe(0);
      expect(result.production.convertedGold, mine).toBe(0);
      expect(result.production.convertedScience, mine).toBe(0);
      expect(result.production.discarded, mine).toBe(2);
      expect(
        result.production.produced,
        mine,
      ).toBe(result.production.appliedToBuild + result.production.carriedOver + result.production.convertedGold + result.production.convertedScience + result.production.discarded);
    }
  });

  it('accrues exactly once per completed round and marks the round in the same transition', () => {
    const { state } = fixture('commerce-once');
    const first = runPhase(state);
    const second = runPhase(first);
    expect(second).toBe(first);

    const nextRound = runPhase({ ...first, turn: first.turn + 1 });
    expect(ironBalance(nextRound).native).toBe(12);
    expect(nextRound.materialReservesByCiv!.player.lastAccruedTurn).toBe(first.turn + 1);
  });

  it('caps by headroom including incoming claims and retains owned overflow', () => {
    const capped = fixture('commerce-cap');
    capped.state.materialReservesByCiv!.player = {
      balances: { [iron]: { native: 35, imported: 0 } },
      reservations: [],
      incoming: [{ id: 'incoming-1', goodId: iron, ownerCivId: 'player', amount: 5 }],
      lastAccruedTurn: -1,
    };
    expect(ironBalance(runPhase(capped.state))).toEqual({ native: 35, imported: 0 });

    const overflow = fixture('commerce-overflow');
    overflow.state.materialReservesByCiv!.player = {
      balances: { [iron]: { native: 45, imported: 0 } },
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    };
    expect(ironBalance(runPhase(overflow.state))).toEqual({ native: 45, imported: 0 });
  });

  it('counts one coordinate once even when two cities list it', () => {
    const { state, cityId, mine } = fixture('commerce-dedupe');
    const civ = state.civilizations.player;
    const freeTile = Object.values(state.map.tiles).find(tile =>
      tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && !tile.owner);
    if (!freeTile) throw new Error('no free tile');
    const second = foundCity('player', freeTile.coord, state.map, {
      nextUnitId: 9100, nextCityId: 9100, nextCampId: 9100, nextQuestId: 9100,
    }, { civType: civ.civType });
    state.cities[second.id] = second;
    civ.cities.push(second.id);
    second.ownedTiles = [...second.ownedTiles, mine];

    const accrued = runPhase(state);
    // One source × 2 = 2, not 4.
    expect(ironBalance(accrued)).toEqual({ native: 10, imported: 0 });
    expect(accrued.cities[cityId].productionMaterials).toBeDefined();
  });

  it('does not accrue for an eliminated civ and ignores the current viewer', () => {
    const { state } = fixture('commerce-eliminated');
    state.civilizations.player.isEliminated = true;
    state.currentPlayer = 'ai-1';
    const after = runPhase(state);
    expect(after.materialReservesByCiv?.player?.lastAccruedTurn ?? -1).toBe(-1);
  });

  it('spends the held recipe exactly once on natural completion', () => {
    const { state, cityId } = fixture('commerce-consume', { stock: 10 });
    const funded = runPhase({ ...state, materialReservesByCiv: { player: { ...state.materialReservesByCiv!.player, lastAccruedTurn: state.turn } } });
    expect(getCommittedQuantity(funded.materialReservesByCiv!.player, iron)).toBe(10);

    const spent = consumeCityMaterialCommitment(funded, cityId);
    expect(ironBalance(spent)).toEqual({ native: 0, imported: 0 });
    expect(spent.materialReservesByCiv!.player.reservations).toEqual([]);

    // A second call is a no-op: completion cannot debit twice.
    const again = consumeCityMaterialCommitment(spent, cityId);
    expect(again).toBe(spent);
  });
});
