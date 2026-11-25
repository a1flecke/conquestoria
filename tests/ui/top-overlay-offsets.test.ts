// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createIconLegendOverlay } from '@/ui/icon-legend';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import { createTreasuryDrawer } from '@/ui/treasury-drawer';

// #1692 B1/B2 follow-up: the HUD and the utility toolbar wrap on a phone, so anything anchored under them must
// read the measured `--hud-height` / `--utility-toolbar-height` variables instead of a hard-coded pixel offset.
describe('overlays anchored under the HUD', () => {
  const BELOW_TOOLBAR = 'calc(var(--hud-height, 60px) + var(--utility-toolbar-height, 44px) + 8px)';

  it('places the map legend below the measured HUD and toolbar', () => {
    expect(createIconLegendOverlay().style.top).toBe(BELOW_TOOLBAR);
  });

  it('places the message log below the measured HUD and toolbar', () => {
    const panel = createNotificationLogPanel([], { onClose: vi.fn(), onFocusTarget: vi.fn() });
    expect(panel.style.top).toBe(BELOW_TOOLBAR);
  });

  it('hangs the treasury drawer from the measured HUD height', () => {
    expect(createTreasuryDrawer().element.style.top).toBe('calc(var(--hud-height, 60px) - 16px)');
  });
});
