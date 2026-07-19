import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import { usePropagandistAction } from '@/systems/propagandist-system';

function city(id: string, owner: string, q: number): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 2, food: 0, foodNeeded: 10,
    buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

function propagandist(owner: string, q: number): Unit {
  return {
    id: 'propagandist', type: 'propagandist', owner, position: { q, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
}

function stateWithCities(): ReturnType<typeof createNewGame> {
  const state = createNewGame('rome', 'propagandist-actions', 'small');
  const own = city('own', 'player', 0);
  const enemy = city('enemy', 'ai-1', 1);
  state.cities = { own, enemy };
  state.units = { propagandist: propagandist('player', 0) };
  state.civilizations.player = {
    ...state.civilizations.player,
    cities: ['own'], units: ['propagandist'],
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'], cities: ['enemy'], units: [],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  return state;
}

describe('Propagandist actions', () => {
  it('Rally removes a bounded amount of enemy unrest pressure from a nearby friendly city', () => {
    const state = stateWithCities();
    state.cities.own.spyUnrestBonus = 14;

    const result = usePropagandistAction(state, 'propagandist', 'rally', 'own');

    expect(result.ok).toBe(true);
    expect(result.state.cities.own.spyUnrestBonus).toBe(4);
    expect(result.state.units.propagandist.hasActed).toBe(true);
  });

  it('Digital Democracy makes Rally remove an additional five pressure without strengthening Undermine', () => {
    const state = stateWithCities();
    state.cities.own.spyUnrestBonus = 20;
    state.civilizations.player.techState.completed = ['digital-democracy'];

    const rally = usePropagandistAction(state, 'propagandist', 'rally', 'own');

    expect(rally).toMatchObject({ ok: true });
    expect(rally.state.cities.own.spyUnrestBonus).toBe(5);
    const fresh = stateWithCities();
    fresh.civilizations.player.techState.completed = ['digital-democracy'];
    expect(usePropagandistAction(fresh, 'propagandist', 'undermine', 'enemy').state.cities.enemy.spyUnrestBonus).toBe(10);
  });

  it('Undermine adds bounded unrest pressure only to an adjacent civilization at bilateral war', () => {
    const state = stateWithCities();

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result.ok).toBe(true);
    expect(result.state.cities.enemy.spyUnrestBonus).toBe(10);
    expect(result.state.units.propagandist.hasActed).toBe(true);

    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];
    expect(usePropagandistAction(state, 'propagandist', 'undermine', 'enemy')).toMatchObject({ ok: false, reason: 'not-at-war' });
  });

  it('Contemplative Technology reduces incoming Undermine pressure without blocking a legal action', () => {
    const state = stateWithCities();
    state.civilizations['ai-1'].techState.completed = ['contemplative-technology'];

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result).toMatchObject({ ok: true });
    expect(result.state.cities.enemy.spyUnrestBonus).toBe(5);
  });

  it('rejects a repeated, distant, or wrong-unit action without mutating state', () => {
    const state = stateWithCities();
    state.units.propagandist.hasActed = true;
    const acted = usePropagandistAction(state, 'propagandist', 'rally', 'own');
    expect(acted).toMatchObject({ ok: false, reason: 'already-acted', state });

    state.units.propagandist.hasActed = false;
    state.cities.enemy = { ...state.cities.enemy, position: { q: 3, r: 0 } };
    expect(usePropagandistAction(state, 'propagandist', 'undermine', 'enemy')).toMatchObject({ ok: false, reason: 'out-of-range', state });
  });
});
