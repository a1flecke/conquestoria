import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { getQueueableProductionForCity } from '@/systems/city-production-eligibility';
import {
  beginCityMaterialOccurrence,
  getCityMaterialProjection,
  releaseCityMaterialCommitment,
  syncCityMaterialCommitment,
} from '@/systems/city-production-materials';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';
import {
  enqueueCityProduction,
  removeCityProductionCommand,
  reorderCityProductionCommand,
} from '@/systems/planning-system';
import { getCommittedQuantity, getReserveBalance, validateReserveLedger } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1506 MR09 task 4 — the active commitment owner and state-aware queue edits.
 *
 * The headline regression is the shared-stock race: alpha owns A and B, ten free iron, and both
 * cities want a swordsman. Only one active occurrence may hold the recipe; the other is a legal
 * waiting state. Editing the queue releases and recomputes, never double-funds.
 */

const iron = resourceGoodId('iron');
const copper = resourceGoodId('copper');

function gameWithTwoCities(seed: string): { state: GameState; a: string; b: string } {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed, gameTitle: seed });
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
  if (!settler) throw new Error('no settler');
  const a = foundCity('player', settler.position, state.map, {
    nextUnitId: 9000, nextCityId: 9000, nextCampId: 9000, nextQuestId: 9000,
  }, { civType: state.civilizations.player.civType });
  state.cities[a.id] = a;
  state.civilizations.player.cities.push(a.id);
  delete state.units[settler.id];
  state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== settler.id);

  // A second city for the same owner, on a free land tile.
  const freeTile = Object.values(state.map.tiles).find(tile =>
    tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && !tile.owner);
  if (!freeTile) throw new Error('no free tile');
  const b = foundCity('player', freeTile.coord, state.map, {
    nextUnitId: 9100, nextCityId: 9100, nextCampId: 9100, nextQuestId: 9100,
  }, { civType: state.civilizations.player.civType });
  state.cities[b.id] = b;
  state.civilizations.player.cities.push(b.id);

  return { state, a: a.id, b: b.id };
}

function prepare(state: GameState, sources: { iron?: number; copper?: number } = {}): GameState {
  const civ = state.civilizations.player;
  civ.techState.completed = [
    ...new Set([...civ.techState.completed, 'bronze-working', 'mining-tech', 'stone-weapons', 'archery', 'tactics']),
  ];
  // Strip every natural source so the fixture's ledger is the only stock.
  for (const cityId of civ.cities) {
    for (const coord of state.cities[cityId].ownedTiles) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile?.resource === 'iron' || tile?.resource === 'copper') delete (tile as { resource?: string }).resource;
    }
  }
  // Access for eligibility comes from the first city's center.
  const firstCity = state.cities[civ.cities[0]];
  if (sources.iron !== undefined) state.map.tiles[hexKey(firstCity.position)].resource = 'iron';
  if (sources.copper !== undefined) state.map.tiles[hexKey(firstCity.position)].resource = 'copper';

  return {
    ...state,
    materialReservesByCiv: {
      ...(state.materialReservesByCiv ?? {}),
      player: {
        balances: {
          ...(sources.iron ? { [iron]: { native: sources.iron, imported: 0 } } : {}),
          ...(sources.copper ? { [copper]: { native: sources.copper, imported: 0 } } : {}),
        },
        reservations: [],
        incoming: [],
        lastAccruedTurn: -1,
      },
    },
  };
}

function committed(state: GameState, goodId = iron): number {
  return getCommittedQuantity(state.materialReservesByCiv!.player, goodId);
}

function revisionOf(state: GameState, cityId: string): number {
  return state.cities[cityId].productionMaterials?.queueRevision ?? 0;
}

describe('#1506 MR09 — active material commitments', () => {
  it('funds one city, leaves the second waiting, and never double-commits shared stock', () => {
    const base = gameWithTwoCities('material-two-cities');
    let state = prepare(base.state, { iron: 10 });
    const before = structuredClone(state);

    const enqueueA = enqueueCityProduction(state, base.a, 'swordsman');
    expect(enqueueA.ok).toBe(true);
    state = enqueueA.state;
    expect(committed(state)).toBe(10);
    expect(getReserveBalance(state.materialReservesByCiv!.player, iron)).toEqual({ native: 10, imported: 0 });
    expect(getCityMaterialProjection(state, base.a).funded).toBe(true);
    expect(state.cities[base.a].productionMaterials!.commitment!.ref).toMatchObject({
      ownerCivId: 'player', cityId: base.a, itemId: 'swordsman', occurrence: 1,
    });

    const enqueueB = enqueueCityProduction(state, base.b, 'swordsman');
    expect(enqueueB.ok).toBe(true);
    state = enqueueB.state;
    // B is legally queued and explicitly waiting; the nation still commits exactly one recipe.
    expect(state.cities[base.b].productionQueue).toEqual(['swordsman']);
    expect(state.cities[base.b].productionMaterials?.commitment ?? null).toBeNull();
    expect(committed(state)).toBe(10);
    const waiting = getCityMaterialProjection(state, base.b);
    expect(waiting.funded).toBe(false);
    expect(waiting.missing).toEqual([{ goodId: iron, required: 10, committed: 0, available: 0, missing: 10 }]);

    const aCommitment = state.cities[base.a].productionMaterials!.commitment!;
    const followUp = enqueueCityProduction(state, base.a, 'worker');
    expect(followUp.ok).toBe(true);
    state = followUp.state;
    expect(state.cities[base.a].productionMaterials!.commitment).toEqual(aCommitment);
    expect(committed(state)).toBe(10);

    expect(before.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(validateReserveLedger(state.materialReservesByCiv!.player)).toEqual([]);
  });

  it('releases on head removal and lets the shared owner fund the waiting city', () => {
    const base = gameWithTwoCities('material-release-refund');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.b, 'swordsman').state;
    expect(committed(state)).toBe(10);

    const removed = removeCityProductionCommand(state, base.a, 0, revisionOf(state, base.a));
    expect(removed.ok).toBe(true);
    state = removed.state;
    expect(state.cities[base.a].productionQueue).toEqual([]);
    expect(committed(state)).toBe(0);
    expect(getReserveBalance(state.materialReservesByCiv!.player, iron)).toEqual({ native: 10, imported: 0 });

    state = syncCityMaterialCommitment(state, base.b);
    expect(committed(state)).toBe(10);
    expect(state.cities[base.b].productionMaterials!.commitment?.ref.itemId).toBe('swordsman');
    expect(getCityMaterialProjection(state, base.a).commitment).toBeNull();
  });

  it('denies stale revisions and invalid indices without mutating or advancing anything', () => {
    const base = gameWithTwoCities('material-stale');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    const revision = revisionOf(state, base.a);
    const snapshot = structuredClone(state);

    const stale = reorderCityProductionCommand(state, base.a, 0, 0, revision - 1);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reason).toBe('stale-revision');
    expect(stale.state).toBe(state);

    const invalid = removeCityProductionCommand(state, base.a, 9, revision);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.reason).toBe('invalid-index');
    expect(invalid.state).toBe(state);
    expect(state.cities[base.a].productionMaterials!.queueRevision).toBe(revision);
    expect(JSON.stringify(state)).toBe(JSON.stringify(snapshot));
  });

  it('keeps the head commitment on a tail-only move and preserves progress', () => {
    const base = gameWithTwoCities('material-tail-move');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.a, 'worker').state;
    state = enqueueCityProduction(state, base.a, 'scout').state;
    state = {
      ...state,
      cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionProgress: 7 } },
    };
    const head = state.cities[base.a].productionMaterials!.commitment!;
    const occurrence = state.cities[base.a].productionMaterials!.activeOccurrence;
    const revision = revisionOf(state, base.a);

    const moved = reorderCityProductionCommand(state, base.a, 1, 2, revision);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.cities[base.a].productionQueue).toEqual(['swordsman', 'scout', 'worker']);
    expect(moved.state.cities[base.a].productionProgress).toBe(7);
    expect(moved.state.cities[base.a].productionMaterials!.commitment).toEqual(head);
    expect(moved.state.cities[base.a].productionMaterials!.activeOccurrence).toBe(occurrence);
    expect(revisionOf(moved.state, base.a)).toBe(revision + 1);
  });

  it('advances the occurrence on a head move, resets progress and re-funds the new head', () => {
    const base = gameWithTwoCities('material-head-move');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.a, 'worker').state;
    state = { ...state, cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionProgress: 7 } } };
    const old = state.cities[base.a].productionMaterials!;
    const revision = revisionOf(state, base.a);

    const moved = reorderCityProductionCommand(state, base.a, 1, 0, revision);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const next = moved.state.cities[base.a];
    expect(next.productionQueue).toEqual(['worker', 'swordsman']);
    expect(next.productionProgress).toBe(0);
    expect(next.productionMaterials!.activeOccurrence).toBe(old.activeOccurrence + 1);
    expect(next.productionMaterials!.commitment).toBeNull(); // worker is resource-free
    expect(committed(moved.state)).toBe(0);

    // Moving the swordsman back into the head funds it under the newest occurrence again.
    const back = reorderCityProductionCommand(moved.state, base.a, 1, 0, revisionOf(moved.state, base.a));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.cities[base.a].productionMaterials!.commitment?.ref.occurrence)
      .toBe(old.activeOccurrence + 2);
    expect(committed(back.state)).toBe(10);
  });

  it('treats identical adjacent units as distinct occurrences when the head is removed', () => {
    const base = gameWithTwoCities('material-identical');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = { ...state, cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionProgress: 23 } } };
    const first = state.cities[base.a].productionMaterials!.commitment!;
    const occurrence = state.cities[base.a].productionMaterials!.activeOccurrence;
    const revision = revisionOf(state, base.a);

    const removed = removeCityProductionCommand(state, base.a, 0, revision);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const next = removed.state.cities[base.a];
    expect(next.productionQueue).toEqual(['swordsman']);
    expect(next.productionProgress).toBe(0);
    expect(next.productionMaterials!.activeOccurrence).toBe(occurrence + 1);
    expect(next.productionMaterials!.commitment!.ref.occurrence).toBe(occurrence + 1);
    expect(next.productionMaterials!.commitment!.reservationIds).not.toEqual(first.reservationIds);

    // A command built for the old revision cannot touch the new occurrence.
    const stale = removeCityProductionCommand(removed.state, base.a, 0, revision);
    expect(stale.ok).toBe(false);
    expect(removed.state.cities[base.a].productionMaterials!.commitment!.reservationIds)
      .toEqual(next.productionMaterials!.commitment!.reservationIds);
  });

  it('advances the occurrence on completion and funds the promoted head', () => {
    const base = gameWithTwoCities('material-completion');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.a, 'worker').state;
    const occurrence = state.cities[base.a].productionMaterials!.activeOccurrence;

    // Simulate the round-phase completion hook: the swordsman is gone, the worker is promoted.
    state = {
      ...state,
      cities: {
        ...state.cities,
        [base.a]: { ...state.cities[base.a], productionQueue: ['worker'], productionProgress: 0 },
      },
    };
    state = beginCityMaterialOccurrence(state, base.a);
    expect(state.cities[base.a].productionMaterials!.activeOccurrence).toBe(occurrence + 1);
    expect(state.cities[base.a].productionMaterials!.commitment).toBeNull();
    expect(committed(state)).toBe(0);
    expect(getReserveBalance(state.materialReservesByCiv!.player, iron)).toEqual({ native: 10, imported: 0 });
  });

  it('retires an available predecessor only when its successor can actually be funded', () => {
    const base = gameWithTwoCities('material-obsolescence');
    let state = prepare(base.state, { copper: 0 });
    // Copper access exists (city center) and tactics is complete, so archer is obsolete *if* the
    // crossbowman recipe is fundable.
    let offered = getQueueableProductionForCity(state, base.a)!.units.map(unit => unit.type);
    expect(offered).toContain('archer');

    state = prepare(state, { copper: 10 });
    offered = getQueueableProductionForCity(state, base.a)!.units.map(unit => unit.type);
    expect(offered).not.toContain('archer');
    expect(offered).toContain('crossbowman');
  });
});

describe('#1506 MR09 — release on capture and removal', () => {
  it('releases the old owner commitment on capture and funds from the conqueror ledger', () => {
    const base = gameWithTwoCities('material-capture');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    expect(committed(state)).toBe(10);

    // The conqueror has its own stock; the old owner's committed iron returns to free.
    state = {
      ...state,
      materialReservesByCiv: {
        ...(state.materialReservesByCiv ?? {}),
        'ai-1': {
          balances: { [iron]: { native: 10, imported: 0 } },
          reservations: [],
          incoming: [],
        },
      },
    };

    const captured = transferCapturedCityOwnership(state, base.a, 'ai-1', state.turn);
    expect(captured.cities[base.a].owner).toBe('ai-1');
    expect(captured.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(getReserveBalance(captured.materialReservesByCiv!.player, iron)).toEqual({ native: 10, imported: 0 });
    expect(getCommittedQuantity(captured.materialReservesByCiv!['ai-1'], iron)).toBe(10);
    expect(captured.cities[base.a].productionMaterials!.commitment?.ref.ownerCivId).toBe('ai-1');
  });

  it('never gives the conqueror the old stock: no stock means waiting', () => {
    const base = gameWithTwoCities('material-capture-poor');
    let state = prepare(base.state, { iron: 10 });
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = {
      ...state,
      materialReservesByCiv: {
        ...(state.materialReservesByCiv ?? {}),
        'ai-1': { balances: {}, reservations: [], incoming: [] },
      },
    };

    const captured = transferCapturedCityOwnership(state, base.a, 'ai-1', state.turn);
    expect(captured.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(getReserveBalance(captured.materialReservesByCiv!.player, iron)).toEqual({ native: 10, imported: 0 });
    expect(captured.cities[base.a].productionMaterials!.commitment).toBeNull();
    expect(getCommittedQuantity(captured.materialReservesByCiv!['ai-1'], iron)).toBe(0);
    expect(getCityMaterialProjection(captured, base.a).funded).toBe(false);
  });

  it('expires a tagged migration grant on release and is idempotent', () => {
    const base = gameWithTwoCities('material-release-grant');
    const state = prepare(base.state, { iron: 0 });
    const cityId = base.a;
    const ref = { ownerCivId: 'player', cityId, occurrence: 0, itemId: 'swordsman' };
    const ledger = {
      balances: { [iron]: { native: 0, imported: 8 } },
      reservations: [{
        id: 'migration:grant', goodId: iron, ownerCivId: 'player', amount: 8, reason: 'migration-grant' as const,
        allocation: { native: 0, imported: 8 }, consumer: ref, migrationGrantImported: 8,
      }],
      incoming: [],
    };
    const withCommitment: GameState = {
      ...state,
      materialReservesByCiv: { ...(state.materialReservesByCiv ?? {}), player: ledger },
      cities: {
        ...state.cities,
        [cityId]: {
          ...state.cities[cityId],
          productionQueue: ['swordsman'],
          productionMaterials: {
            queueRevision: 0,
            activeOccurrence: 0,
            commitment: { ref, recipe: [{ goodId: iron, quantity: 8 }], reservationIds: ['migration:grant'] },
          },
        },
      },
    };

    const released = releaseCityMaterialCommitment(withCommitment, cityId);
    expect(released.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(getReserveBalance(released.materialReservesByCiv!.player, iron)).toEqual({ native: 0, imported: 0 });
    expect(released.cities[cityId].productionMaterials!.commitment).toBeNull();
    // Repeating the release changes nothing (no negative stock, no second expiry).
    expect(releaseCityMaterialCommitment(released, cityId)).toBe(released);
  });
});
