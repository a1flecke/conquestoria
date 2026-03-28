import { createVisibilityMap, updateVisibility, isVisible, isFog, isUnexplored, getTerrainVisionBonus, revealMinorCivCities, applySharedVision } from '@/systems/fog-of-war';
import type { VisibilityMap, GameMap, Unit } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('fog-of-war', () => {
  let map: GameMap;
  let vis: VisibilityMap;

  beforeEach(() => {
    map = generateMap(30, 30, 'fog-test');
    vis = createVisibilityMap();
  });

  it('starts fully unexplored', () => {
    expect(isUnexplored(vis, { q: 10, r: 10 })).toBe(true);
    expect(isVisible(vis, { q: 10, r: 10 })).toBe(false);
  });

  it('reveals tiles around a unit', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    const revealed = updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);
    expect(revealed.length).toBeGreaterThan(0);
  });

  it('scout has larger vision than warrior', () => {
    const scout: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };
    const warrior: Unit = {
      id: 'u2', type: 'warrior', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    const visScout = createVisibilityMap();
    const visWarrior = createVisibilityMap();

    const scoutRevealed = updateVisibility(visScout, [scout], map);
    const warriorRevealed = updateVisibility(visWarrior, [warrior], map);

    expect(scoutRevealed.length).toBeGreaterThan(warriorRevealed.length);
  });

  it('previously visible tiles become fog when unit moves away', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);

    // Move unit far away
    unit.position = { q: 1, r: 1 };
    updateVisibility(vis, [unit], map);

    // Old position should be fog (seen before but no longer visible)
    expect(isFog(vis, { q: 15, r: 15 })).toBe(true);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(false);
  });
});

describe('new terrain vision', () => {
  it('jungle has -1 vision penalty', () => {
    expect(getTerrainVisionBonus('jungle')).toBe(-1);
  });

  it('swamp has no vision bonus', () => {
    expect(getTerrainVisionBonus('swamp')).toBe(0);
  });
});

describe('minor civ visibility', () => {
  it('reveals minor civ city when nearby tile explored', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore a tile within 2 hexes
    vis.tiles['11,10'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBe('visible');
  });

  it('does not reveal distant minor civ city', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore tile far away
    vis.tiles['20,20'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBeUndefined();
  });

  it('adds shared vision for friendly minor civ', () => {
    const vis = createVisibilityMap();
    const friendlyUnitPositions = [{ q: 15, r: 15 }];
    const map = { tiles: {}, width: 30, height: 30 } as any;
    for (let q = 13; q <= 17; q++) {
      for (let r = 13; r <= 17; r++) {
        map.tiles[`${q},${r}`] = { coord: { q, r }, terrain: 'grassland' };
      }
    }

    applySharedVision(vis, friendlyUnitPositions, map);
    expect(vis.tiles['15,15']).toBe('visible');
  });
});
