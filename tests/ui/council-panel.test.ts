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
});
