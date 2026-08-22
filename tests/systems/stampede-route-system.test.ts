import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { foundCity } from '@/systems/city-system';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { getHerdAvoidanceScore, getHerdRoutePresentationForViewer, planHerdRoute, commitHerdRouteForTurn } from '@/systems/stampede-route-system';
import { hexDistance } from '@/systems/hex-utils';

function routeState() {
  const state = createNewGame('rome', 'stampede-route', 'small');
  const target = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
  state.cities[target.id] = target;
  state.civilizations.player.cities = [target.id];
  for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
  for (const coord of [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }]) {
    state.map.tiles[`${coord.q},${coord.r}`] = { ...state.map.tiles[`${coord.q},${coord.r}`], coord, terrain: 'plains' };
  }
  state.units['herd-1'] = {
    ...Object.values(state.units)[0]!, id: 'herd-1', owner: CRISIS_FORCE_OWNER,
    position: { q: 1, r: 0 }, movementPointsLeft: 2,
  };
  return registerCrisisForce(state, {
    id: 'stampede-1', targetCivId: 'player', severity: 'standard', createdTurn: state.turn, unitIds: ['herd-1'],
  });
}

describe('stampede route system', () => {
  it('plans two deterministic outward land steps', () => {
    const state = routeState();

    const route = planHerdRoute(state, 'stampede-1', 'herd-1');
    expect(route).toEqual(planHerdRoute(state, 'stampede-1', 'herd-1'));
    expect(route).toMatchObject({ unitId: 'herd-1', committedTurn: state.turn });
    expect(route.steps).toHaveLength(2);
    expect(hexDistance(route.steps[0]!, { q: 0, r: 0 })).toBeGreaterThan(1);
  });

  it('can commit an outward step occupied by a hostile defender for canonical trample combat', () => {
    const state = routeState();
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    state.map.tiles['1,0'] = { ...state.map.tiles['1,0']!, terrain: 'plains' };
    state.map.tiles['2,0'] = { ...state.map.tiles['2,0']!, terrain: 'plains' };
    state.units.screen = {
      ...Object.values(state.units).find(unit => unit.type === 'warrior')!,
      id: 'screen', owner: 'player', position: { q: 2, r: 0 },
    };

    expect(planHerdRoute(state, 'stampede-1', 'herd-1').steps[0]).toEqual({ q: 2, r: 0 });
  });

  it('does not route into a legacy stack even when one blocker is hostile', () => {
    const state = routeState();
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    state.map.tiles['1,0'] = { ...state.map.tiles['1,0']!, terrain: 'plains' };
    state.map.tiles['2,0'] = { ...state.map.tiles['2,0']!, terrain: 'plains' };
    const template = Object.values(state.units).find(unit => unit.type === 'warrior')!;
    state.units.hostile = { ...template, id: 'hostile', owner: 'player', position: { q: 2, r: 0 } };
    state.units.stacked = { ...template, id: 'stacked', owner: 'player-2', position: { q: 2, r: 0 } };

    expect(planHerdRoute(state, 'stampede-1', 'herd-1').steps).toEqual([]);
  });

  it('never plans a second occupied step after a possible trample', () => {
    const state = routeState();
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    for (const key of ['1,0', '2,0', '3,0']) state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
    const template = Object.values(state.units).find(unit => unit.type === 'warrior')!;
    state.units.first = { ...template, id: 'first', owner: 'player', position: { q: 2, r: 0 } };
    state.units.second = { ...template, id: 'second', owner: 'player', position: { q: 3, r: 0 } };

    const route = planHerdRoute(state, 'stampede-1', 'herd-1');
    expect(route.steps[0]).toEqual({ q: 2, r: 0 });
    expect(route.steps[1]).not.toEqual({ q: 3, r: 0 });
  });

  it('caps Fort, Citadel, and fortified-screen avoidance at six', () => {
    const state = routeState();
    state.map.tiles['2,0'] = { ...state.map.tiles['2,0']!, improvement: 'fort', improvementTurnsLeft: 0 };
    state.units.screen = { ...Object.values(state.units).find(unit => unit.type === 'warrior')!, id: 'screen', owner: 'player', position: { q: 2, r: 1 }, isFortified: true };
    state.units.screen2 = { ...state.units.screen, id: 'screen2', position: { q: 1, r: 1 } };

    expect(getHerdAvoidanceScore(state, { q: 2, r: 0 })).toBe(6);
  });

  it('exposes committed routes only to the visible target viewer', () => {
    const state = routeState();
    state.civilizations.player.visibility.tiles['1,0'] = 'visible';
    state.civilizations['player-2'] = { ...state.civilizations.player, id: 'player-2', visibility: { tiles: {} } };
    const committed = commitHerdRouteForTurn(state, 'stampede-1', 'herd-1');
    for (const step of committed.crisisForces!['stampede-1']!.herdRoutes!['herd-1']!.steps) {
      state.civilizations.player.visibility.tiles[`${step.q},${step.r}`] = 'visible';
    }

    expect(getHerdRoutePresentationForViewer(committed, 'player').routes).toHaveLength(1);
    expect(getHerdRoutePresentationForViewer(committed, 'player-2').routes).toEqual([]);
  });

  it('does not reveal a committed route tile the target has not earned vision of', () => {
    const state = routeState();
    state.civilizations.player.visibility.tiles['1,0'] = 'visible';
    const committed = commitHerdRouteForTurn(state, 'stampede-1', 'herd-1');

    expect(getHerdRoutePresentationForViewer(committed, 'player').routes).toEqual([]);
  });
});
