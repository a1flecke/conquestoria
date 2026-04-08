import { describe, it, expect } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

describe('city-panel legendary wonders', () => {
  it('renders a Legendary Wonders entry point and shows carryover in the active city', () => {
    const { container, city, state } = makeWonderPanelFixture();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Legendary Wonders');
    expect(rendered).toContain('Wonder carryover');
  });
});
