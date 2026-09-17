import { chooseAutoExploreMove, applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexDistance } from '@/systems/hex-utils';
import type { GameState, HexCoord } from '@/core/types';

describe('auto-explore-system', () => {
  it('prefers unexplored safe tiles and avoids visible hostile attack range when alternatives exist', () => {
    const { state, unitId } = makeAutoExploreFixture({ visibleHostileNearEast: true, safeFogNorth: true });

    const order = chooseAutoExploreMove(state, unitId);

    expect(order?.to).toEqual({ q: 1, r: 0 });
  });

  // #843: the tile that would otherwise be the clear best pick (see the test above) is an
  // undefended, unallied foreign city. Auto-explore must never nominate a blocking map
  // entity's own tile as an ordinary move destination -- entering it requires the explicit
  // assault action, which auto-explore does not perform, so the naive best-scoring tile
  // would previously get chosen and then silently fail at execution (validateUnitMove's
  // 'foreign-city' rejection), stalling the unit's auto-explore indefinitely.
  it('does not nominate an undefended enemy city as its own auto-explore destination', () => {
    const { state, unitId } = makeAutoExploreFixture({ visibleHostileNearEast: true, safeFogNorth: true });
    const cityCoord = { q: 1, r: 0 };
    const city = foundCity('raiders', cityCoord, state.map, state.idCounters);
    city.id = 'undefended-raider-city';
    state.cities[city.id] = city;
    state.civilizations.raiders.cities.push(city.id);

    const order = chooseAutoExploreMove(state, unitId);

    expect(order === null || hexKey(order.to) !== hexKey(cityCoord)).toBe(true);
  });

  // #845: the same fix, but for an undefended barbarian camp -- arguably the more common
  // real-world case for a wandering scout, since camps sit on open land far more often than
  // undefended enemy cities are encountered mid-explore. Uses the same shared
  // getBlockingMapEntityKeys() the city case above exercises, so this mainly proves the fix
  // generalizes rather than needing a second, camp-specific filter.
  it('does not nominate an undefended barbarian camp as its own auto-explore destination', () => {
    const { state, unitId } = makeAutoExploreFixture({ visibleHostileNearEast: true, safeFogNorth: true });
    const campCoord = { q: 1, r: 0 };
    state.barbarianCamps['camp-1'] = { id: 'camp-1', position: campCoord, strength: 5, spawnCooldown: 3 };

    const order = chooseAutoExploreMove(state, unitId);

    expect(order === null || hexKey(order.to) !== hexKey(campCoord)).toBe(true);
  });

  it('supports wrapped maps without oscillating between seam columns', () => {
    const { state, unitId } = makeAutoExploreFixture({ onWrappedEdge: true });

    const order = chooseAutoExploreMove(state, unitId);

    expect(order).toBeDefined();
    expect(order?.to).not.toEqual({ q: 3, r: 1 });
  });

  it('clears auto-explore when the player is trapped and no safe path remains', () => {
    const { state, unitId } = makeAutoExploreFixture({ trappedByVisibleHostiles: true });

    applyAutoExploreOrder(state, unitId);

    expect((state.units[unitId] as any).automation).toBeUndefined();
  });

  // #1066: a small local pocket of already-`fog` tiles with no frontier signal (mirrors
  // a city's own initial vision radius) can permanently trap a unit in a position cycle.
  // `recencyPenalty`'s fixed 4-slot memory alone cannot prevent this -- empirically
  // confirmed to still cycle (at a larger period) even at window sizes 8 and 12; see
  // docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md
  // Section 7.1. This fixture reproduces that exact shape: a uniform fog disk bounded by
  // ocean on two sides (defeating the scoring's static positional tie-breaker), with
  // genuinely unexplored land only reachable by walking multiple consistent steps around
  // the obstacle.
  function makeOceanCornerPocket() {
    const { state, unitId } = makeAutoExploreFixture({});
    const width = 30;
    const height = 20;
    state.map.width = width;
    state.map.height = height;
    for (let q = 0; q < width; q++) {
      for (let r = 0; r < height; r++) {
        state.map.tiles[`${q},${r}`] = {
          coord: { q, r }, terrain: 'plains', elevation: 'lowland', resource: null,
          improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
      }
    }
    const start: HexCoord = { q: width - 2, r: 2 };
    for (let q = 0; q < width; q++) state.map.tiles[`${q},0`].terrain = 'ocean';
    for (let r = 0; r < height; r++) state.map.tiles[`${width - 1},${r}`].terrain = 'ocean';

    state.units[unitId].position = start;
    state.units[unitId].movementPointsLeft = 1;
    state.units[unitId].automation = { mode: 'auto-explore', lastTargets: [], startedTurn: 1 };

    const player = state.civilizations.player;
    player.visibility.tiles = {};
    for (let q = 0; q < width; q++) {
      for (let r = 0; r < height; r++) {
        const dist = hexDistance({ q, r }, start);
        player.visibility.tiles[`${q},${r}`] = dist <= 4 ? 'fog' : 'unexplored';
      }
    }
    return { state, unitId, start };
  }

  // Drives chooseAutoExploreMove/applyAutoExploreOrder (the real, full execution path,
  // including its own real-fog-of-war reveal via executeUnitMove) for `turns` rounds,
  // resetting movement each round the same way turn-processing does, and returns the
  // full position trajectory.
  function driveAutoExplore(state: GameState, unitId: string, turns: number): string[] {
    const trajectory: string[] = [hexKey(state.units[unitId].position)];
    for (let turn = 0; turn < turns; turn++) {
      state.units[unitId].movementPointsLeft = 1;
      if (!chooseAutoExploreMove(state, unitId)) break;
      applyAutoExploreOrder(state, unitId);
      trajectory.push(hexKey(state.units[unitId].position));
    }
    return trajectory;
  }

  it('#1066: escapes a fully-explored local pocket instead of cycling forever', () => {
    const { state, unitId } = makeOceanCornerPocket();

    const trajectory = driveAutoExplore(state, unitId, 60);

    // Under the pre-#1066-fix recency-only scoring, this settles into an exact,
    // indefinite repeating position cycle (empirically confirmed at every tested
    // recency-window size -- 4, 8, and 12 -- just at a larger period each time; see
    // docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md
    // Section 7.1). A working chooser must never repeat a position within its last 20
    // moves this late in a 60-turn run against a pocket this size -- it should still be
    // making continuous forward progress toward genuinely new territory.
    const tail = trajectory.slice(-20);
    expect(new Set(tail).size).toBe(tail.length);
  });
});
