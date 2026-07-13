// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { HexCoord } from '@/core/types';

// Trade Routes Overhaul (#553 MR4/4) — City panel Trade Routes section.

afterEach(() => {
  document.body.innerHTML = '';
});

function baseCallbacks() {
  return {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  };
}

describe('city-panel Trade Routes section', () => {
  it('is not rendered when trade-routes is not researched', () => {
    const { container, city, state } = makeWonderPanelFixture();
    // Fixture's default completedTechs (['philosophy', 'sacred-sites']) does not include trade-routes.

    const panel = createCityPanel(container, city, state, baseCallbacks());

    expect(panel.querySelector('[data-section="trade-routes"]')).toBeNull();
  });

  it('shows the always-visible help text once trade-routes is researched', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]');
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain('Trade routes earn gold every turn.');
  });

  it('shows "No active routes from this city" and capacity 0/1 when the city has no outgoing routes', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] };

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).toContain('No active routes from this city.');
    expect(section.textContent).toContain('Route capacity: 0/1');
  });

  it('prompts to train Caravan for a land-only (non-coastal) city with tech but no idle trade unit', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] };

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).toContain('Train Caravan to start a new route.');
    expect(section.textContent).not.toContain('Naval Trader');
  });

  it('prompts to train Naval Trader (in addition to Caravan) for a coastal city once colonial-trade is researched', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes', 'colonial-trade');
    state.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] };
    // Make city's own tile coastal (city-river sits at 2,2 — neighbor 3,2 becomes ocean).
    const oceanCoord: HexCoord = { q: 3, r: 2 };
    state.map.tiles['3,2'] = {
      coord: oceanCoord, terrain: 'ocean', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).toContain('Naval Trader');
  });

  it('renders active outgoing routes via the shared trade-route-presentation helper, and shows correct capacity usage', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.cities['city-rival'] = { ...state.cities['city-rival'], owner: 'player', name: 'Ostia' } as never;
    (state.cities[city.id] as { name: string }).name = 'Rome';
    state.marketplace = {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: [{ id: 'route-1', fromCityId: city.id, toCityId: 'city-rival', goldPerTrip: 10, turnsPerTrip: 1 }],
    };
    state.units['caravan1'] = {
      id: 'caravan1', type: 'caravan', owner: 'player', position: { ...city.position },
      health: 100, movementPointsLeft: 3, committedToRouteId: 'route-1', tripsRemaining: 5,
    } as never;

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).toContain('Rome → Ostia');
    expect(section.textContent).toContain('5 trips');
    expect(section.textContent).toContain('Route capacity: 1/1');
    expect(section.textContent).not.toContain('No active routes');
  });

  it('clicking a route row with a committed unit calls onSelectUnit with the unit id', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.cities['city-rival'] = { ...state.cities['city-rival'], owner: 'player', name: 'Ostia' } as never;
    (state.cities[city.id] as { name: string }).name = 'Rome';
    state.marketplace = {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: [{ id: 'route-1', fromCityId: city.id, toCityId: 'city-rival', goldPerTrip: 10, turnsPerTrip: 1 }],
    };
    state.units['caravan1'] = {
      id: 'caravan1', type: 'caravan', owner: 'player', position: { ...city.position },
      health: 100, movementPointsLeft: 3, committedToRouteId: 'route-1', tripsRemaining: 5,
    } as never;
    const onSelectUnit = vi.fn();

    const panel = createCityPanel(container, city, state, { ...baseCallbacks(), onSelectUnit });

    const label = Array.from(panel.querySelectorAll('span')).find(el => el.textContent === 'Rome → Ostia');
    expect(label).toBeTruthy();
    label!.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectUnit).toHaveBeenCalledWith('caravan1');
  });

  it('shows an idle trade unit with an Establish Route button, and clicking it calls the same onEstablishRoute callback path used by selected-unit-info', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] };
    state.units['caravan1'] = {
      id: 'caravan1', type: 'caravan', owner: 'player', position: { ...city.position },
      health: 100, movementPointsLeft: 3,
    } as never;
    const onEstablishRoute = vi.fn();

    const panel = createCityPanel(container, city, state, { ...baseCallbacks(), onEstablishRoute });

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).toContain('ready to establish a route');
    const btn = Array.from(section.querySelectorAll('button')).find(b => b.textContent === 'Establish Route');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onEstablishRoute).toHaveBeenCalledWith('caravan1');
  });

  it('does not offer an "Establish Route" button for an idle trade unit that resolves to a different (nearer) city — the panel must stay locally coherent, not empire-wide', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('trade-routes');
    state.marketplace = { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] };
    // Second player-owned city, far from city-river, with its own capacity.
    state.cities['city-far'] = {
      ...structuredClone(city),
      id: 'city-far',
      name: 'Farhaven',
      position: { q: 5, r: 5 },
      buildings: [],
    };
    state.civilizations.player.cities.push('city-far');
    // Idle unit sits exactly on city-far's tile — resolveFromCity resolves it to
    // city-far (path length 1), not city-river (no connected path through the
    // fixture's sparse tile map).
    state.units['caravan1'] = {
      id: 'caravan1', type: 'caravan', owner: 'player', position: { q: 5, r: 5 },
      health: 100, movementPointsLeft: 3,
    } as never;

    const panel = createCityPanel(container, city, state, baseCallbacks());

    const section = panel.querySelector('[data-section="trade-routes"]')!;
    expect(section.textContent).not.toContain('ready to establish a route');
    expect(Array.from(section.querySelectorAll('button')).find(b => b.textContent === 'Establish Route')).toBeUndefined();
    // Falls back to the "train a new unit" prompt since no idle unit resolves here.
    expect(section.textContent).toContain('Train Caravan to start a new route.');
  });

  it('#553 MR4/4 hot-seat regression — a route another civ receives (toCityId) does not show as that civ\'s own outgoing route', () => {
    const { container, city, state } = makeWonderPanelFixture();
    // Player A's city (city-river) sends a route to rival's city (city-rival).
    state.civilizations.player.techState.completed.push('trade-routes');
    state.civilizations.rival.techState.completed.push('trade-routes');
    state.marketplace = {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: [{ id: 'route-1', fromCityId: city.id, toCityId: 'city-rival', goldPerTrip: 10, turnsPerTrip: 1 }],
    };

    // Player A's own panel: city-river is fromCityId — shows the route.
    const panelA = createCityPanel(container, city, state, baseCallbacks());
    const sectionA = panelA.querySelector('[data-section="trade-routes"]')!;
    expect(sectionA.textContent).not.toContain('No active routes from this city.');

    document.body.innerHTML = '';
    const container2 = document.createElement('div');
    document.body.appendChild(container2);

    // Switch current player to rival and render rival's destination city panel — must
    // NOT show the route as its own outgoing route (city-rival is toCityId, not
    // fromCityId).
    state.currentPlayer = 'rival';
    const rivalCity = state.cities['city-rival'];
    const panelB = createCityPanel(container2, rivalCity, state, baseCallbacks());
    const sectionB = panelB.querySelector('[data-section="trade-routes"]')!;
    expect(sectionB.textContent).toContain('No active routes from this city.');
  });
});
