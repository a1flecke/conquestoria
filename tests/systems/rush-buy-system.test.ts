import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { beginCityMaterialOccurrence } from '@/systems/city-production-materials';
import { getRushBuyQuote } from '@/systems/economy-system';
import { completesFromOwnProduction, rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { getReserveBalance, validateReserveLedger } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1506 MR09 task 6 — rush-buy pays the same hard recipe as natural completion, exactly once,
 * on a candidate state that also has to pass gold and placement.
 */

const iron = resourceGoodId('iron');

interface Fixture {
  state: GameState;
  cityId: string;
}

function fixture(
  seed: string,
  options: { stock?: number; imported?: number; gold?: number; progress?: number; queue?: string[] } = {},
): Fixture {
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

  for (const coord of city.ownedTiles) {
    const tile = state.map.tiles[hexKey(coord)];
    if (tile?.resource === 'iron') delete (tile as { resource?: string }).resource;
  }
  state.map.tiles[hexKey(city.position)].resource = 'iron';

  city.productionQueue = options.queue ?? ['swordsman'];
  city.productionProgress = options.progress ?? 40;
  civ.gold = options.gold ?? 1000;

  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    player: {
      balances: { [iron]: { native: options.stock ?? 10, imported: options.imported ?? 0 } },
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };

  return { state: beginCityMaterialOccurrence(state, city.id), cityId: city.id };
}

function ironBalance(state: GameState) {
  return getReserveBalance(state.materialReservesByCiv!.player, iron);
}

describe('#1506 MR09 — rush-buy pays the hard recipe atomically', () => {
  it('succeeds with gold and materials, spending both exactly once', () => {
    const { state, cityId } = fixture('rush-success');
    const goldBefore = state.civilizations.player.gold;
    const occurrence = state.cities[cityId].productionMaterials!.activeOccurrence;
    const quote = getRushBuyQuote(state, 'player', cityId);
    expect(quote.available).toBe(true);
    expect(quote.cost).toBe(25);

    const result = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: occurrence });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.civilizations.player.gold).toBe(goldBefore - quote.cost);
    expect(ironBalance(result.state)).toEqual({ native: 0, imported: 0 });
    expect(result.state.cities[cityId].productionQueue).toEqual([]);
    expect(Object.values(result.state.units).some(unit => unit.owner === 'player' && unit.type === 'swordsman')).toBe(true);
    expect(result.state.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(validateReserveLedger(result.state.materialReservesByCiv!.player)).toEqual([]);
    // The input ledger/state is never mutated.
    expect(state.civilizations.player.gold).toBe(goldBefore);
    expect(ironBalance(state)).toEqual({ native: 10, imported: 0 });
  });

  it('refuses without gold and writes nothing', () => {
    const { state, cityId } = fixture('rush-no-gold', { gold: 10 });
    const quote = getRushBuyQuote(state, 'player', cityId);
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe('not-enough-gold');
    const result = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('not-enough-gold');
    expect(result.state).toBe(state);
    expect(ironBalance(state)).toEqual({ native: 10, imported: 0 });
  });

  it('refuses without materials, naming the missing rows', () => {
    const { state, cityId } = fixture('rush-no-materials', { stock: 0 });
    const quote = getRushBuyQuote(state, 'player', cityId);
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe('not-enough-materials');
    expect(quote.missingMaterials).toEqual([
      { goodId: iron, required: 10, committed: 0, available: 0, missing: 10 },
    ]);
    const result = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('not-enough-materials');
    expect(result.state.civilizations.player.gold).toBe(1000);
  });

  it('spends imported provenance first and never exports it', () => {
    const { state, cityId } = fixture('rush-provenance', { stock: 4, imported: 6 });
    const allocation = state.materialReservesByCiv!.player.reservations[0]!.allocation;
    expect(allocation).toEqual({ imported: 6, native: 4 });

    const result = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: 1 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(ironBalance(result.state)).toEqual({ native: 0, imported: 0 });
  });

  it('rejects a stale active occurrence without touching the next identical item', () => {
    const { state, cityId } = fixture('rush-stale', { queue: ['swordsman', 'swordsman'], stock: 20 });
    const stale = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: 0 });
    expect(stale.success).toBe(false);
    if (stale.success) return;
    expect(stale.reason).toBe('stale-occurrence');
    expect(stale.state).toBe(state);
    expect(state.cities[cityId].productionQueue).toEqual(['swordsman', 'swordsman']);
    expect(ironBalance(state)).toEqual({ native: 20, imported: 0 });

    const first = rushBuyActiveProduction(state, 'player', cityId, new EventBus(), { expectedOccurrence: 1 });
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.state.cities[cityId].productionQueue).toEqual(['swordsman']);

    // The same callback replayed cannot buy the second item.
    const replay = rushBuyActiveProduction(first.state, 'player', cityId, new EventBus(), { expectedOccurrence: 1 });
    expect(replay.success).toBe(false);
    if (replay.success) return;
    expect(replay.reason).toBe('stale-occurrence');
    expect(replay.state).toBe(first.state);
  });

  it('does not treat a materially waiting head as finishing from its own production', () => {
    const funded = fixture('rush-completes-funded', { progress: 60 });
    expect(completesFromOwnProduction(funded.state, 'player', funded.cityId)).toBe(true);

    const waiting = fixture('rush-completes-waiting', { progress: 60, stock: 0 });
    expect(completesFromOwnProduction(waiting.state, 'player', waiting.cityId)).toBe(false);
  });
});
