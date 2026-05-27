import { describe, it, expect } from 'vitest';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

describe('legendary-wonder-notifications', () => {
  it('points ready wonders to the city via tap-to-open notification', () => {
    const state = makeLegendaryWonderFixture();

    const visible = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-ready',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });

    expect(visible?.message).toContain('can start');
    expect(visible?.message).toContain('Tap to open');
    expect(visible?.linkedCityId).toBe('city-river');
  });

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
      turnCompleted: 40,
    });
    const observerView = getLegendaryWonderNotification(state, 'rival', {
      type: 'wonder:legendary-completed',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 40,
    });

    expect(builderView?.message).toMatch(/completed/i);
    expect(builderView?.type).toBe('success');
    // Observer has not met the builder in the fixture — name is redacted.
    expect(observerView?.message).toMatch(/A rival civilization completed/);
    expect(observerView?.type).toBe('info');
  });

  it('wonder:legendary-ready notification includes linkedCityId pointing to the build city', () => {
    const state = makeLegendaryWonderFixture();
    const entry = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-ready',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });
    expect(entry?.linkedCityId).toBe('city-river');
  });

  it('wonder:legendary-completed notification does not include linkedCityId for the rival observer', () => {
    const state = makeLegendaryWonderFixture();
    const entry = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-completed',
      civId: 'rival',
      cityId: 'city-rival',
      wonderId: 'grand-canal',
      turnCompleted: 10,
    });
    expect(entry?.linkedCityId).toBeUndefined();
  });
});
