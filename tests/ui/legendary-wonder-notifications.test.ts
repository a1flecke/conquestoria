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

  it('gives the builder a city-scoped completion message and observers a redacted civ-scoped message', () => {
    const state = makeLegendaryWonderFixture();

    const builderView = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-completed',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });
    const observerView = getLegendaryWonderNotification(state, 'rival', {
      type: 'wonder:legendary-completed',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });

    expect(builderView?.message).toMatch(/completed/i);
    expect(builderView?.type).toBe('success');
    // Observer has not met the builder in the fixture — name is redacted.
    expect(observerView?.message).toMatch(/A rival civilization completed/);
    expect(observerView?.type).toBe('info');
  });
});
