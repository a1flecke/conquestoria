// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
import { foundCity } from '@/systems/city-system';
import { createCouncilPanel } from '@/ui/council-panel';
import { makeCouncilFixture } from './helpers/council-fixture';

describe('council-panel', () => {
  it('renders do-now, soon, to-win, and drama buckets with talk-level controls', () => {
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Do Now');
    expect(panel.textContent).toContain('Soon');
    expect(panel.textContent).toContain('To Win');
    expect(panel.textContent).toContain('Council Drama');
    expect(panel.textContent).toContain('quiet');
    expect(panel.textContent).toContain('chaos');
  });

  it('does not reveal undiscovered city names in the panel', () => {
    const { state, container } = makeCouncilFixture({ discoveredForeignCity: false });

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).not.toContain('Rome');
  });

  it('renders why-copy in a readable way for actionable guidance', () => {
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Why');
  });

  it('invokes the talk-level callback when the player changes the council mode', () => {
    const onTalkLevelChange = vi.fn();
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange,
    });

    (panel.querySelector('[data-talk-level="chaos"]') as HTMLButtonElement).click();

    expect(onTalkLevelChange).toHaveBeenCalledWith('chaos');
  });

  it('keeps wonder recommendations playful but bounded', () => {
    const { state, container } = makeCouncilFixture();
    state.civilizations.player.techState.completed = [
      'philosophy',
      'pilgrimages',
      'city-planning',
      'printing',
      'banking',
      'astronomy',
      'natural-philosophy',
      'engineering',
    ];
    state.wonderDiscoverers = {
      '1,1': ['player'],
    };
    let playerCityId = state.civilizations.player.cities[0];
    if (!playerCityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const city = foundCity('player', settler.position, state.map);
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        playerCityId = city.id;
      }
    }
    if (!playerCityId) {
      throw new Error('expected player city for wonder recommendation test');
    }
    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', playerCityId);
    const readyProject = Object.values(seededState.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.wonderId === 'oracle-of-delphi',
    );
    if (readyProject) {
      readyProject.phase = 'ready_to_build';
      readyProject.questSteps = readyProject.questSteps.map(step => ({ ...step, completed: true }));
    }

    const panel = createCouncilPanel(container, seededState, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    const wonderCards = panel.querySelectorAll('[data-card-type="wonder"]');
    expect(wonderCards.length).toBeGreaterThan(0);
    expect(wonderCards.length).toBeLessThanOrEqual(3);
    expect(panel.textContent).toContain('Legendary');
  });

  it('keeps to-win wonder advice limited to reachable opportunities', () => {
    const { state, container } = makeCouncilFixture();
    let cityId = state.civilizations.player.cities[0];
    if (!cityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const city = foundCity('player', settler.position, state.map);
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        cityId = city.id;
      }
    }
    const city = cityId ? state.cities[cityId] : undefined;
    state.civilizations.player.techState.completed = ['philosophy', 'pilgrimages'];
    if (city) {
      for (const coord of city.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].resource = 'stone';
        }
      }
    }

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Oracle of Delphi');
    expect(panel.textContent).not.toContain('World Archive');
  });

  it('renders remembered disagreements and callback-safe memory labels', () => {
    const { state, container } = makeCouncilFixture({ metForeignCiv: true, discoveredForeignCity: false });
    state.councilMemory = {
      player: {
        entries: [
          {
            key: 'watch-rival-harbor',
            advisor: 'spymaster',
            kind: 'watch-rival-city',
            turn: 12,
            subjects: { civId: 'ai-1', cityId: 'city-rome' },
            outcome: 'pending',
          },
          {
            key: 'war-vs-trade-rival',
            advisor: 'chancellor',
            kind: 'advisor-disagreement',
            turn: 12,
            subjects: {
              civId: 'ai-1',
              advisorFor: 'warchief',
              advisorAgainst: 'treasurer',
              forAction: 'Press the frontier',
              againstAction: 'Fund markets instead',
            },
            outcome: 'pending',
          },
        ],
        eraCallbackCount: 0,
        callbackEra: state.era,
      },
    };

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Council Memory');
    expect(panel.textContent).toContain('Council Disagreements');
    expect(panel.textContent).toContain('an undiscovered foreign city');
    expect(panel.textContent).not.toContain('Rome');
  });
});

describe('council-panel visual structure', () => {
  it('exposes a header element containing both an h2 title and a close button', () => {
    const { state, container } = makeCouncilFixture();
    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });
    const header = panel.querySelector('header');
    expect(header).toBeTruthy();
    expect(header?.querySelector('h2')).toBeTruthy();
    expect(header?.querySelector('button')).toBeTruthy();
  });

  it('marks exactly one talk-level button with aria-pressed=true matching state.settings.councilTalkLevel', () => {
    const { state, container } = makeCouncilFixture();
    state.settings.councilTalkLevel = 'chatty';

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    const buttons = Array.from(panel.querySelectorAll('button[data-talk-level]')) as HTMLButtonElement[];
    expect(buttons.length).toBe(4);
    const pressed = buttons.filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].dataset.talkLevel).toBe('chatty');
  });

  it('updates aria-pressed immediately on click before the next render', () => {
    const { state, container } = makeCouncilFixture();
    state.settings.councilTalkLevel = 'normal';

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    const quietBtn = panel.querySelector('button[data-talk-level="quiet"]') as HTMLButtonElement;
    quietBtn.click();
    expect(quietBtn.getAttribute('aria-pressed')).toBe('true');
    const others = Array.from(panel.querySelectorAll('button[data-talk-level]:not([data-talk-level="quiet"])'));
    for (const o of others) {
      expect(o.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('renders the four agenda buckets as <section> elements with distinct headings', () => {
    const { state, container } = makeCouncilFixture();
    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });
    const sections = panel.querySelectorAll('section');
    const headings = Array.from(sections).map(s => s.querySelector('h3')?.textContent ?? '');
    expect(headings).toEqual(expect.arrayContaining(['Do Now', 'Soon', 'To Win', 'Council Drama']));
  });
});
