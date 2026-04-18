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

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Research');
    expect(panel.querySelectorAll('.tech-track').length).toBeGreaterThan(3);
    expect(panel.querySelector('[data-state="current"]')).toBeTruthy();
    expect(panel.querySelector('[data-state="available"]')).toBeTruthy();
  });

  it('remains usable without horizontal-strip scanning', () => {
    const state = createNewGame(undefined, 'tech-panel-grid');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-layout="tech-tree-grid"]')).toBeTruthy();
  });

  it('groups late-era nodes into readable sections instead of appending a confusing tail', () => {
    const state = createNewGame(undefined, 'tech-panel-late-era');
    state.civilizations.player.techState.completed.push('printing', 'diplomats', 'trade-routes', 'banking', 'astronomy', 'medicine');

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-era="5"]')).toBeTruthy();
    expect(panel.textContent).toContain('Late Era Foundations');
  });

  it('shows ETA language for the active research summary', () => {
    const state = createNewGame(undefined, 'tech-eta-test');
    state.civilizations.player.techState.currentResearch = 'fire';

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Turns remaining');
  });

  it('keeps deep locked items out of the default view while keeping a show-all affordance', () => {
    const state = createNewGame(undefined, 'tech-layer-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-action="show-all-techs"]')).toBeTruthy();
  });

  it('renders research queue controls', () => {
    const state = createNewGame(undefined, 'tech-queue-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Research Queue');
    expect(panel.querySelector('[data-queue-action="remove"]')).toBeTruthy();
  });
});
