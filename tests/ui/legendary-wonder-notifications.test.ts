import { describe, it, expect } from 'vitest';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

describe('legendary-wonder-notifications', () => {
  it('only shows race-revealed notifications to the observing current player', () => {
    const state = makeLegendaryWonderFixture();

    const visible = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-race-revealed',
      observerId: 'player',
      civId: 'rival',
      cityId: 'city-rival',
      wonderId: 'grand-canal',
    });
    const hidden = getLegendaryWonderNotification(state, 'rival', {
      type: 'wonder:legendary-race-revealed',
      observerId: 'player',
      civId: 'rival',
      cityId: 'city-rival',
      wonderId: 'grand-canal',
    });

    expect(visible?.message).toMatch(/Spy report/i);
    expect(hidden).toBeNull();
  });

  it('race-revealed notifications stay coarse and do not expose progress details', () => {
    const state = makeLegendaryWonderFixture();

    const visible = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-race-revealed',
      observerId: 'player',
      civId: 'rival',
      cityId: 'city-rival',
      wonderId: 'grand-canal',
    });

    expect(visible?.message).toContain('started');
    expect(visible?.message).not.toContain('production');
    expect(visible?.message).not.toContain('Quest steps');
  });

  it('only shows completion notifications to the owning current player', () => {
    const state = makeLegendaryWonderFixture();

    const visible = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-completed',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });
    const hidden = getLegendaryWonderNotification(state, 'rival', {
      type: 'wonder:legendary-completed',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });

    expect(visible?.message).toMatch(/completed/i);
    expect(hidden).toBeNull();
  });
});
