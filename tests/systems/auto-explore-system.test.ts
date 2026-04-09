import { chooseAutoExploreMove, applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';

describe('auto-explore-system', () => {
  it('prefers unexplored safe tiles and avoids visible hostile attack range when alternatives exist', () => {
    const { state, unitId } = makeAutoExploreFixture({ visibleHostileNearEast: true, safeFogNorth: true });

    const order = chooseAutoExploreMove(state, unitId);

    expect(order?.to).toEqual({ q: 1, r: 0 });
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
