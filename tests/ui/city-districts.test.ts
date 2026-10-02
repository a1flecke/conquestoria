import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error jsdom is installed for tests but this repo does not ship @types/jsdom.
import { JSDOM } from 'jsdom';
import type { City } from '@/core/types';
import { createCityDistrictsTab, resetUnknownBuildingDiagnostics } from '@/ui/city-districts';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-production-presentation';

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

  it('unknown building ID is safe, shown generically, and reported once (#614)', () => {
    resetUnknownBuildingDiagnostics();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      withDom(() => {
        const city = makeCity({ buildings: ['nonexistent-building', 'granary'] });
        expect(() => createCityDistrictsTab(city)).not.toThrow();
        const el = createCityDistrictsTab(city);
        expect(el.querySelectorAll('[data-district]').length).toBe(1); // only food
        const row = el.querySelector('[data-building-row="nonexistent-building"]');
        expect(row, 'unknown id must stay visible, not vanish').toBeTruthy();
        expect(row!.querySelector('[data-building-icon]')!.textContent).toBe(PRODUCTION_ICON_FALLBACK);
        expect(row!.textContent).toContain('nonexistent-building');
      });
      // two renders -> one diagnostic (not spammy)
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('nonexistent-building');
    } finally {
      warn.mockRestore();
    }
  });

  it('a city holding only unknown buildings still renders them instead of the empty state', () => {
    withDom(() => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const el = createCityDistrictsTab(makeCity({ buildings: ['mystery'] }));
      warn.mockRestore();
      expect(el.textContent).not.toContain('No districts yet');
      expect(el.querySelector('[data-unknown-building]')).toBeTruthy();
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

  describe('building icons come from the canonical production presentation (#614)', () => {
    const iconOf = (id: string): string =>
      withDom(() => {
        const el = createCityDistrictsTab(makeCity({ buildings: [id] }));
        return el.querySelector(`[data-building-row="${id}"] [data-building-icon]`)!.textContent!;
      });

    it('every catalog building shows its own non-generic icon (derived from BUILDINGS, so additions fail loudly)', () => {
      const ids = Object.keys(BUILDINGS);
      expect(ids.length).toBeGreaterThan(100); // non-vacuous
      for (const id of ids) {
        const icon = iconOf(id);
        expect(icon, `${id} fell back to the generic icon`).not.toBe(PRODUCTION_ICON_FALLBACK);
        expect(icon).toBe(PRODUCTION_ICONS[id]);
      }
    });

    it('covers an early, an Era 9 and an Era 12 building', () => {
      expect(iconOf('granary')).toBe(PRODUCTION_ICONS.granary);
      expect(iconOf('oil_refinery')).toBe(PRODUCTION_ICONS.oil_refinery);
      expect(iconOf('data_center')).toBe(PRODUCTION_ICONS.data_center);
    });

    it('covers national projects (they are buildings in this catalog)', () => {
      const projects = Object.values(BUILDINGS).filter(b => b.nationalProject);
      expect(projects.length).toBeGreaterThan(10);
      for (const p of projects) expect(iconOf(p.id)).not.toBe(PRODUCTION_ICON_FALLBACK);
    });
  });
});
