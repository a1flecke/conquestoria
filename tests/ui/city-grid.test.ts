import { describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is installed for tests but this repo does not ship @types/jsdom.
import { JSDOM } from 'jsdom';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import type { GameState } from '@/core/types';
import { createCityWorkSection } from '@/ui/city-grid';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('createCityWorkSection', () => {
  it('renders worked-land section without throwing', () => {
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
    globalThis.document = dom.window.document;

    try {
      const map = generateMap(30, 30, 'city-work-section-test');
      const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
      const state = { cities: { [city.id]: city }, map } as unknown as GameState;

      const panel = createCityWorkSection(city, map, {
        state,
        onSetCityFocus: () => {},
        onToggleWorkedTile: () => {},
      });

      expect(panel).toBeTruthy();
      expect(panel.id).toBe('city-grid');
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
