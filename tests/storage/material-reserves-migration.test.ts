import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { getMaterialRecipe } from '@/systems/resource-material-costs';
import { consumeMaterialRecipe, releaseMaterialReservation } from '@/systems/resource-material-costs';
import {
  getCommittedQuantity,
  getReserveBalance,
  validateReserveLedger,
} from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { migrateMaterialReserves } from '@/storage/migrations/steps/material-reserves';
import { migrateSaveToCurrent } from '@/storage/save-migrations';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-schema-version';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';

/**
 * #1506 MR09 task 3 — the one-time 35 → 36 reserve transition.
 *
 * These cases pin the transition policy directly (§3.7): a bounded native seed from *owned* sources,
 * a finite imported grant only for legacy-entitled or already-invested **active** work, no grant for a
 * queue tail, a completed item or an already-current save, and a release that extinguishes assistance
 * without destroying ordinary imported stock.
 */

const iron = resourceGoodId('iron');
const swordsman = 'swordsman';

function foundedGame(seed: string): { state: GameState; cityId: string } {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed, gameTitle: seed });
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
  if (!settler) throw new Error('no settler');
  const city = foundCity('player', settler.position, state.map, {
    nextUnitId: 9000, nextCityId: 9000, nextCampId: 9000, nextQuestId: 9000,
  }, { civType: state.civilizations.player.civType });
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  delete state.units[settler.id];
  state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== settler.id);
  return { state, cityId: city.id };
}

/** Strip exactly what a schema-35 save would not have, keeping the rest of the world intact. */
function asPreActivation(state: GameState): GameState {
  const raw = structuredClone(state);
  delete raw.materialReservesByCiv;
  for (const city of Object.values(raw.cities)) delete city.productionMaterials;
  raw.saveSchemaVersion = 35;
  return raw;
}

function revealIron(state: GameState, civId = 'player'): void {
  state.civilizations[civId].techState.completed = [
    ...new Set([...state.civilizations[civId].techState.completed, 'bronze-working']),
  ];
}

function removeAllIron(state: GameState, civId = 'player'): void {
  for (const cityId of state.civilizations[civId].cities) {
    for (const coord of state.cities[cityId].ownedTiles) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile?.resource === 'iron') delete (tile as { resource?: string }).resource;
    }
  }
}

function placeIronSource(state: GameState, cityId: string): void {
  state.map.tiles[hexKey(state.cities[cityId].position)].resource = 'iron';
}

function addPurchasedIronAccess(state: GameState, civId = 'player'): void {
  state.marketplace!.purchasedResources = [
    ...(state.marketplace!.purchasedResources ?? []),
    { civId, resource: 'iron', expiresOnTurn: state.turn + 5 },
  ];
}

function migrate(state: GameState): GameState {
  return migrateMaterialReserves(asPreActivation(state));
}

describe('#1506 MR09 — one-time material reserve migration (35 → 36)', () => {
  it('a current-schema new game reloads with the identical ledger and no grants', () => {
    const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed: 'material-current-reload', gameTitle: 'reload' });
    const created = migrateSaveToCurrent(state);
    const parsed = parseSaveFile(serializeSaveFile(created));
    if (parsed.status !== 'success') throw new Error(`save round trip failed: ${parsed.message}`);
    const reloaded = migrateSaveToCurrent(parsed.state);
    expect(reloaded.materialReservesByCiv).toEqual(created.materialReservesByCiv);
    expect(reloaded.materialReservesByCiv!.player.lastAccruedTurn).toBe(-1);
    for (const ledger of Object.values(reloaded.materialReservesByCiv ?? {})) {
      expect(ledger.reservations).toEqual([]);
      expect(ledger.incoming).toEqual([]);
    }
  });

  it('seeds one native source as 2 units and many sources as at most 40', () => {
    const single = foundedGame('material-seed-one');
    revealIron(single.state);
    removeAllIron(single.state);
    placeIronSource(single.state, single.cityId);

    const one = migrate(single.state);
    expect(getReserveBalance(one.materialReservesByCiv!.player, iron)).toEqual({ native: 2, imported: 0 });
    expect(one.materialReservesByCiv!.player.lastAccruedTurn).toBe(-1);

    const many = foundedGame('material-seed-many');
    revealIron(many.state);
    removeAllIron(many.state);
    const city = many.state.cities[many.cityId];
    city.ownedTiles = [];
    for (let index = 0; index < 25; index += 1) {
      const coord = { q: 200 + index, r: 200 };
      many.state.map.tiles[hexKey(coord)] = {
        ...many.state.map.tiles[hexKey(city.position)],
        coord,
        resource: 'iron',
        improvement: 'mine',
        improvementTurnsLeft: 0,
        owner: 'player',
      } as GameState['map']['tiles'][string];
      city.ownedTiles.push(coord);
    }

    const capped = migrate(many.state);
    expect(getReserveBalance(capped.materialReservesByCiv!.player, iron)).toEqual({ native: 40, imported: 0 });
  });

  it('grants exactly the missing amounts to a purchased-access active swordsman, and nothing to the queue tail', () => {
    const { state, cityId } = foundedGame('material-purchased-only');
    revealIron(state);
    removeAllIron(state);
    addPurchasedIronAccess(state);
    const city = state.cities[cityId];
    city.productionQueue = [swordsman, swordsman];
    city.productionProgress = 0;

    const migrated = migrate(state);
    const ledger = migrated.materialReservesByCiv!.player;
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 0, imported: 10 });
    expect(getCommittedQuantity(ledger, iron)).toBe(10);
    expect(ledger.incoming).toEqual([]);
    expect(ledger.reservations).toHaveLength(1);
    expect(ledger.reservations[0].reason).toBe('migration-grant');
    expect(ledger.reservations[0].migrationGrantImported).toBe(10);
    expect(validateReserveLedger(ledger)).toEqual([]);

    const commitment = migrated.cities[cityId].productionMaterials!.commitment!;
    expect(commitment.ref).toMatchObject({ ownerCivId: 'player', cityId, itemId: swordsman, occurrence: 0 });
    expect(commitment.reservationIds).toHaveLength(1);
    // The duplicate in the tail is planned, not funded.
    expect(migrated.cities[cityId].productionQueue).toEqual([swordsman, swordsman]);
  });

  it('reserves the 2-unit native seed first and grants only the 8-unit deficit', () => {
    const { state, cityId } = foundedGame('material-native-plus-grant');
    revealIron(state);
    removeAllIron(state);
    placeIronSource(state, cityId);
    state.cities[cityId].productionQueue = [swordsman];
    state.cities[cityId].productionProgress = 2;

    const migrated = migrate(state);
    const ledger = migrated.materialReservesByCiv!.player;
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 2, imported: 8 });
    expect(getCommittedQuantity(ledger, iron)).toBe(10);
    expect(ledger.reservations.map(reservation => reservation.reason).sort())
      .toEqual(['active-production', 'migration-grant']);
    expect(ledger.reservations.find(reservation => reservation.reason === 'migration-grant')?.migrationGrantImported).toBe(8);
    expect(validateReserveLedger(ledger)).toEqual([]);
  });

  it('honours already-invested work after a source loss but grants nothing to completed entities', () => {
    const { state, cityId } = foundedGame('material-progress-after-loss');
    revealIron(state);
    removeAllIron(state);
    const city = state.cities[cityId];
    city.productionQueue = [swordsman];
    city.productionProgress = 5; // already under way when the source disappeared
    city.buildings = [...city.buildings, 'iron-foundry'];

    const migrated = migrate(state);
    const ledger = migrated.materialReservesByCiv!.player;
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 0, imported: 10 });
    expect(migrated.cities[cityId].productionMaterials!.commitment?.ref.itemId).toBe(swordsman);

    // A completed hard building and an idle queue receive no retroactive bill.
    const settled = foundedGame('material-completed');
    revealIron(settled.state);
    removeAllIron(settled.state);
    settled.state.cities[settled.cityId].buildings = ['iron-foundry'];
    const after = migrate(settled.state);
    expect(after.materialReservesByCiv!.player.reservations).toEqual([]);
    expect(after.materialReservesByCiv!.player.incoming).toEqual([]);
  });

  it('spends a completed grant once and never re-grants on a second normalization', () => {
    const { state, cityId } = foundedGame('material-grant-completion');
    revealIron(state);
    removeAllIron(state);
    addPurchasedIronAccess(state);
    state.cities[cityId].productionQueue = [swordsman];

    const migrated = migrate(state);
    const commitment = migrated.cities[cityId].productionMaterials!.commitment!;
    const recipe = getMaterialRecipe(swordsman);
    if (!recipe.known) throw new Error('swordsman must have a recipe');

    const spent = consumeMaterialRecipe(migrated.materialReservesByCiv!.player, recipe.recipe, {
      reservationIds: Object.fromEntries(commitment.reservationIds.map(id => [iron, id])),
    });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(spent.consumed).toEqual([{ goodId: iron, imported: 10, native: 0 }]);
    expect(getReserveBalance(spent.ledger, iron)).toEqual({ native: 0, imported: 0 });
    expect(spent.ledger.reservations).toEqual([]);

    // Reloading the migrated (now current-schema) state must not seed or grant again. The ordered
    // step only runs below 36; running it against an already-current ledger preserves it verbatim.
    const current: GameState = {
      ...migrated,
      saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      materialReservesByCiv: { player: spent.ledger },
    };
    const reloaded = migrateSaveToCurrent(current);
    expect(getReserveBalance(reloaded.materialReservesByCiv!.player, iron)).toEqual({ native: 0, imported: 0 });
    expect(reloaded.materialReservesByCiv!.player.reservations).toEqual([]);
  });

  it('cancel extinguishes the grant and the commitment but keeps the original native seed', () => {
    const { state, cityId } = foundedGame('material-grant-cancel');
    revealIron(state);
    removeAllIron(state);
    placeIronSource(state, cityId);
    state.cities[cityId].productionQueue = [swordsman];

    const migrated = migrate(state);
    const commitment = migrated.cities[cityId].productionMaterials!.commitment!;
    let ledger = migrated.materialReservesByCiv!.player;
    for (const reservationId of commitment.reservationIds) {
      const released = releaseMaterialReservation(ledger, reservationId);
      expect(released.ok).toBe(true);
      if (released.ok) ledger = released.ledger;
    }
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 2, imported: 0 });
    expect(getCommittedQuantity(ledger, iron)).toBe(0);

    // Repeating a release is a typed no-op and cannot mint stock.
    const again = releaseMaterialReservation(ledger, commitment.reservationIds[0]);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(getReserveBalance(again.ledger, iron)).toEqual({ native: 2, imported: 0 });

    // A reload of the same pre-activation state is deterministic, but re-running the step on the
    // already-migrated ledger does not add a second grant.
    const rerun = migrateMaterialReserves({ ...migrated, materialReservesByCiv: { player: ledger }, cities: {
      ...migrated.cities,
      [cityId]: { ...migrated.cities[cityId], productionMaterials: { ...migrated.cities[cityId].productionMaterials!, commitment: null } },
    } });
    expect(getReserveBalance(rerun.materialReservesByCiv!.player, iron)).toEqual({ native: 2, imported: 8 });
  });

  it('extinguishes only the tagged grant, never ordinary imported stock', () => {
    const { state, cityId } = foundedGame('material-mixed-imported');
    revealIron(state);
    removeAllIron(state);
    addPurchasedIronAccess(state);
    state.cities[cityId].productionQueue = [swordsman];

    // Ordinary imported stock already owned by the civ (a legitimate prior delivery would look like
    // this at the ledger level; the point is that release must not touch it).
    const preActivation = asPreActivation(state);
    preActivation.materialReservesByCiv = {
      player: { balances: { [iron]: { native: 0, imported: 5 } }, reservations: [], incoming: [] },
    };

    const migrated = migrateMaterialReserves(preActivation);
    const ledger = migrated.materialReservesByCiv!.player;
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 0, imported: 10 });
    const grant = ledger.reservations.find(reservation => reservation.reason === 'migration-grant')!;
    expect(grant.migrationGrantImported).toBe(5);

    const released = releaseMaterialReservation(ledger, grant.id);
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    // The 5 paid units survive; only the 5 assisted units expire, and the ordinary reservation remains.
    expect(getReserveBalance(released.ledger, iron)).toEqual({ native: 0, imported: 5 });
    expect(getCommittedQuantity(released.ledger, iron)).toBe(5);
  });
});
