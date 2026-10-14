// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { getProductionIconForItem } from '@/systems/city-production-presentation';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

// The chooser only lists the four best-ranked wonders, so pin which ones it offers: one with art, one without.
vi.mock('@/systems/legendary-wonder-presentation', async importOriginal => {
  const real = await importOriginal<typeof import('@/systems/legendary-wonder-presentation')>();
  return {
    ...real,
    getCompactLegendaryWonderEntriesForCity: (...args: Parameters<typeof real.getCompactLegendaryWonderEntriesForCity>) => {
      const [first] = real.getCompactLegendaryWonderEntriesForCity(...args);
      if (!first) return [];
      return [
        { ...first, wonderId: 'crystal-palace', queueItemId: 'legendary:crystal-palace', name: 'Crystal Palace' },
        { ...first, wonderId: 'oracle-of-delphi', queueItemId: 'legendary:oracle-of-delphi', name: 'Oracle of Delphi' },
      ];
    },
  };
});

const callbacks = { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} };

describe('legendary wonder art in the build chooser (#613)', () => {
  it('shows the art on an Era 5-7 wonder card and keeps the shared icon on a wonder without art', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, callbacks);

    const withArt = panel.querySelector<HTMLElement>('[data-wonder-card="crystal-palace"]')!;
    const without = panel.querySelector<HTMLElement>('[data-wonder-card="oracle-of-delphi"]')!;
    expect(withArt.querySelectorAll('img[data-wonder-art="crystal-palace"]')).toHaveLength(1);
    expect(without.querySelector('img')).toBeNull();
    expect(without.textContent).toContain(getProductionIconForItem('legendary:oracle-of-delphi'));
    expect(withArt.textContent).toContain('Crystal Palace');
  });

  it('survives a panel rebuild (the chooser is rebuilt after every interaction)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    createCityPanel(container, city, state, callbacks);
    const again = createCityPanel(container, city, state, callbacks);
    expect(again.querySelectorAll('[data-wonder-card="crystal-palace"] img[data-wonder-art]')).toHaveLength(1);
  });
});
