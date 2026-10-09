import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity, processCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getIdleProductionDecision, getProductionDecision, projectActiveProduction } from '@/systems/production-decision';

import { buildProductionCostContext, getProductionCostForCivItem } from '@/systems/production-cost-context';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { getQueueMoveConsequence, getQueueRemoveConsequence, removeCityProductionItem, reorderCityProduction } from '@/systems/planning-system';
import { getRushBuyQuote } from '@/systems/economy-system';

const CIV = 'ai-1';
const CITY = 'city-a';

function setup(seed: string): GameState {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: seed, seed });
  const civ = state.civilizations[CIV]!;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  city.id = CITY;
  city.population = 4;
  city.productionQueue = [];
  city.productionProgress = 0;
  state.cities[CITY] = city;
  civ.cities.push(CITY);
  for (const coord of [city.position, ...hexNeighbors(city.position)]) {
    const tile = state.map.tiles[hexKey(coord)];
    if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) tile.terrain = 'plains';
  }
  civ.units = civ.units.filter(id => state.units[id]?.type !== 'settler');
  delete state.units[settler.id];
  civ.gold = 5000;
  return state;
}

const city = (state: GameState): City => state.cities[CITY]!;

/** Run the real city turn with exactly `production` and return what actually happened. */
function realTurn(state: GameState, production: number) {
  return processCity(city(state), state.map, 0, production, buildProductionCostContext(state, CIV, CITY));
}

describe('getProductionDecision (production-decision arc)', () => {
  it('says an item finishes this turn exactly when the real turn completes it, and rush is then redundant', () => {
    const state = setup('pd-finishes');
    city(state).productionQueue = ['warrior'];
    city(state).productionProgress = 7; // warrior costs 8
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 5 })!;

    expect(decision.cost).toBe(getProductionCostForCivItem(state, CIV, CITY, 'warrior'));
    expect(decision.remaining).toBe(decision.cost - 7);
    expect(decision.finishesThisTurn).toBe(true);
    expect(decision.turnsToComplete).toBe(1);
    expect(decision.rush.redundant).toBe(true);
    expect(decision.rush.turnsSaved).toBe(0);
    expect(decision.rush.available).toBe(true);
    expect(decision.rush.goldCost).toBe(getRushBuyQuote(state, CIV, CITY).cost);
    expect(decision.isEstimate).toBe(true);

    expect(realTurn(state, 5).completedUnit).toBe('warrior');
  });

  it('a multi-turn item saves the right number of turns when bought, and is not redundant', () => {
    const state = setup('pd-multi');
    city(state).productionQueue = ['warrior'];
    city(state).productionProgress = 0;
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 3 })!;

    expect(decision.turnsToComplete).toBe(Math.ceil(decision.cost / 3));
    expect(decision.finishesThisTurn).toBe(false);
    expect(decision.rush.turnsSaved).toBe(decision.turnsToComplete! - 1);
    expect(decision.rush.redundant).toBe(false);

    // The real turns agree: two turns of 3 do not finish a cost-8 item, three do.
    let c = city(state);
    for (let turn = 1; turn <= 3; turn++) {
      const result = processCity(c, state.map, 0, 3, buildProductionCostContext(state, CIV, CITY));
      if (turn < decision.turnsToComplete!) expect(result.completedUnit).toBeNull();
      else expect(result.completedUnit).toBe('warrior');
      c = result.city;
    }
  });

  it('a locked city has no production, no ETA, and a rush there is not redundant', () => {
    const state = setup('pd-locked');
    city(state).productionQueue = ['warrior'];
    city(state).productionProgress = 7;
    city(state).unrestLevel = 2;
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 50 })!;

    expect(decision.locked).toBe(true);
    expect(decision.productionPerTurn).toBe(0);
    expect(decision.turnsToComplete).toBeNull();
    expect(decision.finishesThisTurn).toBe(false);
    expect(decision.rush.turnsSaved).toBeNull();
    expect(decision.rush.redundant).toBe(false);
    expect(decision.overflow.outcome).toBe('none');
  });

  it('reports the stored production a head change would erase, matching the real commands', () => {
    const state = setup('pd-head');
    city(state).productionQueue = ['warrior', 'workshop', 'granary'];
    city(state).productionProgress = 6;
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 2 })!;
    expect(decision.progressAtStake).toBe(6);

    // Moving a later item to the front replaces the active item: the preview and the command agree.
    expect(getQueueMoveConsequence(city(state), 1, 0)).toEqual({ changesActiveItem: true, progressLost: 6 });
    expect(reorderCityProduction(city(state), 1, 0).productionProgress).toBe(0);
    // Reordering behind the head keeps progress, and the preview says so.
    expect(getQueueMoveConsequence(city(state), 2, 1)).toEqual({ changesActiveItem: false, progressLost: 0 });
    expect(reorderCityProduction(city(state), 2, 1).productionProgress).toBe(6);
    // Removing the head erases it; removing a later item does not.
    expect(getQueueRemoveConsequence(city(state), 0)).toEqual({ changesActiveItem: true, progressLost: 6 });
    expect(removeCityProductionItem(city(state), 0).productionProgress).toBe(0);
    expect(getQueueRemoveConsequence(city(state), 2)).toEqual({ changesActiveItem: false, progressLost: 0 });
    expect(removeCityProductionItem(city(state), 2).productionProgress).toBe(6);
    // Out-of-range edits are no-ops and promise no loss.
    expect(getQueueRemoveConsequence(city(state), 9)).toEqual({ changesActiveItem: false, progressLost: 0 });
    expect(getQueueMoveConsequence(city(state), 5, 0)).toEqual({ changesActiveItem: false, progressLost: 0 });
  });

  it('projects surplus and what the real rules do with it: discarded without 3d-printing', () => {
    const state = setup('pd-overflow');
    city(state).productionQueue = ['warrior', 'workshop'];
    city(state).productionProgress = 0; // warrior costs 8
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 20 })!;

    expect(decision.overflow).toEqual({ excess: 12, outcome: 'discarded', carryNeedsQueuedItem: false });
    const real = realTurn(state, 20).production;
    expect(real.discarded).toBe(12);
    expect(real.carriedOver).toBe(0);
  });

  it('with 3d-printing the surplus carries only when something is queued behind', () => {
    const queued = setup('pd-carry');
    queued.civilizations[CIV]!.techState.completed.push('3d-printing');
    city(queued).productionQueue = ['warrior', 'workshop'];
    const carried = getProductionDecision(queued, CIV, CITY, { productionPerTurn: 20 })!;
    const surplus = 20 - carried.cost; // the cost moves with the era 3d-printing belongs to
    expect(carried.overflow).toEqual({ excess: surplus, outcome: 'carried', carryNeedsQueuedItem: false });
    const realCarried = processCity(city(queued), queued.map, 0, 20, buildProductionCostContext(queued, CIV, CITY));
    expect(realCarried.production.carriedOver).toBe(surplus);
    expect(realCarried.production.discarded).toBe(0);

    const alone = setup('pd-carry-alone');
    alone.civilizations[CIV]!.techState.completed.push('3d-printing');
    city(alone).productionQueue = ['warrior'];
    const lost = getProductionDecision(alone, CIV, CITY, { productionPerTurn: 20 })!;
    expect(lost.overflow).toEqual({ excess: 20 - lost.cost, outcome: 'discarded', carryNeedsQueuedItem: true });
    expect(processCity(city(alone), alone.map, 0, 20, buildProductionCostContext(alone, CIV, CITY)).production.discarded).toBe(20 - lost.cost);
  });

  it('reports no overflow when production does not exceed the remaining cost', () => {
    const state = setup('pd-no-overflow');
    city(state).productionQueue = ['warrior'];
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 8 })!;
    expect(decision.overflow).toEqual({ excess: 0, outcome: 'none', carryNeedsQueuedItem: false });
    expect(realTurn(state, 8).production.discarded).toBe(0);
  });

  it('prices buildings, units and national projects through the same canonical cost', () => {
    const state = setup('pd-kinds');
    const nationalProject = Object.values(BUILDINGS).find(b => b.nationalProject)!;
    for (const itemId of ['warrior', 'granary', nationalProject.id]) {
      city(state).productionQueue = [itemId];
      const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 4 })!;
      expect(decision.cost).toBe(getProductionCostForCivItem(state, CIV, CITY, itemId));
      expect(decision.itemId).toBe(itemId);
    }
  });

  it('a legendary wonder reports that it cannot be bought', () => {
    const state = setup('pd-wonder');
    city(state).productionQueue = ['legendary:oracle-of-delphi'];
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 4 })!;
    expect(decision.rush.available).toBe(false);
    expect(decision.rush.reason).toBe('wonders-cannot-be-bought');
    expect(decision.rush.redundant).toBe(false);
  });

  it('a stalled city (no production) has no ETA but still shows a rush price', () => {
    const state = setup('pd-stalled');
    city(state).productionQueue = ['warrior'];
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 0 })!;
    expect(decision.turnsToComplete).toBeNull();
    expect(decision.rush.turnsSaved).toBeNull();
    expect(decision.rush.redundant).toBe(false);
    expect(decision.rush.goldCost).toBeGreaterThan(0);
  });

  it('returns nothing for a missing city, a city the civ does not own, or an empty queue', () => {
    const state = setup('pd-negative');
    expect(getProductionDecision(state, CIV, CITY)).toBeNull(); // empty queue
    expect(getProductionDecision(state, CIV, 'nope')).toBeNull();
    city(state).productionQueue = ['warrior'];
    expect(getProductionDecision(state, 'player', CITY)).toBeNull(); // someone else's city: no peeking
    expect(projectActiveProduction(state, 'player', CITY)).toBeNull();
    expect(getProductionDecision(state, CIV, CITY)).not.toBeNull();
  });

  it('is pure and deterministic', () => {
    const state = setup('pd-pure');
    city(state).productionQueue = ['warrior', 'workshop'];
    city(state).productionProgress = 3;
    const before = JSON.stringify(state);
    const a = getProductionDecision(state, CIV, CITY);
    const b = getProductionDecision(state, CIV, CITY);
    expect(JSON.stringify(state)).toBe(before);
    expect(a).toEqual(b);
  });

  it('uses the city-work projection when the caller supplies no figure', () => {
    const state = setup('pd-default-yield');
    city(state).productionQueue = ['warrior'];
    const decision = getProductionDecision(state, CIV, CITY)!;
    expect(decision.productionPerTurn).toBe(projectActiveProduction(state, CIV, CITY)!.productionPerTurn);
    expect(decision.productionPerTurn).toBeGreaterThanOrEqual(0);
  });

  it('an item the real turn drops (no longer allowed) is a documented limit of the estimate', () => {
    const state = setup('pd-invalid');
    city(state).productionQueue = ['cavalry']; // needs horses + a tech this civ lacks
    city(state).productionProgress = 100;
    const decision = getProductionDecision(state, CIV, CITY, { productionPerTurn: 10 })!;
    expect(decision.isEstimate).toBe(true);
    const real = processCity(city(state), state.map, 0, 10, buildProductionCostContext(state, CIV, CITY));
    expect(real.droppedProductionItems.length).toBeGreaterThan(0);
    expect(real.completedUnit).toBeNull();
  });
});

describe('getIdleProductionDecision', () => {
  it('converts only on an empty queue; a mode with a queue is dormant; real turns agree', () => {
    const state = setup('pd-idle');
    city(state).idleProduction = 'gold';

    expect(getIdleProductionDecision(state, CIV, CITY)).toEqual({ mode: 'gold', convertsThisTurn: true, dormant: false });
    expect(realTurn(state, 6).production.convertedGold).toBe(6);

    city(state).productionQueue = ['warrior'];
    expect(getIdleProductionDecision(state, CIV, CITY)).toEqual({ mode: 'gold', convertsThisTurn: false, dormant: true });
    expect(realTurn(state, 6).production.convertedGold).toBe(0);

    city(state).idleProduction = null;
    city(state).productionQueue = [];
    expect(getIdleProductionDecision(state, CIV, CITY)).toEqual({ mode: null, convertsThisTurn: false, dormant: false });
  });

  it('is null for a city the civ does not own', () => {
    const state = setup('pd-idle-owner');
    expect(getIdleProductionDecision(state, 'player', CITY)).toBeNull();
    expect(getIdleProductionDecision(state, CIV, 'nope')).toBeNull();
  });
});
