import { describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is installed for tests but this repo does not ship @types/jsdom.
import { JSDOM } from 'jsdom';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { createCityGrid } from '@/ui/city-grid';

describe('city-grid view', () => {
  it('renders the full 7x7 city grid with the city center in the visual center', () => {
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
    globalThis.document = dom.window.document;

    try {
      const map = generateMap(30, 30, 'city-grid-ui-test');
      const city = foundCity('player', { q: 15, r: 15 }, map);
      const container = document.createElement('div');

      const panel = createCityGrid(container, city, map, {
        onSlotTap: () => {},
        onBuyExpansion: () => {},
        onClose: () => {},
      });

      const cells = Array.from(panel.querySelectorAll('.grid-slot, .grid-building, .grid-locked'));
      expect(cells).toHaveLength(49);
      expect((cells[24] as HTMLElement).dataset.building).toBe('city-center');
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
