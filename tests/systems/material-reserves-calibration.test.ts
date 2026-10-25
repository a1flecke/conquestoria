import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getCityMaterialProjection } from '@/systems/city-production-materials';
import { getReserveSuppliesRows } from '@/systems/resource-reserve-presentation';
import { resourceGoodId, standardQuantityProfile } from '@/systems/trade-good-definitions';
import { getMaterialRecipe } from '@/systems/resource-material-costs';

/**
 * #1506 MR09 task 11 — the measured hard-material pacing contract.
 *
 * One shared calibration (10 units per standard recipe, 2 units per eligible source per
 * completed round, 40 storage) is asserted through the real round phase, not a copied table.
 * The record keeps source output, funding wait, completed useful items and retained progress
 * together so a future tuning change must update this acceptance evidence intentionally.
 */

interface PacingRecord {
  itemId: string;
  sources: Readonly<Record<string, number>>;
  fundedRound: number | null;
  progressRetainedWhileWaiting: boolean;
  completedUsefulItems: number;
}

function world(options: {
  itemId: string;
  techs: string[];
  sources?: Array<{ resource: 'copper' | 'iron' | 'horses' | 'uranium'; improvement: string }>;
  progress?: number;
}): { state: GameState; cityId: string } {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed: `material-calibration-${options.itemId}`, gameTitle: options.itemId });
  const civ = state.civilizations.player;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler');
  if (!settler) throw new Error('no settler');
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  city.id = 'calibration-city';
  city.population = 5;
  city.productionQueue = [options.itemId];
  city.productionProgress = options.progress ?? 0;
  city.productionMaterials = { queueRevision: 0, activeOccurrence: 0, commitment: null };
  state.cities[city.id] = city;
  civ.cities = [city.id];
  civ.units = civ.units.filter(id => id !== settler.id);
  delete state.units[settler.id];
  civ.techState.completed = options.techs;
  civ.techState.currentResearch = 'natural-philosophy';
  state.currentPlayer = civ.id;

  for (const tile of Object.values(state.map.tiles)) {
    if (tile.resource === 'copper' || tile.resource === 'iron' || tile.resource === 'horses' || tile.resource === 'uranium') {
      delete (tile as { resource?: string }).resource;
    }
  }
  const tiles = [city.position, ...city.ownedTiles.filter(coord => hexKey(coord) !== hexKey(city.position))];
  for (const [index, source] of (options.sources ?? []).entries()) {
    const coord = tiles[index] ?? hexNeighbors(city.position)[index];
    if (!coord) break;
    if (!city.ownedTiles.some(candidate => hexKey(candidate) === hexKey(coord))) city.ownedTiles.push(coord);
    const tile = state.map.tiles[hexKey(coord)];
    if (!tile) continue;
    tile.resource = source.resource;
    tile.improvement = source.improvement as never;
    tile.improvementTurnsLeft = 0;
    tile.owner = civ.id;
  }
  state.materialReservesByCiv = {
    ...(state.materialReservesByCiv ?? {}),
    [civ.id]: { balances: {}, reservations: [], incoming: [], lastAccruedTurn: -1 },
  };
  return { state, cityId: city.id };
}

function advance(state: GameState): GameState {
  return processTurn(state, new EventBus());
}

function measureFunding(state: GameState, cityId: string, maxRounds = 8): { fundedRound: number | null; state: GameState; retained: boolean } {
  let current = state;
  const initialProgress = current.cities[cityId].productionProgress;
  let retained = true;
  for (let round = 1; round <= maxRounds; round++) {
    current = advance(current);
    const projection = getCityMaterialProjection(current, cityId);
    if (projection.funded) return { fundedRound: round, state: current, retained };
    if (current.cities[cityId].productionProgress !== initialProgress && initialProgress > 0) retained = false;
  }
  return { fundedRound: null, state: current, retained };
}

function completedCount(state: GameState, type: string): number {
  return Object.values(state.units).filter(unit => unit.owner === 'player' && unit.type === type).length
    + Object.values(state.cities).flatMap(city => city.buildings).filter(id => id === type).length;
}

describe('#1506 MR09 task 11 — measured pacing and fallback', () => {
  it('keeps the shared calibration in the catalog', () => {
    expect(standardQuantityProfile()).toMatchObject({
      standardRecipeQuantity: 10,
      nativePerSourcePerRound: 2,
      storageCapacity: 40,
    });
    expect(getMaterialRecipe('axeman')).toMatchObject({ known: true, recipe: { rows: [{ goodId: resourceGoodId('copper'), quantity: 10 }] } });
    expect(getMaterialRecipe('knight')).toMatchObject({
      known: true,
      recipe: {
        rows: [
          { goodId: resourceGoodId('horses'), quantity: 10 },
          { goodId: resourceGoodId('iron'), quantity: 10 },
        ],
      },
    });
    expect(getMaterialRecipe('nuclear_power_plant')).toMatchObject({
      known: true,
      recipe: { rows: [{ goodId: resourceGoodId('uranium'), quantity: 10 }] },
    });
  });

  it('funds an early copper recipe on the measured round and completes useful work', () => {
    const { state, cityId } = world({
      itemId: 'axeman',
      techs: ['stone-weapons', 'mining-tech'],
      sources: [{ resource: 'copper', improvement: 'mine' }],
      progress: 21,
    });
    const copper = getReserveSuppliesRows(state, 'player').find(row => row.resource === 'copper')!;
    expect(copper).toMatchObject({ sources: 1, extractionPerRound: 2 });

    const measured = measureFunding(state, cityId);
    let completedState = measured.state;
    let extraRounds = 0;
    while (completedCount(completedState, 'axeman') === 0 && extraRounds < 6) {
      completedState = advance(completedState);
      extraRounds += 1;
    }
    const record: PacingRecord = {
      itemId: 'axeman',
      sources: { copper: copper.extractionPerRound },
      fundedRound: measured.fundedRound,
      progressRetainedWhileWaiting: measured.retained,
      completedUsefulItems: completedCount(completedState, 'axeman'),
    };
    expect(record).toMatchObject({
      fundedRound: 5,
      progressRetainedWhileWaiting: true,
      completedUsefulItems: 1,
    });
    // 10 per recipe / 2 per source per round is the tuning contract, not a copied 5.
    expect(record.fundedRound).toBe(Math.ceil(10 / 2));
  });

  it('funds early iron on the same five-round curve', () => {
    const { state, cityId } = world({
      itemId: 'swordsman',
      techs: ['bronze-working', 'mining-tech'],
      sources: [{ resource: 'iron', improvement: 'mine' }],
    });
    const iron = getReserveSuppliesRows(state, 'player').find(row => row.resource === 'iron')!;
    expect(iron).toMatchObject({ sources: 1, extractionPerRound: 2 });
    expect(measureFunding(state, cityId).fundedRound).toBe(5);
  });

  it('requires both knight rows and funds them in parallel when each has a source', () => {
    const { state, cityId } = world({
      itemId: 'knight',
      techs: ['iron-forging', 'bronze-working', 'animal-husbandry'],
      sources: [
        { resource: 'horses', improvement: 'pasture' },
        { resource: 'iron', improvement: 'mine' },
      ],
    });
    let current = state;
    for (let round = 1; round <= 4; round++) {
      current = advance(current);
      expect(getCityMaterialProjection(current, cityId).funded, `round ${round}`).toBe(false);
    }
    const supplies = getReserveSuppliesRows(state, 'player');
    expect(supplies.find(row => row.resource === 'horses')).toMatchObject({ sources: 1, extractionPerRound: 2 });
    expect(supplies.find(row => row.resource === 'iron')).toMatchObject({ sources: 1, extractionPerRound: 2 });
    expect(measureFunding(state, cityId).fundedRound).toBe(5);
  });

  it('funds a late uranium recipe on the same curve', () => {
    const { state, cityId } = world({
      itemId: 'nuclear_power_plant',
      techs: ['nuclear-power', 'nuclear-physics'],
      sources: [{ resource: 'uranium', improvement: 'mine' }],
    });
    const uranium = getReserveSuppliesRows(state, 'player').find(row => row.resource === 'uranium')!;
    expect(uranium).toMatchObject({ sources: 1, extractionPerRound: 2 });
    expect(measureFunding(state, cityId).fundedRound).toBe(5);
  });

  it('keeps a source-poor waiting head and its progress instead of discarding it', () => {
    const { state, cityId } = world({
      itemId: 'swordsman',
      techs: ['bronze-working'],
      progress: 23,
    });
    const measured = measureFunding(state, cityId);
    expect(measured.fundedRound).toBeNull();
    expect(measured.state.cities[cityId].productionProgress).toBe(23);
    expect(measured.state.cities[cityId].productionQueue).toEqual(['swordsman']);
    expect(getReserveSuppliesRows(measured.state, 'player').find(row => row.resource === 'iron')?.extractionPerRound).toBe(0);
  });
});
