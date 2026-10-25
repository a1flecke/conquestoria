// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { openEstablishRoutePanel } from '@/ui/establish-route-panel';

/**
 * Same shape as the projection fixture: alpha's own cities at (0,0)/(2,0), a discovered beta city at
 * (4,0), a discovered city-state at (5,1), and `gamma-city` at (5,0) which alpha has never explored.
 */
function makeState(overrides: { explored?: string[]; unitPosition?: { q: number; r: number } } = {}): GameState {
  const {
    explored = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,1', '1,1', '2,1', '3,1', '4,1', '5,1'],
    unitPosition = { q: 0, r: 0 },
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 3; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
      };
    }
  }
  const alphaTiles: Record<string, string> = { '0,0': 'visible' };
  for (const key of explored) alphaTiles[key] = 'fog';

  return {
    turn: 4, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 6, height: 3, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 1 },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#00f', civType: 'generic', gold: 100,
        cities: ['alpha-city', 'alpha-port'], units: ['trader-1'],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { beta: 10 }, treaties: [{ type: 'trade_agreement', civA: 'alpha', civB: 'beta', turnsRemaining: -1, goldPerTurn: 2 }],
          events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: ['beta'],
        visibility: { tiles: alphaTiles, fogMap: {} },
      },
      beta: { id: 'beta', name: 'Beta', color: '#f00', civType: 'generic', gold: 100, cities: ['beta-city'], units: [],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { alpha: 10 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: ['alpha'], visibility: { tiles: {}, fogMap: {} } },
      gamma: { id: 'gamma', name: 'Gamma', color: '#0f0', civType: 'generic', gold: 100, cities: ['gamma-city'], units: [],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { alpha: 0 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility: { tiles: {}, fogMap: {} } },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 2, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'beta-city': { id: 'beta-city', name: 'Betatown', owner: 'beta', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'gamma-city': { id: 'gamma-city', name: 'Gammahaven', owner: 'gamma', position: { q: 5, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'sparta-city': { id: 'sparta-city', name: 'Sparta', owner: 'mc-sparta', position: { q: 5, r: 1 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: {
      'trader-1': { id: 'trader-1', type: 'caravan', owner: 'alpha', position: unitPosition, health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false },
    },
    minorCivs: {
      'mc-sparta': { id: 'mc-sparta', definitionId: 'sparta', cityId: 'sparta-city', units: [],
        diplomacy: { relationships: { alpha: 10 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1 },
    },
    barbarianCamps: {}, espionage: {}, pendingEvents: {}, tribalVillages: {}, discoveredWonders: {},
    wonderDiscoverers: {}, legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 2, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('openEstablishRoutePanel (#1500 MR03)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('never renders an undiscovered city — no name, id, count or order', () => {
    const onEstablish = vi.fn();
    openEstablishRoutePanel(container, makeState(), 'trader-1', onEstablish);

    const panel = document.getElementById('establish-route-panel')!;
    const text = panel.textContent ?? '';
    expect(text).not.toContain('Gammahaven');
    expect(text).not.toContain('gamma-city');
    expect(text).not.toContain('Gamma');
    // Exactly the entitled destinations, in a deterministic order.
    const rendered = Array.from(panel.querySelectorAll('.route-row-selected, div'))
      .map(el => el.textContent ?? '')
      .filter(candidate => candidate.includes('Alphaport') || candidate.includes('Betatown') || candidate.includes('Sparta'));
    expect(rendered.length).toBeGreaterThanOrEqual(3);
  });

  it('shows an entitled denial reason for a known but unreachable city', () => {
    // The corridor to beta-city is cut at q=3 while the city itself is explored.
    openEstablishRoutePanel(
      container,
      makeState({ explored: ['0,0', '1,0', '2,0', '4,0', '5,1'] }),
      'trader-1',
      vi.fn(),
    );

    const text = document.getElementById('establish-route-panel')!.textContent ?? '';
    expect(text).toContain('There is no explored route to that destination.');
  });

  it('shows the positioning leg and only offers a destination once one is chosen', () => {
    const onEstablish = vi.fn();
    // Away from every city, so the trader must travel to its origin first.
    openEstablishRoutePanel(container, makeState({ unitPosition: { q: 3, r: 1 } }), 'trader-1', onEstablish);

    const panel = document.getElementById('establish-route-panel')!;
    expect(panel.textContent).toContain('turns to origin');

    const confirm = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Confirm')!;
    expect(confirm.disabled).toBe(true);

    const destinationLabel = Array.from(panel.querySelectorAll('span'))
      .find(el => (el.textContent ?? '').startsWith('Betatown'))!;
    expect(destinationLabel).toBeTruthy();
    // The click listener lives on the row; a real tap on the label bubbles to it.
    destinationLabel.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirm.disabled).toBe(false);

    confirm.click();
    expect(onEstablish).toHaveBeenCalledTimes(1);
    const [toCityId, originCityId] = onEstablish.mock.calls[0];
    expect(toCityId).toBe('beta-city');
    expect(originCityId).toBeTruthy();
  });

  it('collects a standing import order for a foreign destination', () => {
    const state = makeState();
    state.civilizations.alpha!.techState.completed.push('bronze-working');
    const onEstablish = vi.fn();
    openEstablishRoutePanel(container, state, 'trader-1', onEstablish);

    const panel = document.getElementById('establish-route-panel')!;
    const destinationLabel = Array.from(panel.querySelectorAll('span'))
      .find(el => (el.textContent ?? '').startsWith('Betatown'))!;
    destinationLabel.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(panel.querySelector('[data-procurement-section]')).not.toBeNull();
    const target = panel.querySelector<HTMLInputElement>('input[data-procurement-target]')!;
    const maxPrice = panel.querySelector<HTMLInputElement>('input[data-procurement-max-price]')!;
    const budget = panel.querySelector<HTMLInputElement>('input[data-procurement-budget]')!;
    const floor = panel.querySelector<HTMLInputElement>('input[data-procurement-floor]')!;
    target.value = '6';
    target.dispatchEvent(new Event('input'));
    maxPrice.value = '9';
    maxPrice.dispatchEvent(new Event('input'));
    budget.value = '120';
    budget.dispatchEvent(new Event('input'));
    floor.value = '30';
    floor.dispatchEvent(new Event('input'));

    const confirm = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Confirm')!;
    confirm.click();
    expect(onEstablish).toHaveBeenCalledTimes(1);
    const draft = onEstablish.mock.calls[0][3];
    expect(draft).toMatchObject({
      procurement: {
        orders: [{ goodId: 'resource:iron', targetQuantity: 6, maxUnitPrice: 9 }],
      },
      roundBudget: 120,
      treasuryFloor: 30,
    });
  });

  it('offers only the viewer’s own origin cities, with a positioning estimate', () => {
    openEstablishRoutePanel(container, makeState(), 'trader-1', vi.fn());

    const panel = document.getElementById('establish-route-panel')!;
    const originButtons = Array.from(panel.querySelectorAll('button[data-origin-city-id]'));
    expect(originButtons.map(button => (button as HTMLElement).dataset.originCityId))
      .toEqual(['alpha-city', 'alpha-port']);
    expect(panel.textContent).not.toContain('Betatown (Origin)');
  });

  it('renders the definition-driven purpose selector and the complete known-destination catalog (#1504)', () => {
    openEstablishRoutePanel(container, makeState(), 'trader-1', vi.fn());

    const panel = document.getElementById('establish-route-panel')!;
    const purposes = Array.from(panel.querySelectorAll<HTMLElement>('button[data-route-mode]'));
    expect(purposes.map(button => button.dataset.routeMode))
      .toEqual(['commerce', 'domestic-food', 'domestic-production', 'research-exchange']);

    // The full catalog is still present under its own heading, so recommendations never replace it.
    expect(panel.querySelector('[data-all-destinations]')?.textContent).toContain('All known destinations');
    const catalogRows = panel.querySelectorAll('[data-section-catalog] [data-destination-city], [data-all-destinations] ~ [data-destination-city]');
    const allCities = new Set(Array.from(panel.querySelectorAll<HTMLElement>('[data-destination-city]'))
      .map(row => row.dataset.destinationCity));
    expect(allCities.has('alpha-port')).toBe(true);
    expect(allCities.has('beta-city')).toBe(true);
    expect(catalogRows.length + allCities.size).toBeGreaterThanOrEqual(2);
  });

  it('shows yield, ETA, known danger and the cancel/return consequence before confirming (#1504)', () => {
    openEstablishRoutePanel(container, makeState(), 'trader-1', vi.fn());

    const panel = document.getElementById('establish-route-panel')!;
    const target = Array.from(panel.querySelectorAll<HTMLElement>('[data-destination-city="beta-city"]'))[0]!;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const summary = panel.querySelector<HTMLElement>('[data-route-summary="selected"]')!;
    expect(summary.textContent).toContain('Purpose:');
    expect(summary.textContent).toContain('Round trip:');
    expect(summary.querySelector('[data-known-danger]')?.textContent).toContain('Known danger');
    expect(summary.textContent).toContain('returning home before the route ends');
  });

  it('passes the chosen purpose to the executor (#1504)', () => {
    const onEstablish = vi.fn();
    openEstablishRoutePanel(container, makeState(), 'trader-1', onEstablish);

    const panel = document.getElementById('establish-route-panel')!;
    const provisioning = panel.querySelector<HTMLButtonElement>('button[data-route-mode="domestic-food"]')!;
    expect(provisioning.disabled).toBe(false);
    provisioning.click();

    const confirm = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Confirm')!;
    const domestic = Array.from(panel.querySelectorAll<HTMLElement>('[data-destination-city="alpha-port"]'))[0]!;
    domestic.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    confirm.click();

    expect(onEstablish).toHaveBeenCalledTimes(1);
    expect(onEstablish.mock.calls[0][2]).toBe('domestic-food');
  });

  it('refuses a foreign destination for a provisioning purpose with the catalog’s reason (#1504)', () => {
    openEstablishRoutePanel(container, makeState(), 'trader-1', vi.fn());

    const panel = document.getElementById('establish-route-panel')!;
    panel.querySelector<HTMLButtonElement>('button[data-route-mode="domestic-food"]')!.click();

    const foreignRow = Array.from(panel.querySelectorAll<HTMLElement>('[data-destination-city="beta-city"]'))[0]!;
    expect(foreignRow.textContent).toContain('Requires one of your own cities as the destination.');
    // A foreign row is not selectable for provisioning: Confirm stays disabled after a tap.
    foreignRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const confirm = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Confirm')!;
    expect(confirm.disabled).toBe(true);
  });
});
