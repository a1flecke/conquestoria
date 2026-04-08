import { describe, it, expect } from 'vitest';
import { createWonderPanel } from '@/ui/wonder-panel';
import { makeWonderPanelFixture, collectText } from './helpers/wonder-panel-fixture';

describe('wonder-panel', () => {
  it('shows eligibility, quest steps, build city, and race compensation text', () => {
    const { container, state } = makeWonderPanelFixture();

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Eligibility');
    expect(rendered).toContain('Quest');
    expect(rendered).toContain('Construction Race');
    expect(rendered).toContain('25% coins');
    expect(rendered).toContain('25% carryover');
    expect(rendered).toContain('Discover a natural wonder');
  });

  it('shows only the current players selected-city projects in hot seat', () => {
    const { container, state } = makeWonderPanelFixture();

    state.currentPlayer = 'player-2';
    state.cities['city-2'] = {
      ...state.cities['city-river'],
      id: 'city-2',
      owner: 'player-2',
      name: 'Second City',
    };
    state.civilizations['player-2'] = {
      ...state.civilizations.player,
      id: 'player-2',
      name: 'Second Player',
      isHuman: true,
      cities: ['city-2'],
    };
    state.legendaryWonderProjects!['world-archive'] = {
      wonderId: 'world-archive',
      ownerId: 'player-2',
      cityId: 'city-2',
      phase: 'ready_to_build',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    };

    const panel = createWonderPanel(container, state, 'city-2', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('World Archive');
    expect(rendered).not.toContain('Oracle of Delphi');
  });

  it('shows concrete eligibility failures and reward summary for the selected project', () => {
    const { container, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['philosophy'];
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'completed';

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Missing');
    expect(rendered).toContain('pilgrimages');
    expect(rendered).toContain('Reward');
  });
});
