// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSlotIndex } from '@/ui/dom-slot-index';
import { createCityPanel } from '@/ui/city-panel';
import { TECH_TREE } from '@/systems/tech-definitions';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

afterEach(() => vi.restoreAllMocks());

describe('createSlotIndex', () => {
  it('finds a placeholder by attribute and value, and answers null for one that is not there', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-text="a"></span><span data-text="b"></span><i data-other="a"></i>';
    const slot = createSlotIndex(root);
    expect(slot('data-text', 'b')).toBe(root.querySelector('[data-text="b"]'));
    expect(slot('data-other', 'a')).toBe(root.querySelector('[data-other="a"]'));
    expect(slot('data-text', 'missing')).toBeNull();
    expect(slot('data-never-used', 'a')).toBeNull();
  });

  it('returns the first element in document order when a value repeats, as querySelector does', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-text="x" id="first"></span><span data-text="x" id="second"></span>';
    expect(createSlotIndex(root)('data-text', 'x')?.id).toBe('first');
  });

  it('matches an id attribute the way [id="..."] did', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button id="close-btn"></button>';
    expect(createSlotIndex(root)('id', 'close-btn')).toBe(root.querySelector('[id="close-btn"]'));
  });

  it('handles a value a selector string would choke on', () => {
    const root = document.createElement('div');
    const el = document.createElement('span');
    el.setAttribute('data-text', 'odd"] value');
    root.appendChild(el);
    expect(createSlotIndex(root)('data-text', 'odd"] value')).toBe(el);
  });

  it('is a snapshot of the root when the attribute is first asked for: a later insertion has to be looked up in its own row', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-text="a"></span>';
    const slot = createSlotIndex(root);
    expect(slot('data-text', 'a')).not.toBeNull();
    root.insertAdjacentHTML('beforeend', '<span data-text="late"></span>');
    expect(slot('data-text', 'late')).toBeNull();
  });
});

// #1556 follow-up: the city panel used to run one whole-panel attribute query for every row it filled, so a full catalogue made
// the render (rows x panel size). This pins the shape, not a time: the number of such queries must not grow with the catalogue.
describe('city panel placeholder lookups do not scale with the number of rows', () => {
  const noopCallbacks = { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} };

  function countAttributeQueries(maxEra: number): { queries: number; rows: number } {
    const fixture = makeWonderPanelFixture();
    fixture.state.civilizations.player.techState.completed = TECH_TREE
      .filter(tech => tech.era <= maxEra && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    fixture.city.buildings = [];
    fixture.city.productionQueue = [];
    const original = Element.prototype.querySelector;
    let queries = 0;
    vi.spyOn(Element.prototype, 'querySelector').mockImplementation(function (this: Element, selector: string) {
      if (/^\[(data-[a-z-]+|id)="/.test(selector)) queries++;
      return original.call(this, selector);
    });
    const panel = createCityPanel(fixture.container, fixture.city, fixture.state, noopCallbacks);
    vi.restoreAllMocks();
    return { queries, rows: panel.querySelectorAll('.build-item').length };
  }

  it('runs about as many attribute queries for the whole catalogue as for the early game', () => {
    const early = countAttributeQueries(2);
    const full = countAttributeQueries(Number.POSITIVE_INFINITY);
    // The two renders differ by dozens of rows; a per-row query would add at least one query for each.
    expect(full.rows - early.rows).toBeGreaterThan(30);
    expect(full.queries - early.queries).toBeLessThan(10);
  });
});
