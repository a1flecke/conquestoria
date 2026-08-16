import { chooseAutoExploreMove, applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';

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
});
