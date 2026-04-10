// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
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

  it('does not overwhelm the player with an undifferentiated list of wonders', () => {
    const { container, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = [
      'philosophy',
      'pilgrimages',
      'city-planning',
      'printing',
      'diplomats',
      'banking',
      'agricultural-science',
      'natural-philosophy',
      'astronomy',
    ];
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'grand-canal-rival',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'city-rival',
        revealedTurn: 40,
        intelLevel: 'started',
      }],
    };
    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const cityProjectCount = Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === seededState.currentPlayer && project.cityId === 'city-river',
    ).length;

    expect(panel.querySelectorAll('[data-section="recommended-wonders"]').length).toBe(1);
    expect(panel.textContent).toContain('Best fits right now');
    expect(panel.querySelectorAll('[data-project-card]').length).toBe(cityProjectCount);
    expect(panel.querySelectorAll('[data-rival-intel-card]').length).toBe(1);
    expect(panel.querySelectorAll('[data-recommended-project="true"]').length).toBeLessThanOrEqual(3);
    expect(panel.textContent).toContain('All ambitions in this city');
    expect(panel.textContent).toContain('In progress elsewhere');
  });

  it('renders every selected-city wonder project exactly once', () => {
    const { container, state } = makeWonderPanelFixture();
    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const cityProjectCount = Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === seededState.currentPlayer && project.cityId === 'city-river',
    ).length;

    expect(panel.querySelectorAll('[data-project-card]').length).toBe(cityProjectCount);
    expect(panel.querySelectorAll('[data-section="all-city-wonders"]').length).toBe(1);
  });

  it('shows current progress immediately for a newly seeded wonder that is already ready', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects = undefined;
    state.wonderDiscoverers = { 'natural-1': ['player'] };
    state.marketplace = {
      prices: {} as any,
      priceHistory: {} as any,
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [
        {
          fromCityId: 'city-river',
          toCityId: 'city-rival',
          goldPerTurn: 4,
          foreignCivId: 'rival',
        },
      ],
    };

    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Oracle of Delphi');
    expect(panel.textContent).toContain('Phase: ready to build');
    expect(panel.textContent).toContain('Quest steps: 2/2 complete.');
    expect(Array.from(panel.querySelectorAll('button')).some(button => button.textContent === 'Start Build')).toBe(true);
  });

  it('does not reveal rival wonder races without earned intel', () => {
    const { container, state } = makeWonderPanelFixture();

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('Rival is pursuing this');
    expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(0);
  });

  it('shows only rival wonder races revealed to the current player', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'grand-canal-rival',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      }],
    };

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const rivalSection = panel.querySelector('[data-section="rival-wonders"]');

    expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(1);
    expect(rivalSection?.textContent).toContain('Rival is pursuing this');
    expect(rivalSection?.textContent).toContain('Rival Harbor');
    expect(rivalSection?.textContent).not.toContain('90/180');
    expect(rivalSection?.textContent).not.toContain('Quest steps:');
    expect(rivalSection?.textContent).not.toContain('Connect two cities');
  });

  it('does not show rival wonder intel revealed only to another hot-seat player', () => {
    const { container, state } = makeWonderPanelFixture();
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
    state.currentPlayer = 'player-2';
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'grand-canal-rival',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      }],
    };

    const panel = createWonderPanel(container, state, 'city-2', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.querySelectorAll('[data-section="rival-wonders"]').length).toBe(0);
  });

  it('shows rival wonder spy intel without leaking exact progress or quest steps', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'grand-canal-rival',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      }],
    };

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const rivalSection = panel.querySelector('[data-section="rival-wonders"]');

    expect(rivalSection?.textContent).toContain('Rival Harbor');
    expect(rivalSection?.textContent).toContain('Grand Canal');
    expect(rivalSection?.textContent).not.toContain('90/180 production');
    expect(rivalSection?.textContent).not.toContain('Quest steps:');
    expect(rivalSection?.textContent).not.toContain('Connect two cities');
  });
});
