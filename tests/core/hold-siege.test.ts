import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { applyHoldSiegeOrder } from '@/core/turn-manager';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function siegeState(overrides: { cityBuildings?: string[]; attackerPos?: { q: number; r: number } } = {}): GameState {
  const state = createNewGame(undefined, 'hold-siege', 'small');
  state.currentPlayer = 'player';
  state.turn = 20;
  for (const key of ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  state.units = {
    gun: {
      ...createUnit('catapult', 'player', overrides.attackerPos ?? { q: 1, r: 0 }, mkC()),
      id: 'gun',
      movementPointsLeft: 2,
      automation: { mode: 'hold-siege', cityId: 'target', startedTurn: 20 },
    },
  };
  state.civilizations.player.units = ['gun'];
  state.civilizations.player.visibility.tiles = {
    '0,0': 'visible', '1,0': 'visible', '2,0': 'visible', '3,0': 'visible', '4,0': 'visible', '5,0': 'visible',
  };
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];

  state.cities = {};
  const city = {
    ...foundCity('ai-1', { q: 2, r: 0 }, state.map, state.idCounters),
    id: 'target', owner: 'ai-1', hp: 90,
    buildings: overrides.cityBuildings ?? [],
  };
  state.cities = { target: city };
  state.civilizations['ai-1'].cities = ['target'];
  return state;
}

describe('#974 Hold Siege', () => {
  it('bombards the city automatically each turn without the player clicking', () => {
    const state = siegeState();
    const bus = new EventBus();
    const bombarded = vi.fn();
    bus.on('city:bombarded', bombarded);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.cities.target.hp).toBeLessThan(90);
    expect(bombarded).toHaveBeenCalledTimes(1);
    expect(result.units.gun.automation).toEqual({ mode: 'hold-siege', cityId: 'target', startedTurn: 20 });
  });

  it('re-checks legality through the same resolver a manual tap uses', () => {
    // Out of range (distance 3 vs a Catapult's range 2): a standing order must never do
    // what a manual click could not.
    const state = siegeState({ attackerPos: { q: 5, r: 0 } });
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('unit:hold-siege-ended', ended);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.units.gun.automation).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'gun', reason: 'Move closer to attack this city.' }));
  });

  it('stops, with a reason, when the city becomes yours', () => {
    const state = siegeState();
    state.cities.target = { ...state.cities.target, owner: 'player' };
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('unit:hold-siege-ended', ended);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.units.gun.automation).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('yours') }));
  });

  it('stops when the city no longer exists', () => {
    const state = siegeState();
    delete (state.cities as Record<string, unknown>).target;
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('unit:hold-siege-ended', ended);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.units.gun.automation).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ reason: 'The city is gone.' }));
  });

  it('stops when the per-turn cap is already spent, naming the cause', () => {
    const state = siegeState();
    state.cities.target = { ...state.cities.target, bombardment: { turn: 20, hpLostThisTurn: 999 } };
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('unit:hold-siege-ended', ended);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.units.gun.automation).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'This city has taken all the bombardment it can this turn.',
    }));
  });

  // A standing order must not quietly grind a unit to death while the player looks elsewhere.
  it('stops the moment the unit takes return fire', () => {
    const state = siegeState({ cityBuildings: ['walls'], attackerPos: { q: 1, r: 0 } });
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('unit:hold-siege-ended', ended);

    const result = applyHoldSiegeOrder(state, 'gun', 'target', bus);

    expect(result.units.gun?.automation).toBeUndefined();
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('under fire') }));
  });
});
