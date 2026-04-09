import { isThreatenedByVisibleHostiles } from '@/systems/movement-safety';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';

describe('movement-safety', () => {
  it('treats at-war major civ units as hostile threats', () => {
    const { state } = makeAutoExploreFixture({ majorWarNorth: true });

    expect(isThreatenedByVisibleHostiles(state, 'player', { q: 2, r: 1 })).toBe(true);
  });

  it('does not treat neutral major civ units as hostile threats', () => {
    const { state } = makeAutoExploreFixture({ neutralScoutNorth: true });

    expect(isThreatenedByVisibleHostiles(state, 'player', { q: 2, r: 1 })).toBe(false);
  });

  it('does not treat minor civ units as hostile threats unless they are at war', () => {
    const peaceful = makeAutoExploreFixture({ minorCivNorth: true, minorCivAtWar: false });
    const wartime = makeAutoExploreFixture({ minorCivNorth: true, minorCivAtWar: true });

    expect(isThreatenedByVisibleHostiles(peaceful.state, 'player', { q: 2, r: 1 })).toBe(false);
    expect(isThreatenedByVisibleHostiles(wartime.state, 'player', { q: 2, r: 1 })).toBe(true);
  });
});
