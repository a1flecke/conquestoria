import { describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is installed for tests but this repo does not ship @types/jsdom.
import { JSDOM } from 'jsdom';
import type { City } from '@/core/types';
import { createCityDistrictsTab } from '@/ui/city-districts';

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'test-city',
    name: 'Test',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 10,
    productionProgress: 0,
    productionQueue: [],
    buildings: [],
    workedTiles: [],
    ownedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
    ...overrides,
  };
}

function withDom<T>(fn: () => T): T {
  const prev = globalThis.document;
  const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/' });
  globalThis.document = dom.window.document;
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}

describe('createCityDistrictsTab', () => {
  it('empty state: shows "No districts yet" message and no district cards', () => {
    withDom(() => {
      const city = makeCity({ buildings: [] });
      const el = createCityDistrictsTab(city);
      expect(el.textContent).toContain('No districts yet');
      expect(el.querySelectorAll('[data-district]').length).toBe(0);
    });
  });

  it('card presence: renders exactly one card per distinct category present in buildings', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['granary', 'library', 'workshop'] });
      const el = createCityDistrictsTab(city);
      // granary=food, library=science, workshop=production => 3 cards
      expect(el.querySelectorAll('[data-district]').length).toBe(3);
    });
  });

  it('no peeking: city with food+science buildings shows no commerce card', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['granary', 'library'] });
      const el = createCityDistrictsTab(city);
      const districtNames = Array.from(el.querySelectorAll('[data-district]')).map(
        el => el.getAttribute('data-district'),
      );
      expect(districtNames).not.toContain('economy');
    });
  });

  it('card ordering: food, military, science renders in spec order (Food first, Academy second, Garrison third)', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['barracks', 'granary', 'library'] });
      const el = createCityDistrictsTab(city);
      const cards = Array.from(el.querySelectorAll('[data-district]')).map(
        el => el.getAttribute('data-district'),
      );
      expect(cards).toEqual(['food', 'science', 'military']);
    });
  });

  it('zero-yield row: Barracks building row shows description text, not a yield string', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['barracks'] });
      const el = createCityDistrictsTab(city);
      const barracksRow = el.querySelector('[data-building-row="barracks"]');
      expect(barracksRow).toBeTruthy();
      const yieldEl = barracksRow!.querySelector('[data-building-yield]');
      expect(yieldEl?.textContent).not.toMatch(/^\+/);
    });
  });

  it('multi-yield header total: district with Harbor (food+gold) shows both yield types in header', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['harbor'] });
      const el = createCityDistrictsTab(city);
      const districtHeader = el.querySelector('[data-district-total]');
      expect(districtHeader).toBeTruthy();
      expect(districtHeader!.textContent).toContain('food');
      expect(districtHeader!.textContent).toContain('gold');
    });
  });

  it('building row order: buildings within a district appear in city.buildings insertion order', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['aqueduct', 'granary', 'herbalist'] });
      const el = createCityDistrictsTab(city);
      const rows = Array.from(el.querySelectorAll('[data-building-row]')).map(
        el => el.getAttribute('data-building-row'),
      );
      expect(rows).toEqual(['aqueduct', 'granary', 'herbalist']);
    });
  });

  it('unknown building ID is skipped silently', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['nonexistent-building', 'granary'] });
      expect(() => createCityDistrictsTab(city)).not.toThrow();
      const el = createCityDistrictsTab(city);
      expect(el.querySelectorAll('[data-district]').length).toBe(1); // only food
    });
  });

  it('single building renders a district card with correct name', () => {
    withDom(() => {
      const city = makeCity({ buildings: ['granary'] });
      const el = createCityDistrictsTab(city);
      const card = el.querySelector('[data-district="food"]');
      expect(card).toBeTruthy();
      expect(card!.textContent).toContain('Food Quarter');
    });
  });

  it('all 7 district categories render when one building of each category is present', () => {
    withDom(() => {
      const city = makeCity({
        buildings: ['granary', 'workshop', 'library', 'marketplace', 'barracks', 'temple', 'safehouse'],
      });
      const el = createCityDistrictsTab(city);
      expect(el.querySelectorAll('[data-district]').length).toBe(7);
    });
  });
});
