// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { startResearch } from '@/systems/tech-system';
import { createTechPanel } from '@/ui/tech-panel';

describe('tech-panel', () => {
  it('groups techs by readable tracks and emphasizes current / next relevant research', () => {
    const state = createNewGame(undefined, 'tech-panel-test');
    const firstAvailable = state.civilizations.player.techState.completed.length === 0
      ? 'stone-weapons'
      : state.civilizations.player.techState.completed[0];
    state.civilizations.player.techState = startResearch(state.civilizations.player.techState, firstAvailable);

    const panel = createTechPanel(document.body, state, { onStartResearch: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Research');
    expect(panel.querySelectorAll('.tech-track').length).toBeGreaterThan(3);
    expect(panel.querySelector('[data-state="current"]')).toBeTruthy();
    expect(panel.querySelector('[data-state="available"]')).toBeTruthy();
  });

  it('remains usable without horizontal-strip scanning', () => {
    const state = createNewGame(undefined, 'tech-panel-grid');
    const panel = createTechPanel(document.body, state, { onStartResearch: () => {}, onClose: () => {} });

    expect(panel.querySelector('[data-layout="tech-tree-grid"]')).toBeTruthy();
  });
});
