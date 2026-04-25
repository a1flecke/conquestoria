// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { hexKey } from '@/systems/hex-utils';
import { collectText, makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { City } from '@/core/types';

function activeCityGrid(container: HTMLElement): HTMLElement {
  const panel = container.querySelector<HTMLElement>('[id="city-panel"]');
  expect(panel).toBeTruthy();
  const gridView = panel!.querySelector<HTMLElement>('[id="city-grid-view"]');
  expect(gridView).toBeTruthy();
  expect(gridView!.style.display).toBe('block');
  return gridView!;
}

function clickElement(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

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

describe('city-panel navigation', () => {
  function makeMultiCityFixture() {
    const { container, city, state } = makeWonderPanelFixture();
    const city2: City = {
      ...city,
      id: 'city-2',
      name: 'SecondCity',
    };
    state.cities['city-2'] = city2;
    state.civilizations[state.currentPlayer].cities = [city.id, 'city-2'];
    return { container, city, city2, state };
  }

  it('renders prev and next buttons when onPrevCity and onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('city-prev');
    expect(html).toContain('city-next');
  });

  it('does not render nav buttons when no onPrevCity/onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).not.toContain('city-prev');
    expect(html).not.toContain('city-next');
  });

  it('calls onPrevCity when prev button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onPrev = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: onPrev,
      onNextCity: () => {},
    });
    clickElement(panel.querySelector('[id="city-prev"]'));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onNextCity when next button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onNext = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: onNext,
    });
    clickElement(panel.querySelector('[id="city-next"]'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows ETA text for buildable units and buildings', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('turns');
  });

  it('shows focused yield estimates before the next turn assigns worked tiles', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 1;
    city.focus = 'production';
    city.workedTiles = [];
    city.ownedTiles = [city.position, { q: 2, r: 3 }];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('data-text="yield-food">2');
    expect(rendered).toContain('data-text="yield-prod">2');
    expect(rendered).toContain('data-text="yield-gold">2');
  });

  it('shows occupied-city integration countdown', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 7 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Occupied');
    expect(rendered).toContain('7 turns');
  });

  it('shows occupation-reduced yields and build eta', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 4;
    city.buildings = ['granary'];
    city.productionQueue = ['library'];
    city.productionProgress = 0;
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Very Unhappy');
    expect(rendered).toContain('turns remaining');
  });

  it('renders production queue rows with move and remove controls', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine', 'worker'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Queue');
    expect(rendered).toContain('data-queue-action="remove"');
  });

  it('renders Overview, Buildings/Core, and Worked Land And Water sections in the Grid tab', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.focus = 'balanced';
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-grid"]'));
    const rendered = collectText(panel);
    expect(rendered).toContain('Overview');
    expect(rendered).toContain('Buildings/Core');
    expect(rendered).toContain('Worked Land And Water');
    expect(rendered).toContain('Worked 1/');
    expect(rendered).toContain('Balanced focus');
  });

  it('shows surplus unassigned citizens when population exceeds available worked tiles', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.population = 4;
    city.ownedTiles = [city.position];
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-grid"]'));
    expect(collectText(panel)).toContain('Unassigned citizens: 4');
  });

  it('shows farm and water worked-land rows with yields', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const farm = { q: city.position.q + 1, r: city.position.r };
    const coast = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(farm)] = {
      ...state.map.tiles[hexKey(farm)],
      coord: farm,
      terrain: 'grassland',
      elevation: 'lowland',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(coast)] = {
      ...state.map.tiles[hexKey(coast)],
      coord: coast,
      terrain: 'coast',
      elevation: 'lowland',
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, farm, coast];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-grid"]'));
    const rendered = collectText(panel);
    expect(rendered).toContain('Farm');
    expect(rendered).toContain('Water work: fishing/trapping');
  });

  it('shows claimed overlap tiles as unavailable', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const claimed = { q: city.position.q + 1, r: city.position.r };
    const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
    state.cities[otherCity.id] = otherCity;
    state.map.tiles[hexKey(claimed)] = {
      ...state.map.tiles[hexKey(claimed)],
      coord: claimed,
      terrain: 'grassland',
      elevation: 'lowland',
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, claimed];
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-grid"]'));
    expect(collectText(panel)).toContain('Worked by Corinth');
    expect(panel.querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]')?.disabled).toBe(true);
  });

  it('renders focused projected worked tiles consistently with Overview yields', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const foodTile = { q: city.position.q + 1, r: city.position.r };
    const productionTile = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(foodTile)] = {
      ...state.map.tiles[hexKey(foodTile)],
      coord: foodTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(productionTile)] = {
      ...state.map.tiles[hexKey(productionTile)],
      coord: productionTile,
      terrain: 'hills',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'food';
    city.workedTiles = [];
    city.ownedTiles = [city.position, foodTile, productionTile];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-grid"]'));
    const rendered = collectText(activeCityGrid(container));
    expect(rendered).toContain('Food focus');
    expect(rendered).toContain('Worked 1/1 citizens');
    expect(rendered).toContain('Grassland · +2 food · Working');
    expect(rendered).not.toContain('Unassigned citizens: 1');
  });

  it('clicking a focus button keeps Grid open and rerenders visible focus and yields from returned state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    let renderState = state;
    const onSetCityFocus = vi.fn((cityId, focus) => {
      const result = assignCityFocus(renderState, cityId, focus);
      renderState = result.state;
      return renderState;
    });
    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus,
      onToggleWorkedTile: () => {},
    });

    clickElement(container.querySelector('[id="tab-grid"]'));
    clickElement(activeCityGrid(container).querySelector('[data-city-focus="food"]'));

    expect(onSetCityFocus).toHaveBeenCalledWith(city.id, 'food');
    const gridView = activeCityGrid(container);
    expect(collectText(gridView)).toContain('Food focus');
    expect(collectText(gridView)).toContain('Worked Land And Water');
  });

  it('working, unworking, and reworking a tile keeps Grid open and updates visible state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const target = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(target)] = {
      ...state.map.tiles[hexKey(target)],
      coord: target,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'custom';
    city.workedTiles = [];
    city.ownedTiles = [city.position, target];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });
    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-grid"]'));
    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="work"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, true);
    expect(collectText(activeCityGrid(container))).toContain('Custom focus');
    expect(collectText(activeCityGrid(container))).toContain('Working');

    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="unwork"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, false);
    expect(collectText(activeCityGrid(container))).toContain('Available');

    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="work"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, true);
    expect(collectText(activeCityGrid(container))).toContain('Working');

    clickElement(container.querySelector('[id="tab-list"]'));
    clickElement(container.querySelector('[id="tab-grid"]'));
    expect(collectText(activeCityGrid(container))).toContain('Working');
  });

  it('disables extra Work buttons when every citizen is already assigned', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const workedTile = { q: city.position.q + 1, r: city.position.r };
    const spareTile = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(workedTile)] = {
      ...state.map.tiles[hexKey(workedTile)],
      coord: workedTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(spareTile)] = {
      ...state.map.tiles[hexKey(spareTile)],
      coord: spareTile,
      terrain: 'hills',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'custom';
    city.workedTiles = [workedTile];
    city.ownedTiles = [city.position, workedTile, spareTile];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });

    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => renderState,
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-grid"]'));
    const gridView = activeCityGrid(container);
    const disabledWork = gridView.querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]');
    expect(disabledWork).toBeTruthy();
    expect(disabledWork!.disabled).toBe(true);
    expect(collectText(gridView)).toContain('No open citizen');

    disabledWork!.click();
    expect(onToggleWorkedTile).not.toHaveBeenCalled();
    expect(renderState.cities[city.id].workedTiles).toEqual([workedTile]);
  });

  it('leaves claimed worked-land tiles disabled and unchanged when clicked', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const claimed = { q: city.position.q + 1, r: city.position.r };
    const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
    state.cities[otherCity.id] = otherCity;
    state.map.tiles[hexKey(claimed)] = {
      ...state.map.tiles[hexKey(claimed)],
      coord: claimed,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, claimed];
    city.workedTiles = [];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });

    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => renderState,
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-grid"]'));
    const disabledWork = activeCityGrid(container).querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]');

    expect(collectText(activeCityGrid(container))).toContain('Worked by Corinth');
    expect(disabledWork?.disabled).toBe(true);
    disabledWork?.click();
    expect(onToggleWorkedTile).not.toHaveBeenCalled();
    expect(renderState.cities[city.id].workedTiles).toEqual([]);
  });
});
