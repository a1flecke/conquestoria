import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import type { ReserveLedger, TradeGoodId } from '@/core/types/commerce';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { enqueueCityProduction } from '@/systems/planning-system';
import { getCityMaterialProjection, releaseCityMaterialCommitment } from '@/systems/city-production-materials';
import { getProductionDecision } from '@/systems/production-decision';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import {
  getCityMaterialQueueRows,
  getReserveSuppliesRows,
} from '@/systems/resource-reserve-presentation';
import {
  expectEarnedByViewer,
  expectHiddenFromViewer,
  expectHotSeatDifferential,
  type ViewerSurface,
} from '../helpers/viewer-safety';

/**
 * #1506 MR09 task 8 — authoritative reserve and production read models.
 *
 * These are pure projections: one Supplies row per revealed counted good, and one city row per
 * queue entry. The tests pin the exact displayed arithmetic, the funding gates (own reservation
 * counts, other-city stock does not, incoming is not spendable), honest waiting estimates, and
 * viewer scoping. No production code exists for these projections yet.
 */

const iron = resourceGoodId('iron');
const copper = resourceGoodId('copper');
const horses = resourceGoodId('horses');

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

/** Remove every material deposit, then let the first city center be the one controlled source. */
function prepare(state: GameState): GameState {
  const civ = state.civilizations.player;
  civ.techState.completed = ['bronze-working', 'mining-tech', 'stone-weapons', 'animal-husbandry', 'archery', 'tactics'];
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.resource === 'iron' || tile.resource === 'copper' || tile.resource === 'horses' || tile.resource === 'stone') {
      delete (tile as { resource?: string }).resource;
    }
  }
  return state;
}

function withLedger(state: GameState, ledger: ReserveLedger): GameState {
  return {
    ...state,
    materialReservesByCiv: { ...(state.materialReservesByCiv ?? {}), player: ledger },
  };
}

function ledger(balances: ReserveLedger['balances'], extra: Partial<ReserveLedger> = {}): ReserveLedger {
  return { balances, reservations: [], incoming: [], lastAccruedTurn: -1, ...extra };
}

function activeReservation(
  goodId: TradeGoodId,
  amount: number,
  consumer: ReserveLedger['reservations'][number]['consumer'],
  id = `${consumer?.cityId ?? 'c'}:${consumer?.occurrence ?? 0}:${consumer?.itemId ?? 'i'}:${goodId}`,
) {
  return {
    id,
    goodId,
    ownerCivId: 'player' as const,
    amount,
    reason: 'active-production' as const,
    allocation: { native: amount, imported: 0 },
    consumer,
  };
}

function suppliesRow(state: GameState, goodId: TradeGoodId) {
  const row = getReserveSuppliesRows(state, 'player').find(candidate => candidate.goodId === goodId);
  if (!row) throw new Error(`no supplies row for ${goodId}`);
  return row;
}

describe('#1506 MR09 task 8 — Supplies reserve rows', () => {
  it('reports exact stored/committed/free/incoming and the eligible extraction rate', () => {
    const base = gameWithTwoCities('reserve-supplies-exact');
    let state = prepare(base.state);
    state.civilizations.player.techState.completed = ['bronze-working'];
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    const consumer = { ownerCivId: 'player', cityId: base.a, occurrence: 1, itemId: 'swordsman' };
    state = withLedger(state, ledger(
      { [iron]: { native: 14, imported: 0 } },
      { reservations: [activeReservation(iron, 10, consumer)] },
    ));

    const row = suppliesRow(state, iron);
    expect(row).toMatchObject({
      goodId: iron,
      resource: 'iron',
      name: 'Iron',
      icon: '⚙️',
      unitLabel: 'units',
      nativeStored: 14,
      importedStored: 0,
      stored: 14,
      capacity: 40,
      committed: 10,
      free: 4,
      incoming: 0,
      sources: 1,
      extractionPerRound: 2,
      headroom: 26,
      capped: false,
      cappedQuantity: 0,
      overflow: 0,
      migrationAssistance: 0,
    });
    // Only the revealed counted good appears; a hidden resource cannot pad the list.
    expect(getReserveSuppliesRows(state, 'player').map(candidate => candidate.goodId)).toEqual([iron]);
  });

  it('labels migration assistance and reports storage capping separately', () => {
    const base = gameWithTwoCities('reserve-supplies-grant-cap');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    const consumer = { ownerCivId: 'player', cityId: base.a, occurrence: 1, itemId: 'swordsman' };
    state = withLedger(state, ledger(
      { [iron]: { native: 39, imported: 0 }, [copper]: { native: 0, imported: 8 } },
      {
        reservations: [{
          id: 'migration:grant',
          goodId: copper,
          ownerCivId: 'player',
          amount: 8,
          reason: 'migration-grant',
          allocation: { native: 0, imported: 8 },
          consumer,
          migrationGrantImported: 8,
        }],
      },
    ));

    const copperRow = suppliesRow(state, copper);
    expect(copperRow).toMatchObject({
      importedStored: 8,
      committed: 8,
      free: 0,
      migrationAssistance: 8,
    });
    // The same 8 units are one restricted reservation, not ordinary stock the player can reassign.
    expect(copperRow.migrationAssistance).toBe(copperRow.committed);

    const ironRow = suppliesRow(state, iron);
    expect(ironRow).toMatchObject({
      stored: 39,
      capacity: 40,
      headroom: 1,
      sources: 1,
      extractionPerRound: 2,
      capped: true,
      cappedQuantity: 1,
      overflow: 0,
    });
  });

  it('never treats purchased temporary access as stored stock', () => {
    const base = gameWithTwoCities('reserve-supplies-access-only');
    let state = prepare(base.state);
    state = {
      ...state,
      marketplace: {
        ...(state.marketplace ?? {}),
        purchasedResources: [{ civId: 'player', resource: 'iron', expiresOnTurn: state.turn + 5 }],
      } as GameState['marketplace'],
    };

    const row = suppliesRow(state, iron);
    expect(row).toMatchObject({ stored: 0, committed: 0, free: 0, sources: 0, extractionPerRound: 0 });
  });
});

describe('#1506 MR09 task 8 — city material queue rows', () => {
  it('shows the active owned reservation as funded even when national free stock is zero', () => {
    const base = gameWithTwoCities('reserve-city-owned');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    const enqueued = enqueueCityProduction(state, base.a, 'swordsman');
    expect(enqueued.ok).toBe(true);
    state = enqueued.state;

    const rows = getCityMaterialQueueRows(state, 'player', base.a);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      index: 0,
      itemId: 'swordsman',
      status: 'active',
      reserved: true,
      funded: true,
      legalNow: true,
      fundableNow: true,
      missingQuantity: 0,
    });
    expect(rows![0].rows).toEqual([{
      goodId: iron, name: 'Iron', icon: '⚙️',
      required: 10, committed: 10, free: 0, available: 10, missing: 0,
    }]);
    expect(rows![0].estimatedTurns).toBeGreaterThanOrEqual(1);
    expect(rows![0].productionOnlyTurns).toBeGreaterThanOrEqual(1);
  });

  it('shows a second city waiting for the full recipe the first city already reserved', () => {
    const base = gameWithTwoCities('reserve-city-second');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    const waiting = enqueueCityProduction(state, base.b, 'swordsman');
    expect(waiting.ok).toBe(true);
    state = waiting.state;

    const rows = getCityMaterialQueueRows(state, 'player', base.b)!;
    expect(rows[0]).toMatchObject({
      status: 'active',
      reserved: false,
      funded: false,
      fundableNow: false,
      missingQuantity: 10,
      estimatedTurns: null,
    });
    expect(rows[0].rows[0]).toMatchObject({ required: 10, committed: 0, free: 0, available: 0, missing: 10 });

    const first = getCityMaterialQueueRows(state, 'player', base.a)!;
    expect(first[0].funded).toBe(true);
    expect(first[0].reserved).toBe(true);
  });

  it('marks a tail entry as planned and never as reserved', () => {
    const base = gameWithTwoCities('reserve-city-tail');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    // A tail item does not claim anything, even with no free stock left.
    state = {
      ...state,
      cities: {
        ...state.cities,
        [base.a]: { ...state.cities[base.a], productionQueue: [...state.cities[base.a].productionQueue, 'warrior'] },
      },
    };

    const rows = getCityMaterialQueueRows(state, 'player', base.a)!;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      index: 1,
      itemId: 'warrior',
      status: 'planned',
      reserved: false,
      committed: 0,
      estimatedTurns: null,
    });
    expect(rows[1].rows.reduce((total, row) => total + row.committed, 0)).toBe(0);
  });

  it('gates fundable-now on the whole recipe, not access alone', () => {
    const base = gameWithTwoCities('reserve-city-negative-controls');
    let state = prepare(base.state);
    // Access exists (city center deposit) but there is no stored stock: source-only is not funded.
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 0, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    let row = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(row.funded).toBe(false);
    expect(row.fundableNow).toBe(false);
    expect(row.missingQuantity).toBe(10);

    // One short of ten is still waiting, with the exact deficit.
    state = withLedger(state, ledger({ [iron]: { native: 9, imported: 0 } }));
    row = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(row).toMatchObject({ funded: false, fundableNow: false, missingQuantity: 1 });
    expect(row.rows[0]).toMatchObject({ required: 10, available: 9, missing: 1 });

    // A second row of the recipe is missing entirely: ten iron is not a knight.
    state = {
      ...state,
      cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionQueue: ['knight'] } },
    };
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    row = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(row).toMatchObject({ funded: false, fundableNow: false });
    expect(row.rows.find(candidate => candidate.goodId === horses)).toMatchObject({ required: 10, missing: 10 });

    // Incoming stock is not spendable.
    state = {
      ...state,
      cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionQueue: ['swordsman'] } },
    };
    state = withLedger(state, ledger({}, {
      incoming: [{ id: 'manifest-1', goodId: iron, ownerCivId: 'player', amount: 10 }],
    }));
    row = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(row).toMatchObject({ funded: false, fundableNow: false, missingQuantity: 10 });
    expect(suppliesRow(state, iron).incoming).toBe(10);

    // Legacy/purchased access is still not stock.
    state = {
      ...state,
      marketplace: {
        ...(state.marketplace ?? {}),
        purchasedResources: [{ civId: 'player', resource: 'iron', expiresOnTurn: state.turn + 5 }],
      } as GameState['marketplace'],
    };
    row = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(row).toMatchObject({ funded: false, fundableNow: false, missingQuantity: 10 });
  });

  it('reports only its own city to the owning civilization', () => {
    const base = gameWithTwoCities('reserve-city-owner-scope');
    const state = prepare(base.state);
    expect(getCityMaterialQueueRows(state, 'ai-1', base.a)).toBeNull();
  });

  it('denies an unknown item instead of treating it as free production', () => {
    const base = gameWithTwoCities('reserve-city-unknown');
    const state = prepare(base.state);
    const withUnknown: GameState = {
      ...state,
      cities: { ...state.cities, [base.a]: { ...state.cities[base.a], productionQueue: ['not-a-real-item'] } },
    };
    const projection = getCityMaterialProjection(withUnknown, base.a);
    expect(projection.known).toBe(false);
    expect(projection.funded).toBe(false);

    const row = getCityMaterialQueueRows(withUnknown, 'player', base.a)![0];
    expect(row).toMatchObject({ itemId: 'not-a-real-item', known: false, funded: false, fundableNow: false, estimatedTurns: null });
  });

  it('updates both city forecasts and Supplies after a release', () => {
    const base = gameWithTwoCities('reserve-city-release');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;
    state = enqueueCityProduction(state, base.b, 'swordsman').state;

    expect(suppliesRow(state, iron)).toMatchObject({ committed: 10, free: 0 });

    state = releaseCityMaterialCommitment(state, base.a);

    expect(suppliesRow(state, iron)).toMatchObject({ committed: 0, free: 10, stored: 10 });
    const released = getCityMaterialQueueRows(state, 'player', base.a)![0];
    expect(released).toMatchObject({ reserved: false, funded: true, fundableNow: true });
    const second = getCityMaterialQueueRows(state, 'player', base.b)![0];
    expect(second).toMatchObject({ funded: true, missingQuantity: 0 });
  });
});

describe('#1506 MR09 task 8 — production decision waits honestly', () => {
  it('withholds a completion estimate for a waiting head and reports production-only effort', () => {
    const base = gameWithTwoCities('reserve-decision-waiting');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 9, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;

    const decision = getProductionDecision(state, 'player', base.a)!;
    expect(decision.materials).toMatchObject({
      funded: false,
      waiting: true,
      missingQuantity: 1,
    });
    expect(decision.turnsToComplete).toBeNull();
    expect(decision.finishesThisTurn).toBe(false);
    expect(decision.rush.turnsSaved).toBeNull();
    expect(decision.materials.productionOnlyTurns).toBeGreaterThanOrEqual(1);
  });

  it('keeps the normal completion estimate for a funded head', () => {
    const base = gameWithTwoCities('reserve-decision-funded');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));
    state = enqueueCityProduction(state, base.a, 'swordsman').state;

    const decision = getProductionDecision(state, 'player', base.a)!;
    expect(decision.materials).toMatchObject({ funded: true, waiting: false, missingQuantity: 0 });
    expect(decision.turnsToComplete).toBeGreaterThanOrEqual(1);
    expect(decision.materials.productionOnlyTurns).toBe(decision.turnsToComplete);
  });
});

describe('#1506 MR09 task 8 — viewer scoping', () => {
  it('does not let a rival stock, source or reveal change the viewer’s Supplies rows', () => {
    const base = gameWithTwoCities('reserve-viewer-supplies');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));

    const surface: ViewerSurface<GameState, ReturnType<typeof getReserveSuppliesRows>> = {
      name: 'Supplies reserve rows',
      project: (world, viewerId) => getReserveSuppliesRows(world, viewerId),
    };

    expectHiddenFromViewer(surface, state, 'player', {
      label: 'rival holds copper stock and a copper source',
      apply: world => {
        world.materialReservesByCiv = {
          ...(world.materialReservesByCiv ?? {}),
          'ai-1': ledger({ [copper]: { native: 40, imported: 0 } }),
        };
        const rivalCity = Object.values(world.cities).find(city => city.owner === 'ai-1');
        if (rivalCity) world.map.tiles[hexKey(rivalCity.position)].resource = 'copper';
      },
    });

    expectEarnedByViewer(surface, state, 'player', {
      label: 'the viewer’s own iron deposit grows',
      apply: world => {
        world.materialReservesByCiv = {
          ...(world.materialReservesByCiv ?? {}),
          player: ledger({ [iron]: { native: 14, imported: 0 } }),
        };
      },
    });
  });

  it('shows a hot-seat viewer their own new reveal and nothing to the other seat', () => {
    const base = gameWithTwoCities('reserve-viewer-hotseat');
    let state = prepare(base.state);
    state.map.tiles[hexKey(state.cities[base.a].position)].resource = 'iron';
    state = withLedger(state, ledger({ [iron]: { native: 10, imported: 0 } }));

    const surface: ViewerSurface<GameState, ReturnType<typeof getReserveSuppliesRows>> = {
      name: 'Supplies reserve rows',
      project: (world, viewerId) => getReserveSuppliesRows(world, viewerId),
    };

    expectHotSeatDifferential(surface, {
      world: state,
      viewers: ['player', 'ai-1'],
      knownOnlyTo: 'ai-1',
      mutation: {
        label: 'the AI seat reveals and owns copper',
        apply: world => {
          const ai = world.civilizations['ai-1'];
          ai.techState.completed = [...new Set([...ai.techState.completed, 'stone-weapons'])];
          world.materialReservesByCiv = {
            ...(world.materialReservesByCiv ?? {}),
            'ai-1': ledger({ [copper]: { native: 10, imported: 0 } }),
          };
        },
      },
    });
  });
});
