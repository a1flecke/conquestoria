/** @vitest-environment jsdom */

import { vi } from 'vitest';
import { createContextMenu } from '@/ui/context-menu';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createTooltipLayer } from '@/ui/tooltip-layer';
import type { UiInteractionState } from '@/ui/ui-interaction-state';
import { makeDesktopControlFixture } from './helpers/desktop-controls-fixture';

// #787 phase 11: `createUiInteractionState` (the factory) was retired once
// `PanelHost` -- its only remaining production constructor -- inlined the
// same closure directly. This test only ever needed the interface shape, so
// it builds its own minimal stateful fixture instead of calling a shared
// factory.
function makeInteractions(): UiInteractionState {
  let blockingOverlayId: string | null = null;
  return {
    setBlockingOverlay: id => { blockingOverlayId = id; },
    isInteractionBlocked: () => blockingOverlayId !== null,
  };
}

describe('desktop controls', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('opens a right-click menu for a selected unit and exposes auto-explore', () => {
    const { state, container, unitId } = makeDesktopControlFixture();

    const menu = createContextMenu(container, state, { unitId });

    expect(menu.textContent).toContain('Auto-explore');
  });

  it('shows auto-explore status in selected-unit UI and offers a cancel action', () => {
    const { state, container, unitId } = makeDesktopControlFixture({ autoExploreActive: true });

    renderSelectedUnitInfo(container, state, unitId, {});

    expect(container.textContent).toContain('Auto-exploring');
    const menu = createContextMenu(container, state, { unitId });
    expect(menu.textContent).toContain('Cancel auto-explore');
  });

  it('offers auto-explore directly from an eligible selected-unit card', () => {
    const { state, container, unitId } = makeDesktopControlFixture();
    const start = vi.fn();

    renderSelectedUnitInfo(container, state, unitId, { onStartAutoExplore: start });

    const button = [...container.querySelectorAll('button')]
      .find(candidate => candidate.textContent === 'Auto-explore');
    expect(button).toBeDefined();
    button!.click();
    expect(start).toHaveBeenCalledWith(unitId);
  });

  it('shows compact, plain-language upgrade readiness without duplicate technology blockers', () => {
    const { state, container, unitId } = makeDesktopControlFixture();
    state.units[unitId].type = 'archer';
    state.civilizations.player.techState.completed = [];

    renderSelectedUnitInfo(container, state, unitId, { onUpgradeUnit: () => {} });

    expect(container.textContent).toContain('Upgrade to Crossbowman needs:');
    expect(container.textContent).toContain('Research Tactics');
    expect(container.textContent).toContain('Acquire copper');
    expect(container.textContent).toContain('Move into one of your cities');
    expect(container.textContent?.match(/Research Tactics/g)).toHaveLength(1);
  });

  it('does not expose context actions while a blocking overlay is active', () => {
    const { state, container, unitId } = makeDesktopControlFixture();
    const interactions = makeInteractions();
    interactions.setBlockingOverlay('turn-handoff');

    const menu = createContextMenu(container, state, { unitId }, {}, interactions);

    expect(menu.textContent).toContain('No actions available');
  });

  it('shows hover tooltips for yields and grid view without using innerHTML injection', () => {
    const layer = createTooltipLayer(document.body);

    layer.show({ title: 'Forest', body: '+1 Food, +1 Production' }, { x: 10, y: 10 });

    expect(layer.root.textContent).toContain('Forest');
    expect(layer.root.innerHTML).not.toContain('<script');
  });
});
