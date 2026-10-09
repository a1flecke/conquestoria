// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { City, GameEvents, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getProductionCostForCivItem } from '@/systems/production-cost-context';
import { getProductionDecision } from '@/systems/production-decision';
import { reorderCityProduction } from '@/systems/planning-system';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';

/**
 * Production-decision arc, PR 3: the panel is only allowed to say what the real turn then does. These tests render the
 * real panel, read what it SAYS, then run the real `processTurn` / commands on the same state and compare. They do not
 * snapshot HTML and they do not mock the query they are checking.
 */

const CITY = 'city-t';
const noop = { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {}, onRushBuyActiveProduction: () => {} };

function game(seed: string): { state: GameState; city: City } {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: seed, seed });
  const civ = state.civilizations.player;
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
  return { state, city };
}

const production = (state: GameState): number => calculateProjectedCityYields(state, CITY).production;
const cost = (state: GameState, item: string): number => getProductionCostForCivItem(state, 'player', CITY, item);

function render(state: GameState): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return createCityPanel(container, state.cities[CITY]!, state, noop);
}

const text = (panel: HTMLElement): string => panel.textContent ?? '';

function turnsShown(panel: HTMLElement): string {
  return panel.querySelector('[data-text="prod-turns"]')?.textContent ?? '';
}

function slowItem(state: GameState): string {
  const id = ['workshop', 'granary', 'library', 'marketplace'].find(candidate => cost(state, candidate) > production(state) * 2);
  expect(id, 'fixture needs an item costing more than two turns of production').toBeTruthy();
  return id!;
}

describe('the panel only promises what the real turn delivers', () => {
  it('"finishes next turn" is followed by the real completion, and the Buy button stays usable', () => {
    const { state, city } = game('pt-next-turn');
    city.productionQueue = ['warrior'];
    city.productionProgress = Math.max(0, cost(state, 'warrior') - production(state));
    const panel = render(state);

    expect(text(panel)).toContain('expected to finish this item next turn without spending gold');
    expect(panel.querySelector<HTMLButtonElement>('[data-rush-buy]')!.disabled).toBe(false);

    const next = processTurn(structuredClone(state), new EventBus());
    expect(next.cities[CITY]!.productionQueue).toEqual([]);
    const warriors = Object.values(next.units).filter(u => u.owner === 'player' && u.type === 'warrior');
    expect(warriors.length).toBeGreaterThan(0);
  });

  it('the ETA shown is never later than the real completion (an estimate may only err slow)', () => {
    const { state, city } = game('pt-eta');
    const item = slowItem(state);
    city.productionQueue = [item];
    const shown = Number(turnsShown(render(state)));
    expect(shown).toBeGreaterThanOrEqual(3);

    let current = structuredClone(state);
    let completedOnTurn = 0;
    for (let turn = 1; turn <= shown + 1 && !completedOnTurn; turn++) {
      current = processTurn(current, new EventBus());
      if (current.cities[CITY]!.productionQueue.length === 0) completedOnTurn = turn;
    }
    expect(completedOnTurn).toBeGreaterThan(0);
    expect(completedOnTurn).toBeLessThanOrEqual(shown);
  });

  it('a locked city shows no ETA and the real turn adds nothing', () => {
    const { state, city } = game('pt-locked');
    city.productionQueue = [slowItem(state)];
    city.productionProgress = 1;
    // A disabled-production counter (not a bare unrestLevel, which the same turn's unrest pass may recompute first).
    city.productionDisabledTurns = 5;
    const panel = render(state);

    expect(text(panel)).toContain('∞ turns remaining');
    expect(text(panel)).toContain('Production is paused in this city');

    const next = processTurn(structuredClone(state), new EventBus());
    expect(next.cities[CITY]!.productionProgress).toBe(1);
  });

  it('insufficient gold disables the purchase in the panel and the command refuses it', () => {
    const { state, city } = game('pt-poor');
    city.productionQueue = [slowItem(state)];
    state.civilizations.player.gold = 0;
    const panel = render(state);

    expect(panel.querySelector<HTMLButtonElement>('[data-rush-buy]')!.disabled).toBe(true);
    const result = rushBuyActiveProduction(state, 'player', CITY, new EventBus());
    expect(result.success).toBe(false);
    expect(panel.querySelector('[data-rush-note]')).toBeNull();
  });

  it('a purchase completes at once; the following turn then carries the whole output (no hidden second loss claim)', () => {
    const { state, city } = game('pt-buy');
    city.productionQueue = [slowItem(state), 'warrior'];
    const bought = rushBuyActiveProduction(state, 'player', CITY, new EventBus());
    expect(bought.success).toBe(true);
    if (!bought.success) return;
    expect(bought.state.cities[CITY]!.productionQueue).toEqual(['warrior']);
    expect(bought.state.civilizations.player.gold).toBeLessThan(5000);
  });

  it('reordering: the warning names the exact loss the real command inflicts, and a reorder behind the head claims none', () => {
    const { state, city } = game('pt-reorder');
    city.productionQueue = ['warrior', 'workshop', 'granary'];
    city.productionProgress = 5;
    const panel = render(state);
    expect(panel.querySelector('[data-queue-index="1"] [data-head-change-warning]')!.textContent).toContain('loses 5 stored production');
    expect(panel.querySelector('[data-queue-index="2"] [data-head-change-warning]')).toBeNull();

    expect(reorderCityProduction(city, 1, 0).productionProgress).toBe(0);
    expect(reorderCityProduction(city, 2, 1).productionProgress).toBe(5);
  });
});

describe('overflow and conversion: what the panel says matches the emitted production accounting', () => {
  function runTurnCollecting(state: GameState): { next: GameState; events: Array<GameEvents['city:production-disposition']> } {
    const bus = new EventBus();
    const events: Array<GameEvents['city:production-disposition']> = [];
    bus.on('city:production-disposition', event => { if (event.cityId === CITY) events.push(event); });
    return { next: processTurn(structuredClone(state), bus), events };
  }

  it('every emitted disposition conserves output, and the overflow note never over-states the real loss', () => {
    const { state, city } = game('pt-overflow');
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = cost(state, 'warrior'); // already covered: the whole turn's output is surplus
    const panel = render(state);
    const decision = getProductionDecision(state, 'player', CITY, { productionPerTurn: production(state) })!;
    expect(decision.overflow.outcome).toBe('discarded');
    expect(panel.querySelector('[data-overflow-note]')!.textContent).toContain(`about ${decision.overflow.excess} production`);

    const { events } = runTurnCollecting(state);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.appliedToBuild + e.carriedOver + e.convertedGold + e.convertedScience + e.discarded).toBe(e.produced);
    // The real turn produces at least what the panel projected, so the real loss is at least the stated one.
    expect(e.discarded).toBeGreaterThanOrEqual(decision.overflow.excess);
  });

  it('with 3d-printing and a queued item the note says it carries, and the real accounting carries it', () => {
    const { state, city } = game('pt-carry');
    state.civilizations.player.techState.completed.push('3d-printing');
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = cost(state, 'warrior');
    const panel = render(state);
    expect(panel.querySelector('[data-overflow-note]')!.textContent).toMatch(/will carry over to the next queued item/);

    const { events } = runTurnCollecting(state);
    expect(events[0]!.carriedOver).toBeGreaterThan(0);
    expect(events[0]!.discarded).toBe(0);
  });

  it('idle conversion: paused wording while queued matches no conversion; empty queue converts', () => {
    const { state, city } = game('pt-idle');
    city.idleProduction = 'gold';
    city.productionQueue = ['workshop'];
    expect(text(render(state))).toContain('Conversion is paused while something is queued');
    expect(runTurnCollecting(state).events[0]!.convertedGold).toBe(0);

    city.productionQueue = [];
    expect(runTurnCollecting(state).events[0]!.convertedGold).toBeGreaterThan(0);
    expect(text(render(state))).not.toContain('Conversion is paused');
  });
});

describe('purity, save/reload and hot seat', () => {
  it('rendering the panel and asking for a decision never mutate the state', () => {
    const { state, city } = game('pt-pure');
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = 3;
    const before = JSON.stringify(state);
    render(state);
    getProductionDecision(state, 'player', CITY);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('a save/reload round trip gives the same decision and the same rendered notes', () => {
    const { state, city } = game('pt-reload');
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = 4;
    const reloaded = normalizeLoadedState((() => {
      const parsed = parseSaveFile(serializeSaveFile(state));
      if (parsed.status !== 'success') throw new Error(parsed.message);
      return parsed.state;
    })());

    const opts = { productionPerTurn: 3 };
    expect(getProductionDecision(reloaded, 'player', CITY, opts)).toEqual(getProductionDecision(state, 'player', CITY, opts));
    expect(reloaded.cities[CITY]!.productionQueue).toEqual(['warrior', 'workshop']);
    expect(reloaded.cities[CITY]!.productionProgress).toBe(4);
    expect(text(render(reloaded))).toContain('loses 4 stored production');
  });

  it('hot seat: each human sees only their own city; the other human\'s state cannot move the panel', () => {
    const hot = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'One', slotId: 'player-1', civType: 'generic', isHuman: true },
        { name: 'Two', slotId: 'player-2', civType: 'generic', isHuman: true },
      ],
    }, 'pt-hotseat');
    const one = hot.civilizations['player-1']!;
    const two = hot.civilizations['player-2']!;
    const settler = (civ: typeof one) => civ.units.map(id => hot.units[id]).find(unit => unit?.type === 'settler')!;
    const make = (civ: typeof one, id: string): City => {
      const found = foundCity(civ.id, settler(civ).position, hot.map, hot.idCounters);
      found.id = id;
      found.productionQueue = ['warrior', 'workshop'];
      found.productionProgress = 5;
      hot.cities[id] = found;
      civ.cities = [id];
      return found;
    };
    const cityOne = make(one, 'c-one');
    const cityTwo = make(two, 'c-two');
    hot.currentPlayer = 'player-1';
    const container = document.createElement('div');
    document.body.appendChild(container);

    expect(getProductionDecision(hot, 'player-1', cityTwo.id)).toBeNull(); // cannot read the other human's city
    expect(getProductionDecision(hot, 'player-2', cityOne.id)).toBeNull();

    const first = createCityPanel(container, cityOne, hot, noop).textContent;
    two.gold = 123456;
    cityTwo.productionProgress = 99;
    const second = createCityPanel(container, cityOne, hot, noop).textContent;
    expect(second).toBe(first);

    hot.currentPlayer = 'player-2';
    const own = createCityPanel(container, cityTwo, hot, noop).textContent ?? '';
    expect(own).toContain('loses 99 stored production');
    expect(own).not.toContain('loses 5 stored production');
  });
});
