import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { foundCity } from '@/systems/city-system';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { getHerdAvoidanceScore, planHerdRoute } from '@/systems/stampede-route-system';
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

  it('caps Fort, Citadel, and fortified-screen avoidance at six', () => {
    const state = routeState();
    state.map.tiles['2,0'] = { ...state.map.tiles['2,0']!, improvement: 'fort', improvementTurnsLeft: 0 };
    state.units.screen = { ...Object.values(state.units).find(unit => unit.type === 'warrior')!, id: 'screen', owner: 'player', position: { q: 2, r: 1 }, isFortified: true };
    state.units.screen2 = { ...state.units.screen, id: 'screen2', position: { q: 1, r: 1 } };

    expect(getHerdAvoidanceScore(state, { q: 2, r: 0 })).toBe(6);
  });
});
