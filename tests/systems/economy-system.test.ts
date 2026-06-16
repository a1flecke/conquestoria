import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, UnitType } from '@/core/types';
import {
  applyEconomyTurn,
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  calculateCivUnitMaintenance,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  formatGoldHudText,
  getEconomyStatusForCiv,
  getRushBuyQuote,
  normalizeEconomyStatus,
  rushBuyActiveProduction,
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

function addUnitOfType(state: GameState, type: UnitType, id?: string): string {
  const unit = createUnit(type, 'player', city(state).position, state.idCounters);
  unit.id = id ?? unit.id;
  state.units[unit.id] = unit;
  state.civilizations.player.units.push(unit.id);
  return unit.id;
}

function addUnits(state: GameState, count: number, type: UnitType = 'warrior'): void {
  for (let index = 0; index < count; index++) {
    addUnitOfType(state, type, `${type}-${index}`);
  }
}

describe('economy maintenance', () => {
  it('keeps core buildings exempt; gives one free slot to first non-exempt building', () => {
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
    const cityBreakdown = calculateCityBuildingMaintenance(state, 'capital');
    const unitBreakdown = calculateCivUnitMaintenance(state, 'player');

    // outpost pop=2 → 1 free slot: marketplace (lowest priority) covered, forum/temple/monument paid
    expect(maintenance.buildingUpkeep).toBe(3);
    expect(maintenance.paidBuildings).toBe(3);
    expect(maintenance.freeBuildings).toBe(7); // 6 exempt + 1 supported
    expect(maintenance.unitUpkeep).toBe(0);
    expect(maintenance.freeUnits).toBe(6);
    expect(cityBreakdown.supportUsed).toBe(1);
    expect(unitBreakdown.defenderSlotsUsed).toBe(2);
    expect(unitBreakdown.supportUsed).toBe(4);
  });

  it('charges upkeep for all non-exempt buildings beyond the single free slot', () => {
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

    // marketplace covered by 1 free slot; 6 non-exempt paid (forum+temple+monument@1 + forge+harbor+observatory@2)
    expect(maintenance.paidBuildings).toBe(6);
    expect(maintenance.buildingUpkeep).toBe(9);
    expect(maintenance.paidUnits).toBe(4);
    expect(maintenance.unitUpkeep).toBe(4);
  });

  it('spends free unit support on basic defenders before advanced specialists', () => {
    const state = makeState();
    addUnitOfType(state, 'war_hound', 'war-hound');
    addUnitOfType(state, 'shadow_warden', 'shadow-warden');
    addUnitOfType(state, 'musketeer', 'musketeer');
    addUnitOfType(state, 'swordsman', 'swordsman');
    addUnitOfType(state, 'pikeman', 'pikeman');
    addUnitOfType(state, 'warrior', 'warrior-extra');
    addUnitOfType(state, 'warrior', 'warrior');
    addUnitOfType(state, 'archer', 'archer');

    const breakdown = calculateCivUnitMaintenance(state, 'player');

    expect(breakdown.freeDefenderUnits.map(row => row.id)).toEqual(['archer', 'warrior']);
    expect(breakdown.paidUnits.map(row => row.id)).toContain('war-hound');
    expect(breakdown.paidUnits.map(row => row.id)).toContain('shadow-warden');
    expect(breakdown.upkeep).toBe(4);
  });

  it('projects and applies compact economy status without mutating the input state', () => {
    const state = makeState();
    city(state).buildings = ['marketplace'];
    addUnits(state, 10);

    const status = calculateCivEconomy(state, 'player');
    const result = applyEconomyTurn(state, 'player', status.grossGoldIncome);

    expect(state.civilizations.player.gold).toBe(20);
    expect(result.civilizations.player.gold).toBe(status.endingGold);
    expect(result.economyStatusByCiv?.player).toEqual({
      turn: state.turn,
      grossGoldIncome: status.grossGoldIncome,
      buildingMaintenance: status.buildingMaintenance,
      unitMaintenance: status.unitMaintenance,
      netGoldPerTurn: status.netGoldPerTurn,
      unpaidMaintenance: status.unpaidMaintenance,
      strainLevel: status.strainLevel,
    });
  });

  it('normalizes legacy status into the compact current save shape', () => {
    const status = normalizeEconomyStatus({
      grossGoldPerTurn: 1,
      maintenanceGoldPerTurn: 20,
      netGoldPerTurn: -19,
      unpaidMaintenance: 7,
      strainLevel: 'strained',
      rushBuyDisabled: true,
      turn: 4,
    }, 'player', 9);

    expect(status).toEqual({
      turn: 4,
      grossGoldIncome: 1,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -19,
      unpaidMaintenance: 7,
      strainLevel: 'high',
    });
  });

  it('uses low, high, and critical strain thresholds consistently', () => {
    const state = makeState();
    state.civilizations.player.gold = 17;

    const low = calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 0, unitUpkeep: 20 },
    });
    const high = calculateCivEconomy({ ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations.player, gold: 15 } } }, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 0, unitUpkeep: 20 },
    });
    const critical = calculateCivEconomy({ ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations.player, gold: 10 } } }, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 0, unitUpkeep: 20 },
    });

    expect(low.strainLevel).toBe('low');
    expect(high.strainLevel).toBe('high');
    expect(critical.strainLevel).toBe('critical');
  });

  it('emits strain events once per changed level or amount', () => {
    const state = makeState();
    state.civilizations.player.gold = 0;
    addUnits(state, 40);
    const status = calculateCivEconomy(state, 'player', { grossGoldPerTurn: 0 });
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('economy:treasury-strain', listener);

    emitEconomyStrainIfNeeded(undefined, status, bus, 'player');
    emitEconomyStrainIfNeeded(status, status, bus, 'player');

    expect(status.strainLevel).toBe('critical');
    expect(status.unpaidMaintenance).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      civId: 'player',
      level: 'critical',
      netGoldPerTurn: status.netGoldPerTurn,
      unpaidMaintenance: status.unpaidMaintenance,
    });
  });
});

describe('rush buy', () => {
  it('blocks rush buy during high or critical treasury strain with a stable reason', () => {
    const state = makeState();
    state.civilizations.player.gold = 0;
    city(state).productionQueue = ['workshop'];
    city(state).productionProgress = 2;
    addUnits(state, 40);

    const quote = getRushBuyQuote(state, 'player', 'capital');

    expect(quote.available).toBe(false);
    expect(quote.reason).toBe('treasury-strain-too-high');
    expect(quote.status.strainLevel).toBe('critical');
  });

  it('allows low strain rush buy when the player can afford it', () => {
    const state = makeState();
    state.civilizations.player.gold = 30;
    city(state).productionQueue = ['workshop'];
    city(state).productionProgress = 2;
    addUnits(state, 40);

    const quote = getRushBuyQuote(state, 'player', 'capital');

    expect(quote.status.strainLevel).toBe('low');
    expect(quote.available).toBe(true);
    expect(quote.itemId).toBe('workshop');
    expect(quote.cost).toBe(25);
  });

  it('blocks legendary wonder production regardless of treasury', () => {
    const state = makeState();
    state.civilizations.player.gold = 999;
    city(state).productionQueue = ['legendary:oracle-of-delphi'];

    const quote = getRushBuyQuote(state, 'player', 'capital');

    expect(quote.available).toBe(false);
    expect(quote.reason).toBe('wonders-cannot-be-bought');
  });

  it('blocks rush buying production in cities owned by another civilization', () => {
    const state = makeState();
    state.civilizations.player.gold = 999;
    city(state).owner = 'ai-1';
    city(state).productionQueue = ['workshop'];

    const quote = getRushBuyQuote(state, 'player', 'capital');

    expect(quote.available).toBe(false);
    expect(quote.reason).toBe('not-owner');
  });

  it('executes rush buy through the shared economy system and refreshes economy status', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['workshop'];
    city(state).productionProgress = 2;
    const originalCounter = state.idCounters.nextUnitId;
    const bus = new EventBus();
    const buildingListener = vi.fn();
    bus.on('city:building-complete', buildingListener);

    const result = rushBuyActiveProduction(state, 'player', 'capital', bus);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cost).toBe(25);
    expect(result.state.civilizations.player.gold).toBe(75);
    expect(result.state.cities.capital.buildings).toContain('workshop');
    expect(result.state.economyStatusByCiv?.player).toEqual(getEconomyStatusForCiv(result.state, 'player'));
    expect(state.civilizations.player.gold).toBe(100);
    expect(state.idCounters.nextUnitId).toBe(originalCounter);
    expect(buildingListener).toHaveBeenCalledWith({ cityId: 'capital', buildingId: 'workshop' });
  });

  it('executes rush-bought unit training through the shared economy system', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['warrior'];
    const bus = new EventBus();
    const unitListener = vi.fn();
    bus.on('city:unit-trained', unitListener);

    const result = rushBuyActiveProduction(state, 'player', 'capital', bus);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const trainedUnitIds = result.state.civilizations.player.units;
    expect(trainedUnitIds).toHaveLength(1);
    expect(result.state.units[trainedUnitIds[0]].type).toBe('warrior');
    expect(result.state.cities.capital.productionQueue).toEqual([]);
    expect(unitListener).toHaveBeenCalledWith({ cityId: 'capital', unitType: 'warrior' });
  });

  it('formats the HUD around net gold, not gross income', () => {
    const state = makeState();
    const status = calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 7,
      maintenanceOverride: { buildingUpkeep: 1, unitUpkeep: 1 },
    });

    expect(formatGoldHudText(status, 42)).toBe('42 (+5 net)');
  });
});
