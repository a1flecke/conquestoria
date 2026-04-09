/** @vitest-environment jsdom */

import { createContextMenu } from '@/ui/context-menu';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createTooltipLayer } from '@/ui/tooltip-layer';
import { createUiInteractionState } from '@/ui/ui-interaction-state';
import { makeDesktopControlFixture } from './helpers/desktop-controls-fixture';

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

  it('does not expose context actions while a blocking overlay is active', () => {
    const { state, container, unitId } = makeDesktopControlFixture();
    const interactions = createUiInteractionState();
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
