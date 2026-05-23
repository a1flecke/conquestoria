import { describe, expect, it } from 'vitest';
import { getLegendaryWonderMapEntries } from '@/systems/legendary-wonder-map-presentation';
import { hexKey } from '@/systems/hex-utils';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-map-presentation', () => {
  it('returns owner-safe completed landmark entries for visible owned host cities', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 20 },
    };
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';

    const entries = getLegendaryWonderMapEntries(state, 'player');

    expect(entries).toEqual([
      expect.objectContaining({
        wonderId: 'oracle-of-delphi',
        cityId: 'city-river',
        coord: state.cities['city-river'].position,
        turnCompleted: 20,
      }),
    ]);
  });

  it('does not expose rival completed landmarks without earned visibility', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'rival-city', turnCompleted: 20 },
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toEqual([]);
  });
});
