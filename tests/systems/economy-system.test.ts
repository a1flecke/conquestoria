import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { City, GameState } from '@/core/types';
import {
  applyEconomyTurn,
  calculateCivEconomy,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  getRushBuyQuote,
} from '@/systems/economy-system';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';

function makeState(): GameState {
  const state = createNewGame(undefined, 'economy-test', 'small');
  const city = foundCity('player', { q: 2, r: 2 }, state.map, state.idCounters);
  city.id = 'capital';
  city.name = 'Capital';
  city.population = 2;
  city.maturity = 'outpost';
  city.buildings = [];
  city.productionQueue = [];
  city.productionProgress = 0;

  state.cities = { capital: city };
  state.civilizations.player.cities = ['capital'];
  state.civilizations.player.units = [];
  state.civilizations.player.gold = 20;
  state.units = {};
  return state;
}

function city(state: GameState): City {
  return state.cities.capital;
}

function addUnits(state: GameState, count: number): void {
  for (let index = 0; index < count; index++) {
    const unit = createUnit('warrior', 'player', city(state).position, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations.player.units.push(unit.id);
  }
}

describe('economy maintenance', () => {
  it('keeps starter infrastructure and two defenders per city free', () => {
    const state = makeState();
    city(state).buildings = [
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
      'marketplace',
      'forum',
      'temple',
      'monument',
    ];
    addUnits(state, 6);

    const maintenance = calculateMaintenance(state, 'player');

    expect(maintenance.buildingUpkeep).toBe(0);
    expect(maintenance.paidBuildings).toBe(0);
    expect(maintenance.freeBuildings).toBe(10);
    expect(maintenance.unitUpkeep).toBe(0);
    expect(maintenance.freeUnits).toBe(6);
  });

  it('charges upkeep only after generous free support is exhausted', () => {
    const state = makeState();
    city(state).buildings = [
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
      'marketplace',
      'forum',
      'temple',
      'monument',
      'forge',
      'observatory',
      'harbor',
    ];
    addUnits(state, 10);

    const maintenance = calculateMaintenance(state, 'player');

    expect(maintenance.paidBuildings).toBe(2);
    expect(maintenance.buildingUpkeep).toBe(2);
    expect(maintenance.paidUnits).toBe(4);
    expect(maintenance.unitUpkeep).toBe(4);
  });

  it('projects and applies net gold without mutating the input state', () => {
    const state = makeState();
    city(state).buildings = ['marketplace'];
    addUnits(state, 10);

    const status = calculateCivEconomy(state, 'player');
    const result = applyEconomyTurn(state, 'player', status.grossGoldPerTurn);

    expect(state.civilizations.player.gold).toBe(20);
    expect(result.civilizations.player.gold).toBe(status.projectedGold);
    expect(result.economyStatusByCiv?.player.netGoldPerTurn).toBe(status.netGoldPerTurn);
  });

  it('marks critical strain when upkeep cannot be paid and emits one strain event', () => {
    const state = makeState();
    state.civilizations.player.gold = 0;
    addUnits(state, 40);
    const status = calculateCivEconomy(state, 'player', { grossGoldPerTurn: 0 });
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('economy:treasury-strain', listener);

    emitEconomyStrainIfNeeded(undefined, status, bus);
    emitEconomyStrainIfNeeded(status, status, bus);

    expect(status.strainLevel).toBe('critical');
    expect(status.rushBuyDisabled).toBe(true);
    expect(status.unpaidMaintenance).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('rush buy quote', () => {
  it('blocks rush buy during critical treasury strain with a clear reason', () => {
    const state = makeState();
    state.civilizations.player.gold = 0;
    city(state).productionQueue = ['workshop'];
    city(state).productionProgress = 2;
    addUnits(state, 40);

    const quote = getRushBuyQuote(state, 'capital');

    expect(quote.available).toBe(false);
    expect(quote.reason).toContain('treasury strain is critical');
    expect(quote.status.rushBuyDisabled).toBe(true);
  });

  it('quotes the remaining production cost when the treasury can support it', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['workshop'];
    city(state).productionProgress = 2;

    const quote = getRushBuyQuote(state, 'capital');

    expect(quote.available).toBe(true);
    expect(quote.itemId).toBe('workshop');
    expect(quote.cost).toBe(25);
  });
});
