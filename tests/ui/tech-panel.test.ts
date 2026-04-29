// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { enqueueResearch } from '@/systems/planning-system';
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
    state.civilizations.player.techState.completed.push('gathering', 'pottery', 'fire', 'writing');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-action="show-all-techs"]')).toBeTruthy();
    expect(panel.querySelector('[data-tech-id="banking"]')).toBeFalsy();
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
    expect(panel.textContent).toContain('Starts in');
  });

  it('styles queue control buttons consistently (not browser default)', () => {
    const state = createNewGame(undefined, 'tech-btn-style-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing'];

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const removeBtn = panel.querySelector('[data-queue-action="remove"]') as HTMLButtonElement | null;
    expect(removeBtn).toBeTruthy();
    expect(removeBtn?.style.background).toBeTruthy();
    expect(removeBtn?.style.borderRadius).toBeTruthy();
  });

  it('refreshes the visible research state after queue interactions', () => {
    const state = createNewGame(undefined, 'tech-refresh-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: (techId) => {
        state.civilizations.player.techState = enqueueResearch(state.civilizations.player.techState, techId);
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(fromIndex, 1);
        if (moved) {
          queue.splice(toIndex, 0, moved);
        }
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: (index) => {
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: state.civilizations.player.techState.researchQueue.filter((_, queueIndex) => queueIndex !== index),
        };
      },
      onClose: () => {},
    });

    (panel.querySelector('[data-tech-id="fire"]') as HTMLDivElement | null)?.click();

    expect(document.body.querySelector('#tech-panel')?.textContent).toContain('Researching: Fire');
  });

  it('clicking remove on a queued follow-up removes it from the rendered panel', () => {
    const state = createNewGame(undefined, 'tech-remove-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: (index) => {
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: state.civilizations.player.techState.researchQueue.filter((_, i) => i !== index),
        };
      },
      onClose: () => {},
    });

    // writing is at index 0, wheel at index 1 — remove writing (index 0)
    const removeBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="remove"][data-queue-index="0"]');
    expect(removeBtn).toBeTruthy();
    removeBtn!.click();

    // Panel rerenders — writing should be gone, wheel remains as slot 1
    const panelAfter = document.body.querySelector('#tech-panel');
    expect(panelAfter?.textContent).not.toContain('Queue slot 2');
    expect(panelAfter?.textContent).toContain('Queue slot 1');
  });

  it('clicking ↓ on a queued follow-up moves it down in the rendered panel', () => {
    const state = createNewGame(undefined, 'tech-move-down-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: (from, to) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(from, 1);
        if (moved) queue.splice(to, 0, moved);
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    // writing is index 0; press ↓ to move it after wheel
    const downBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="0"]');
    expect(downBtn).toBeTruthy();
    expect(downBtn!.disabled).toBe(false);
    downBtn!.click();

    expect(state.civilizations.player.techState.researchQueue).toEqual(['wheel', 'writing']);
  });

  it('↑ button on the first research queue item (index 0) is disabled', () => {
    const state = createNewGame(undefined, 'tech-up-disabled-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const upBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="up"][data-queue-index="0"]');
    expect(upBtn).toBeTruthy();
    expect(upBtn!.disabled).toBe(true);
  });

  it('↓ button on the last research queue item is disabled', () => {
    const state = createNewGame(undefined, 'tech-down-disabled-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    // wheel is the last item (index 1) — its ↓ button must be disabled
    const downBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="1"]');
    expect(downBtn).toBeTruthy();
    expect(downBtn!.disabled).toBe(true);
  });
});
