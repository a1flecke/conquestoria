// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';
import type { City, GameState } from '@/core/types';

interface FixtureCityInput extends Partial<City> {
  id: string;
  owner: string;
}

function makeFixtureState({
  cities = [],
  civGold,
  currentPlayer,
  atWarWith,
}: {
  cities?: FixtureCityInput[];
  civGold?: number;
  currentPlayer?: string;
  atWarWith?: Record<string, string[]>;
} = {}): GameState {
  const base = makeLegendaryWonderFixture();
  const stateCities: Record<string, City> = {};
  const citiesByOwner: Record<string, string[]> = {};

  for (const input of cities) {
    const city: City = {
      id: input.id,
      name: input.name ?? input.id,
      owner: input.owner,
      position: input.position ?? { q: 0, r: 0 },
      population: input.population ?? 4,
      food: 0,
      foodNeeded: 20,
      buildings: input.buildings ?? [],
      productionQueue: [],
      productionProgress: 0,
      ownedTiles: [],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      unrestLevel: input.unrestLevel ?? 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
      appeasedOnTurn: input.appeasedOnTurn,
      concessionImmunityUntilTurn: input.concessionImmunityUntilTurn,
    };
    stateCities[city.id] = city;
    citiesByOwner[city.owner] = [...(citiesByOwner[city.owner] ?? []), city.id];
  }

  const civilizations = { ...base.civilizations };
  const templateCiv = base.civilizations[base.currentPlayer];
  for (const [civId, cityIds] of Object.entries(citiesByOwner)) {
    const existing = civilizations[civId];
    civilizations[civId] = {
      ...(existing ?? templateCiv),
      id: civId,
      name: civId,
      cities: cityIds,
      gold: civGold ?? existing?.gold ?? templateCiv.gold,
      diplomacy: {
        ...(existing ?? templateCiv).diplomacy,
        atWarWith: atWarWith?.[civId] ?? [],
      },
    };
  }

  return {
    ...base,
    currentPlayer: currentPlayer ?? base.currentPlayer,
    cities: stateCities,
    civilizations,
  };
}

describe('city overview panel (#552)', () => {
  it('renders no cities founded yet when the civ owns no cities', () => {
    const state = makeFixtureState({ cities: [] });
    const container = document.createElement('div');
    const callbacks = { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() };
    createCityOverviewPanel(container, state, callbacks);
    expect(container.textContent).toContain('No cities founded yet!');
    expect(container.textContent).not.toContain('Sort:');
  });

  it('lists every owned city and none owned by another civ', () => {
    const state = makeFixtureState({
      cities: [
        { id: 'city-1', owner: 'player', name: 'Alpha' },
        { id: 'city-2', owner: 'player', name: 'Beta' },
        { id: 'city-3', owner: 'enemy', name: 'EnemyCity' },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).not.toContain('EnemyCity');
  });

  it('defaults to sorting cities in unrest/revolt first', () => {
    const state = makeFixtureState({
      cities: [
        { id: 'city-1', owner: 'player', name: 'Stable', unrestLevel: 0 },
        { id: 'city-2', owner: 'player', name: 'Boiling', unrestLevel: 2 },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const rows = Array.from(container.querySelectorAll('[data-city-row]'));
    expect(rows[0].getAttribute('data-city-row')).toBe('city-2');
  });

  it('clicking Appease on an affordable row calls onAppeaseFaction with the row\'s city id, not onOpenCity', () => {
    const state = makeFixtureState({
      cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1, population: 4 }],
      civGold: 1000, // affordable: getCityAppeaseCost = population(4) * 15 = 60
    });
    const container = document.createElement('div');
    const onOpenCity = vi.fn();
    const onAppeaseFaction = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity, onAppeaseFaction, onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const appeaseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.startsWith('Appease')) as HTMLButtonElement;
    expect(appeaseBtn.disabled).toBe(false);
    appeaseBtn.click();
    expect(onAppeaseFaction).toHaveBeenCalledWith('city-1');
    expect(onOpenCity).not.toHaveBeenCalled();
  });

  it('disables the Appease row button (and does not call the callback on click) when unaffordable', () => {
    const state = makeFixtureState({
      cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1, population: 4 }],
      civGold: 5, // cost is 60, well short
    });
    const container = document.createElement('div');
    const onAppeaseFaction = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction, onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const appeaseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Not enough gold')) as HTMLButtonElement;
    expect(appeaseBtn.disabled).toBe(true);
    appeaseBtn.click();
    expect(onAppeaseFaction).not.toHaveBeenCalled();
  });

  it('clicking Concede on an affordable row calls onConcedeToMovement with the row\'s city id, not onOpenCity', () => {
    const state = makeFixtureState({
      cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1, population: 4 }],
      civGold: 1000, // affordable: getConcessionCost = population(4) * 15 * 2 = 120 (no era civics tech in this fixture)
    });
    const container = document.createElement('div');
    const onOpenCity = vi.fn();
    const onConcedeToMovement = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity, onAppeaseFaction: vi.fn(), onConcedeToMovement, onClose: vi.fn() });
    const concedeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.startsWith('Concede')) as HTMLButtonElement;
    expect(concedeBtn.disabled).toBe(false);
    concedeBtn.click();
    expect(onConcedeToMovement).toHaveBeenCalledWith('city-1');
    expect(onOpenCity).not.toHaveBeenCalled();
  });

  it('disables the Concede row button (and does not call the callback on click) when unaffordable', () => {
    const state = makeFixtureState({
      cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1, population: 4 }],
      civGold: 5, // cost is 120, well short
    });
    const container = document.createElement('div');
    const onConcedeToMovement = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement, onClose: vi.fn() });
    const concedeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Not enough gold') && b.title.includes('Concede')) as HTMLButtonElement;
    expect(concedeBtn.disabled).toBe(true);
    concedeBtn.click();
    expect(onConcedeToMovement).not.toHaveBeenCalled();
  });

  it('disables both action buttons and shows no unrest actions once concession-immune', () => {
    const state = makeFixtureState({
      cities: [{
        id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1, population: 4,
        concessionImmunityUntilTurn: 9999,
      }],
      civGold: 1000,
    });
    const container = document.createElement('div');
    const onAppeaseFaction = vi.fn();
    const onConcedeToMovement = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction, onConcedeToMovement, onClose: vi.fn() });
    const buttons = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.startsWith('Appease') || b.textContent?.startsWith('Concede'));
    for (const btn of buttons) {
      expect(btn.disabled).toBe(true);
      btn.click();
    }
    expect(onAppeaseFaction).not.toHaveBeenCalled();
    expect(onConcedeToMovement).not.toHaveBeenCalled();
  });

  it('clicking the row body (not an action button) calls onOpenCity', () => {
    const state = makeFixtureState({ cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 0 }] });
    const container = document.createElement('div');
    const onOpenCity = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity, onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const row = container.querySelector('[data-city-row="city-1"]') as HTMLDivElement;
    row.click();
    expect(onOpenCity).toHaveBeenCalledWith('city-1');
  });
});

describe('city overview panel hot-seat isolation (#552)', () => {
  it('never shows civ B\'s cities when civ A is currentPlayer, and vice versa', () => {
    const stateA = makeFixtureState({
      currentPlayer: 'civ-a',
      cities: [
        { id: 'a-city', owner: 'civ-a', name: 'AlphaCity' },
        { id: 'b-city', owner: 'civ-b', name: 'BetaCity' },
      ],
    });
    const containerA = document.createElement('div');
    createCityOverviewPanel(containerA, stateA, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(containerA.textContent).toContain('AlphaCity');
    expect(containerA.textContent).not.toContain('BetaCity');

    const stateB = { ...stateA, currentPlayer: 'civ-b' };
    const containerB = document.createElement('div');
    createCityOverviewPanel(containerB, stateB, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(containerB.textContent).toContain('BetaCity');
    expect(containerB.textContent).not.toContain('AlphaCity');
  });
});

describe('city overview panel — #919 MR3 top-lever line', () => {
  const cb = () => ({ onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });

  it('an unrest city renders exactly one top-lever line whose copy matches its recommended kind', () => {
    // At war → the War weariness row leads → getTopUnrestLever = make-peace.
    const state = makeFixtureState({
      currentPlayer: 'player',
      atWarWith: { player: ['enemy-1', 'enemy-2'] },
      cities: [
        { id: 'city-1', owner: 'player', name: 'Restless', unrestLevel: 1 },
        { id: 'capital', owner: 'player', name: 'Capital' },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, cb());
    const row = container.querySelector('[data-city-row="city-1"]')!;
    const levers = row.querySelectorAll('[data-top-lever]');
    expect(levers).toHaveLength(1);
    expect(levers[0].getAttribute('data-top-lever')).toBe('make-peace');
    expect(levers[0].getAttribute('data-availability')).toBe('now');
    expect(levers[0].textContent).toMatch(/Make peace/);
    expect(levers[0].textContent).toMatch(/Diplomacy/);
    expect(levers[0].textContent).toMatch(/\b2\b/);
    // The copy carries its own "first"/"later" framing — no extra suffix marker.
    expect(levers[0].textContent).not.toMatch(/research it first/i);
  });

  it('a calm city renders no top-lever line', () => {
    const state = makeFixtureState({
      currentPlayer: 'player',
      cities: [{ id: 'city-1', owner: 'player', name: 'Calm', unrestLevel: 0 }],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, cb());
    expect(container.querySelectorAll('[data-top-lever]')).toHaveLength(0);
  });

  it('the top-lever line is computed for state.currentPlayer (hot-seat: correct when player 2 is active)', () => {
    const state = makeFixtureState({
      currentPlayer: 'player-2',
      atWarWith: { 'player-2': ['x'] },
      cities: [
        { id: 'p2-city', owner: 'player-2', name: 'P2City', unrestLevel: 1 },
        { id: 'p2-cap', owner: 'player-2', name: 'P2Cap' },
        { id: 'p1-city', owner: 'player', name: 'P1City', unrestLevel: 1 },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, cb());
    expect(container.querySelector('[data-city-row="p1-city"]')).toBeNull();
    const lever = container.querySelector('[data-city-row="p2-city"] [data-top-lever]');
    expect(lever).not.toBeNull();
    expect(lever!.textContent!.length).toBeGreaterThan(0);
  });

  it('renders the line as a plain text node (no child elements from interpolation)', () => {
    const state = makeFixtureState({
      currentPlayer: 'player',
      atWarWith: { player: ['e'] },
      cities: [
        { id: 'city-1', owner: 'player', name: 'Restless', unrestLevel: 1 },
        { id: 'capital', owner: 'player', name: 'Capital' },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, cb());
    const lever = container.querySelector('[data-top-lever]')!;
    expect(lever.children).toHaveLength(0);
  });
});
