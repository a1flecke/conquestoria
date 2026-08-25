import { describe, expect, it, vi } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import * as supplySources from '@/systems/supply-sources';
import * as supplyNaval from '@/systems/supply-naval';
import { getSupplyOverlayPresentationForViewer } from '@/systems/supply-overlay-presentation';

function makeOverlayState(): GameState {
  const owner = 'rome';
  const map: GameMap = { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 10; q++) {
    for (let r = 0; r < 10; r++) {
      const coord = { q, r };
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = { c1: { id: 'c1', owner, name: 'Rome', position: { q: 5, r: 5 } } as City };
  const visibility = { tiles: Object.fromEntries(
    Object.keys(map.tiles).map(key => [key, 'visible' as const]),
  ), lastSeen: {} };
  return {
    map, cities, units: {},
    currentPlayer: owner,
    civilizations: {
      [owner]: { id: owner, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
      carthage: { id: 'carthage', techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
    },
  } as unknown as GameState;
}

describe('getSupplyOverlayPresentationForViewer', () => {
  it('marks a tile within City range as full coverage and lists the city as a source', () => {
    const state = makeOverlayState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const covered = result.tiles.find(t => t.coord.q === 5 && t.coord.r === 6);
    expect(covered?.coverage).toBe('full');
    expect(result.sources).toContainEqual({ kind: 'city', coord: { q: 5, r: 5 } });
  });

  it('a tile outside every source radius is stable-unsupported, not full', () => {
    const state = makeOverlayState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const farTile = result.tiles.find(t => t.coord.q === 0 && t.coord.r === 0);
    expect(farTile?.coverage).toBe('stable-unsupported');
  });

  it('never includes a tile the viewer cannot currently see', () => {
    const state = makeOverlayState();
    state.civilizations.rome!.visibility.tiles[hexKey({ q: 5, r: 6 })] = 'fog';
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.tiles.some(t => t.coord.q === 5 && t.coord.r === 6)).toBe(false);
  });

  it('never includes another civ\'s territory or sources, even in-range and visible', () => {
    const state = makeOverlayState();
    state.map.tiles[hexKey({ q: 5, r: 5 })]!.owner = 'carthage';
    state.cities.c1!.owner = 'carthage';
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources).toHaveLength(0);
    expect(result.tiles.every(t => t.coverage !== 'full')).toBe(true);
  });

  it('calls getCivSupplySourceCandidates exactly once per viewer, not once per tile', () => {
    const state = makeOverlayState();
    const spy = vi.spyOn(supplySources, 'getCivSupplySourceCandidates');
    getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('lists a friendly shore-supply-capable ship as a ship source', () => {
    const state = makeOverlayState();
    state.units.ship1 = {
      id: 'ship1', owner: 'rome', type: 'transport', position: { q: 4, r: 5 },
      health: 100, movementPointsLeft: 3,
    } as GameState['units'][string];
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources).toContainEqual({ kind: 'ship', coord: { q: 4, r: 5 } });
  });

  it('marks a shore-supplied unit\'s tile as full coverage even outside the viewer\'s own territory', () => {
    const state = makeOverlayState();
    state.map.tiles[hexKey({ q: 0, r: 0 })]!.owner = null;
    state.units.landing1 = {
      id: 'landing1', owner: 'rome', type: 'warrior', position: { q: 0, r: 0 },
      health: 100, movementPointsLeft: 1,
    } as GameState['units'][string];
    const spy = vi.spyOn(supplyNaval, 'getNavalShoreSupplyAssignments').mockReturnValue(new Set(['landing1']));
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const entry = result.tiles.find(t => t.coord.q === 0 && t.coord.r === 0);
    expect(entry?.coverage).toBe('full');
    spy.mockRestore();
  });

  it('a tile made full coverage only by the road extension (#544 MR1.1) is presented as full through the real overlay pipeline, not just at the lower-level resolver', () => {
    const state = makeOverlayState();
    state.civilizations.rome!.techState.completed = ['military-logistics'];
    // City at (5,5), radius 3 -- (5,9) is distance 4, outside base radius,
    // reachable only via the road-tier (+1) extension.
    state.map.tiles[hexKey({ q: 5, r: 9 })]!.hasRoad = true;
    const withoutRoad = getSupplyOverlayPresentationForViewer(makeOverlayState(), 'rome');
    expect(withoutRoad.tiles.find(t => t.coord.q === 5 && t.coord.r === 9)?.coverage).toBe('stable-unsupported');

    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const tile = result.tiles.find(t => t.coord.q === 5 && t.coord.r === 9);
    expect(tile?.coverage).toBe('full');
  });
});
