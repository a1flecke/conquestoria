// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi } from 'vitest';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
import { getLegendaryWonderPresentationForCity } from '@/systems/legendary-wonder-presentation';
import { createWonderPanel } from '@/ui/wonder-panel';
import { appendGuidanceStrip, appendWonderEmptyState } from '@/ui/wonder-panel-view';
import {
  makeWonderPanelFixture,
  makeWonderPresentationEntry,
  collectText,
} from './helpers/wonder-panel-fixture';

describe('wonder-panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the seven visible states on their exact project cards', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('printing', 'diplomats');
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.legendaryWonderProjects!['grand-canal'].phase = 'building';
    state.legendaryWonderProjects!['world-archive'] = {
      wonderId: 'world-archive',
      ownerId: 'player',
      cityId: city.id,
      phase: 'questing',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [{ id: 'archive-step', description: 'Collect records.', completed: false }],
    };
    state.legendaryWonderProjects!['sun-spire'] = {
      wonderId: 'sun-spire',
      ownerId: 'player',
      cityId: city.id,
      phase: 'lost_race',
      investedProduction: 80,
      transferableProduction: 20,
      questSteps: [],
    };
    state.completedLegendaryWonders = {
      'moonwell-gardens': { ownerId: 'player', cityId: city.id, turnCompleted: state.turn },
    };

    const panel = createWonderPanel(container, state, city.id, {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const expectState = (wonderId: string, visibleState: string, label: string) => {
      const card = panel.querySelector(`[data-project-card="${wonderId}"]`);
      const chip = card?.querySelector(`[data-wonder-status-chip="${visibleState}"]`);
      expect(chip?.textContent).toContain(label);
    };

    expectState('oracle-of-delphi', 'ready', 'Ready to build');
    expectState('world-archive', 'questing', 'Quest in progress');
    expectState('grand-canal', 'building', 'Under construction');
    expectState('moonwell-gardens', 'completed', 'Completed');
    expectState('sun-spire', 'recovered', 'Race lost');
    expectState('starvault-observatory', 'near', 'Available soon');
    expectState('manhattan-project', 'blocked', 'Blocked');
  });

  it('labels quest rows with visible and machine-readable completion semantics', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = [
      { id: 'discover-natural-wonder', description: 'Discover a natural wonder.', completed: true },
      // The panel refreshes description text from the canonical wonder definition at
      // render time (strategy-game-mechanics.md: "existing seeded projects should
      // refresh definition-backed descriptions... so panels cannot drift from the
      // roster"), so this mock description is not what actually renders — the real
      // text (asserted below) comes from legendary-wonder-definitions.ts's
      // complete-pilgrimage-route step, fixed in #432 to drop the misleading
      // "pilgrimage" flavor text. Kept here for readability of the fixture shape only.
      { id: 'complete-pilgrimage-route', description: 'Establish a trade route.', completed: false },
    ];

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const rows = Array.from(
      panel.querySelectorAll<HTMLElement>('[data-wonder-quest-list="oracle-of-delphi"] [data-wonder-quest-step]'),
    );

    expect(rows.map(row => row.dataset.wonderQuestStep)).toEqual(['completed', 'pending']);
    expect(rows[0].textContent).toContain('✓ Complete: Discover a natural wonder.');
    expect(rows[1].textContent).toContain('○ Pending: Establish a trade route.');
    expect(rows.some(row => row.dataset.wonderQuestStep === 'blocked')).toBe(false);
  });

  it('renders a labelled dialog with responsive phone and laptop layout invariants', () => {
    const { container, state } = makeWonderPanelFixture();
    const onClose = vi.fn();
    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose,
    });

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe('wonder-panel-title');
    expect(panel.querySelector('#wonder-panel-title')?.textContent).toBe('🏛️ Legendary Wonders');
    expect(panel.textContent).toContain('Player · city-river');
    expect(panel.style.boxSizing).toBe('border-box');
    expect(panel.style.overflowX).toBe('hidden');

    const shell = panel.querySelector<HTMLElement>('[data-wonder-layout="responsive-shell"]');
    expect(shell?.style.width).toBe('100%');
    expect(shell?.style.maxWidth).toBe('1120px');
    expect(shell?.style.margin).toBe('0px auto');

    const header = panel.querySelector<HTMLElement>('[data-wonder-layout="header"]');
    expect(header?.style.flexWrap).toBe('wrap');
    for (const grid of panel.querySelectorAll<HTMLElement>('[data-wonder-card-grid]')) {
      expect(grid.style.gridTemplateColumns).toContain('auto-fit');
      expect(grid.style.gridTemplateColumns).toContain('min(100%,');
    }

    const topClose = panel.querySelector<HTMLButtonElement>('[data-wonder-panel-close="top"]');
    expect(document.activeElement).toBe(topClose);
    const bubbledKeydown = vi.fn();
    container.addEventListener('keydown', bubbledKeydown);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    panel.dispatchEvent(escape);
    expect(onClose).toHaveBeenCalledOnce();
    expect(escape.defaultPrevented).toBe(true);
    expect(bubbledKeydown).not.toHaveBeenCalled();
  });

  it('prioritizes missing requirements over quest advice for near guidance', () => {
    const host = document.createElement('div');
    appendGuidanceStrip(host, makeWonderPresentationEntry({
      visibleState: 'near',
      missingRequirements: ['Printing', 'Stone'],
    }), () => {});

    expect(host.textContent).toContain('Missing Printing, Stone');
    expect(host.textContent).not.toContain('next step');
    expect(host.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
  });

  it('renders guidance CTA only when buildability and action label are both present', () => {
    const start = vi.fn();
    const readyHost = document.createElement('div');
    appendGuidanceStrip(readyHost, makeWonderPresentationEntry({
      visibleState: 'ready',
      eligibilityState: 'buildable',
      phase: 'ready_to_build',
      canStartBuild: true,
      startActionLabel: 'Start Construction',
      questCompleted: 2,
    }), start);
    readyHost.querySelector<HTMLButtonElement>('[data-wonder-guidance-start-build]')!.click();
    expect(start).toHaveBeenCalledWith('oracle-of-delphi');

    for (const visibleState of ['questing', 'building', 'completed', 'recovered', 'near', 'blocked'] as const) {
      const host = document.createElement('div');
      appendGuidanceStrip(host, makeWonderPresentationEntry({
        visibleState,
        canStartBuild: false,
        startActionLabel: null,
      }), start);
      expect(host.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
    }

    const missingLabelHost = document.createElement('div');
    appendGuidanceStrip(missingLabelHost, makeWonderPresentationEntry({
      visibleState: 'ready',
      canStartBuild: true,
      startActionLabel: null,
    }), start);
    expect(missingLabelHost.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
  });

  it('allows only one start callback across duplicate guidance and card CTAs', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    const onStartBuild = vi.fn();
    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild,
      onClose: () => {},
    });

    const guidance = panel.querySelector<HTMLButtonElement>(
      '[data-wonder-guidance-start-build="oracle-of-delphi"]',
    )!;
    const card = panel.querySelector<HTMLButtonElement>(
      '[data-wonder-start-build="oracle-of-delphi"]',
    )!;

    guidance.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    guidance.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onStartBuild).toHaveBeenCalledTimes(1);
    expect(onStartBuild).toHaveBeenCalledWith('city-river', 'oracle-of-delphi');
    expect(guidance.disabled).toBe(true);
    expect(card.disabled).toBe(true);
  });

  it('teaches wonder rules through contextual cards instead of glossary blocks', () => {
    const { container, state } = makeWonderPanelFixture();

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).not.toContain('Eligibility Required techs, resources');
    expect(rendered).not.toContain('Construction Race Losing returns');
    expect(rendered).toContain('Missing:');
    expect(rendered).toContain('Quest steps:');
    expect(rendered).toContain('Reward:');
    expect(rendered).toContain('Discover a natural wonder');
  });

  it('shows construction milestone and reward-active completion copy from presentation entries', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    city.productionQueue = ['legendary:oracle-of-delphi'];
    city.productionProgress = 72;
    state.completedLegendaryWonders = {
      'grand-canal': { ownerId: 'player', cityId: city.id, turnCompleted: 44 },
    };

    const panel = createWonderPanel(container, state, city.id, {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const text = collectText(panel);

    expect(text).toContain('Final works');
    expect(text).toContain('Reward active');
    expect(text).toContain('Normal production has resumed.');
  });

  it('shows active build progress, ETA, and queue continuity from presentation data', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    city.productionQueue = ['legendary:oracle-of-delphi', 'library', 'warrior'];
    city.productionProgress = 72;
    city.focus = 'production';

    const panel = createWonderPanel(container, state, city.id, {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const card = panel.querySelector('[data-project-card="oracle-of-delphi"]');

    expect(card?.textContent).toContain('Under construction');
    expect(card?.textContent).toContain('Race status: 72/120 production invested.');
    expect(card?.textContent).toMatch(/ETA: \d+ turns\./);
    expect(card?.textContent).toContain('Queue resumes after this wonder.');
    expect(card?.querySelector('[data-wonder-start-build]')).toBeNull();
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
    expect(rendered).toContain('Second Player');
    expect(rendered).not.toContain('Rival is pursuing this');
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
    expect(rendered).toContain('Sacred Sites');
    expect(rendered).toContain('Reward');
  });

  it('shows live missing-tech requirements for late-era wonders in the panel', () => {
    const { container, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = [];

    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Manhattan Project');
    expect(rendered).toContain('Missing: Nuclear Weapons, Nuclear Physics');
    expect(rendered).toContain('Internet');
    expect(rendered).toContain('Missing: ARPANET, Satellite Television');
  });

  it('does not overwhelm the player with an undifferentiated list of wonders', () => {
    const { container, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = [
      'philosophy',
      'sacred-sites',
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

  it('renders every canonical selected-city entry exactly once across both sections', () => {
    const { container, state } = makeWonderPanelFixture();
    const expected = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-project-card]'));
    const renderedIds = cards.map(card => card.dataset.projectCard);
    expect(renderedIds).toHaveLength(expected.length);
    expect(new Set(renderedIds).size).toBe(expected.length);
    expect(new Set(renderedIds)).toEqual(new Set(expected.map(entry => entry.wonderId)));
    expect(panel.querySelectorAll('[data-recommended-project="true"]').length).toBeLessThanOrEqual(3);

    const recommendedIds = new Set(
      Array.from(panel.querySelectorAll<HTMLElement>('[data-recommended-project="true"]'))
        .map(card => card.dataset.projectCard),
    );
    const catalogIds = new Set(
      Array.from(panel.querySelectorAll<HTMLElement>('[data-section="all-city-wonders"] [data-project-card]'))
        .map(card => card.dataset.projectCard),
    );
    for (const entry of expected) {
      expect(recommendedIds.has(entry.wonderId) || catalogIds.has(entry.wonderId)).toBe(true);
    }
    expect(catalogIds.has('manhattan-project')).toBe(true);
  });

  it('keeps catalog cards compact while preserving required decision data', () => {
    const { container, state } = makeWonderPanelFixture();
    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const catalogCards = Array.from(
      panel.querySelectorAll<HTMLElement>('[data-section="all-city-wonders"] [data-project-card]'),
    );

    for (const card of catalogCards) {
      expect(card.querySelector('[data-wonder-status-chip]')).not.toBeNull();
      expect(card.querySelector('[data-wonder-reward-summary]')).not.toBeNull();
      expect(card.querySelector('[data-wonder-quest-list]')).not.toBeNull();
      expect(card.querySelectorAll('[data-wonder-quest-step]').length).toBeLessThanOrEqual(1);
      expect(card.textContent).toMatch(/Missing:|Next:|All quest steps complete/);
    }
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
          id: 'route-1',
          fromCityId: 'city-river',
          toCityId: 'city-rival',
          goldPerTrip: 12,
          turnsPerTrip: 3,
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
    expect(panel.textContent).toContain('Ready to build');
    expect(panel.textContent).toContain('Quest steps: 2/2 complete.');
    expect(Array.from(panel.querySelectorAll('button')).some(button => button.textContent === 'Start Construction')).toBe(true);
    expect(panel.textContent).toContain('current queue continues after this wonder');
  });

  it('starts construction from the selected city and keeps the panel action explicit', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    const onStartBuild = vi.fn();

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild,
      onClose: () => {},
    });

    const start = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Start Construction');
    expect(start).toBeTruthy();
    expect(panel.textContent).toContain('current queue continues after this wonder');

    start!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onStartBuild).toHaveBeenCalledWith('city-river', 'oracle-of-delphi');
  });

  it('keeps a close control available at the top of the journal', () => {
    const { container, state } = makeWonderPanelFixture();
    const onClose = vi.fn();

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose,
    });
    const close = panel.querySelector('[data-wonder-panel-close="top"]');

    expect(close).toBeTruthy();
    close!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows grand canal as incomplete when only another city is developed', () => {
    const { container, state } = makeWonderPanelFixture();
    state.cities['city-river'].buildings = ['granary'];
    state.cities['city-rival'].owner = 'player';
    state.cities['city-rival'].buildings = ['granary', 'market', 'library'];
    state.civilizations.player.cities = ['city-river', 'city-rival'];
    // MR11's era-1/2 wonders otherwise outrank Grand Canal (era 4) in the recommended
    // list; mark them completed-elsewhere so this test keeps exercising Grand Canal's
    // full (non-compact) quest-step rendering, same as before MR11.
    state.completedLegendaryWonders = {
      'standing-stones': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 5 },
      'great-pyramid': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 10 },
      'tidemother-colossus': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 15 },
    };

    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Grand Canal');
    expect(rendered).toContain('Develop this river city into a major civic center.');
    expect(rendered).not.toContain('Phase: ready to build');
  });

  it('shows remarkable-site progress from mixed discovery history immediately', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderHistory = {
      destroyedStrongholds: [],
      discoveredSites: [
        { civId: 'player', siteId: 'crystal_caverns', siteType: 'natural-wonder', position: { q: 8, r: 2 }, turn: 12 },
        { civId: 'player', siteId: 'village-3', siteType: 'tribal-village', position: { q: 5, r: 1 }, turn: 15 },
      ],
    };

    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Starvault Observatory');
    expect(rendered).toContain('Discover 2 remarkable sites.');
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

  it('renders every viewer-safe started report without exposing live project detail', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderIntel = {
      player: ['grand-canal', 'sun-spire', 'world-archive', 'moonwell-gardens'].map((wonderId, index) => ({
        projectKey: `${wonderId}-rival`,
        wonderId,
        civId: 'rival',
        civName: 'Rival',
        cityId: `rival-city-${index}`,
        cityName: `Known Rival City ${index + 1}`,
        revealedTurn: 40 + index,
        intelLevel: 'started' as const,
      })),
    };

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const rivalSection = panel.querySelector('[data-section="rival-wonders"]');

    expect(rivalSection?.querySelectorAll('[data-rival-intel-card]')).toHaveLength(4);
    expect(rivalSection?.textContent).toContain('Known Rival City 4');
    expect(rivalSection?.textContent).toContain('Current progress unknown without fresh infiltration.');
    expect(rivalSection?.textContent).not.toContain('production invested');
    expect(rivalSection?.textContent).not.toContain('Quest steps:');
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

  it('does not render completed rival atlas intel as an active rival race', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:grand-canal:rival:58',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      }],
    };

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-section="rival-wonders"]')).toBeNull();
    expect(panel.textContent).not.toContain('Rival is pursuing this');
    expect(panel.textContent).not.toContain('Rival completed Grand Canal');
  });

  it('renders the no-ambitions state as an explanatory card', () => {
    const host = document.createElement('div');
    appendWonderEmptyState(
      host,
      'No known wonder ambitions in this city',
      'Keep exploring, researching, or meeting city conditions to reveal new ambitions.',
    );
    const empty = host.querySelector('[data-wonder-empty-state]');
    expect(empty?.textContent).toContain('No known wonder ambitions in this city');
    expect(empty?.textContent).toContain('Keep exploring, researching');
  });

  it('renders fallback context and no actions for a missing city', () => {
    const { container, state } = makeWonderPanelFixture();
    const panel = createWonderPanel(container, state, 'missing-city', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Player · missing-city');
    expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
    expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
    expect(panel.querySelector('[data-wonder-panel-close="top"]')).not.toBeNull();
    expect(panel.querySelector('[data-wonder-panel-close="bottom"]')).not.toBeNull();
  });

  it('does not render current-player ambitions against a foreign selected city', () => {
    const { container, state } = makeWonderPanelFixture();
    const panel = createWonderPanel(container, state, 'city-rival', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
    expect(panel.querySelector('[data-project-card]')).toBeNull();
    expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
  });

  it('renders fallback IDs without crashing when the current civilization is missing', () => {
    const { container, state } = makeWonderPanelFixture();
    delete state.civilizations.player;
    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('player · city-river');
    expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
    expect(panel.querySelector('[data-project-card]')).toBeNull();
    expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
  });

  it('Start Construction and Close buttons have styled background and color', () => {
    const { container, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['masonry', 'writing', 'calendar'];
    state.wonderDiscoverers = { 'natural-1': ['player'] };
    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });
    const allButtons = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
    for (const btn of allButtons) {
      expect(btn.style.background, `${btn.textContent} background`).not.toBe('');
      expect(btn.style.color, `${btn.textContent} color`).not.toBe('');
    }
  });
});
