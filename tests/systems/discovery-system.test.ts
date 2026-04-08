import { describe, it, expect } from 'vitest';
import { hasDiscoveredMinorCiv, hasMetCivilization } from '@/systems/discovery-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

describe('discovery-system', () => {
  it('treats a civ as met after one of its city tiles has been explored', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 10, includeThirdCiv: true });
    state.civilizations.player.visibility.tiles['4,0'] = 'fog';

    expect(hasMetCivilization(state, 'player', breakawayId)).toBe(true);
  });

  it('does not treat an unseen rival as met when relationship data exists but no contact exists', () => {
    const { state } = makeBreakawayFixture({ breakawayStartedTurn: 10, includeThirdCiv: true });

    expect(hasMetCivilization(state, 'player', 'outsider')).toBe(false);
  });

  it('treats a minor civ as discovered only after its city tile is visible or fogged', () => {
    const { state } = makeBreakawayFixture({ breakawayStartedTurn: 10 });
    state.minorCivs = {
      'mc-sparta': {
        id: 'mc-sparta',
        definitionId: 'sparta',
        cityId: 'mc-city',
        units: [],
        diplomacy: state.civilizations.player.diplomacy,
        activeQuests: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 0,
      },
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'],
      id: 'mc-city',
      owner: 'mc-sparta',
      position: { q: 6, r: 0 },
      ownedTiles: [{ q: 6, r: 0 }],
    };

    expect(hasDiscoveredMinorCiv(state, 'player', 'mc-sparta')).toBe(false);

    state.civilizations.player.visibility.tiles['6,0'] = 'fog';
    expect(hasDiscoveredMinorCiv(state, 'player', 'mc-sparta')).toBe(true);
  });
});
