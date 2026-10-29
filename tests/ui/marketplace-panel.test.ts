// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import type { ReserveLedger } from '@/core/types/commerce';
import type { GameState } from '@/core/types';

function buildMarketState(overrides: Partial<NonNullable<GameState['marketplace']>> = {}): NonNullable<GameState['marketplace']> {
  const prices: Record<string, number> = {};
  const priceHistory: Record<string, number[]> = {};
  // Derived from RESOURCE_DEFINITIONS so new resources are automatically included
  for (const r of RESOURCE_DEFINITIONS) {
    prices[r.id] = 5;
    priceHistory[r.id] = [5];
  }
  return { prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], ...overrides };
}

function buildState(params: {
  currentPlayer: string;
  civTechs?: string[];
  civCities?: string[];
  cities?: Record<string, unknown>;
  tiles?: Record<string, unknown>;
}): GameState {
  return {
    currentPlayer: params.currentPlayer,
    marketplace: buildMarketState(),
    civilizations: {
      [params.currentPlayer]: {
        id: params.currentPlayer,
        cities: params.civCities ?? ['city1'],
        techState: {
          completed: params.civTechs ?? [],
          currentResearch: null,
          researchQueue: [],
          researchProgress: 0,
          trackPriorities: {},
        },
      },
    },
    cities: params.cities ?? {
      city1: {
        id: 'city1',
        owner: params.currentPlayer,
        position: { q: 0, r: 0 },
        ownedTiles: [],
        workedTiles: [],
      },
    },
    map: {
      tiles: params.tiles ?? {},
      width: 10,
      height: 10,
      wrapsHorizontally: false,
      rivers: [],
    },
  } as unknown as GameState;
}

// All unique techs needed to unlock all resources — derived from the catalog so it
// stays in sync automatically when new resources are added to RESOURCE_DEFINITIONS.
const ALL_RESOURCE_TECHS = [...new Set(RESOURCE_DEFINITIONS.map(d => d.tech))];

describe('createMarketplacePanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Existing behaviour ────────────────────────────────────────────────────

  it('shows ✓ Owned badge when player has tech + completed improvement for a resource', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech'],
      civCities: ['city1'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'mine',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✓ Owned');
  });

  // Updated: label changed from "✗ Not available" → "✗ Not in inventory"
  it('shows ✗ Not in inventory badge when player has tech but no improvement', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✗ Not in inventory');
    expect(panel?.textContent).not.toContain('✗ Not available');
  });

  it('Your Resources section lists owned resources by type', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech', 'foraging'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'mine',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
        '2,0': {
          coord: { q: 2, r: 0 },
          terrain: 'forest',
          elevation: 'lowland',
          resource: 'ivory',
          improvement: 'camp',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toContain('Gems');
    expect(text).toContain('Ivory');
  });

  // Updated: empty state now shows "None" instead of tech/improvement advice
  it('Your Resources empty state shows "None" when no resources are owned', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toContain('None');
    expect(text).not.toContain('research techs');
    expect(text).not.toContain('build improvements');
  });

  it('uses state.currentPlayer — never hardcoded civ id', () => {
    // Open panel as 'civ2', not 'p1'
    const state = buildState({
      currentPlayer: 'civ2',
      civTechs: ['mining-tech'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'civ2',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'mine',
          improvementTurnsLeft: 0,
          owner: 'civ2',
          hasRiver: false,
          wonder: null,
        },
      },
    });

    // 'p1' data doesn't exist — if panel hardcodes 'player' or 'p1', this would crash or show wrong data
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✓ Owned');
  });

  // ── S3: Row filtering ─────────────────────────────────────────────────────

  it('hides all resource rows when viewer has no techs', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    const allNames = RESOURCE_DEFINITIONS.map(d => d.name);
    for (const name of allNames) {
      expect(text).not.toContain(name);
    }
  });

  it('shows tech-known resource and hides tech-unknown resource', () => {
    // 'mining-tech' unlocks gems + silver; 'irrigation' (not researched) unlocks silk
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('Gems');
    expect(text).not.toContain('Silk');
  });

  it('shows all resource names when viewer has all enabling techs (catalog completeness)', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ALL_RESOURCE_TECHS });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    for (const def of RESOURCE_DEFINITIONS) {
      expect(text).toContain(def.name);
    }
  });

  it('hot-seat: two players see only their own tech-known resources', () => {
    // player1 has irrigation (silk); player2 has mining-tech (gems)
    // We open once per player and verify isolation
    const mkState = (player: string, techs: string[]): GameState => ({
      currentPlayer: player,
      marketplace: buildMarketState(),
      civilizations: {
        [player]: {
          id: player,
          cities: ['city1'],
          techState: {
            completed: techs,
            currentResearch: null,
            researchQueue: [],
            researchProgress: 0,
            trackPriorities: {},
          },
        },
      },
      cities: {
        city1: {
          id: 'city1',
          owner: player,
          position: { q: 0, r: 0 },
          ownedTiles: [],
          workedTiles: [],
        },
      },
      map: { tiles: {}, width: 10, height: 10, wrapsHorizontally: false, rivers: [] },
    } as unknown as GameState);

    // Player 1 sees silk, not gems
    createMarketplacePanel(container, mkState('p1', ['irrigation']), { onClose: vi.fn() });
    const text1 = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text1).toContain('Silk');
    expect(text1).not.toContain('Gems');
    document.getElementById('marketplace-panel')?.remove();

    // Player 2 sees gems, not silk
    createMarketplacePanel(container, mkState('p2', ['mining-tech']), { onClose: vi.fn() });
    const text2 = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text2).toContain('Gems');
    expect(text2).not.toContain('Silk');
  });

  // ── S3: Label change ──────────────────────────────────────────────────────

  it('shows "✗ Not in inventory" (not "✗ Not available") for tech-known but unowned resource', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
      },
    });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('✗ Not in inventory');
    expect(text).not.toContain('✗ Not available');
  });

  // ── S3: Empty state ───────────────────────────────────────────────────────

  it('Your Resources shows "None" when viewer has a tech but owns nothing', () => {
    // Has mining-tech so gems/silver rows are visible, but no mine built
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('Your Resources');
    expect(panel?.textContent).toContain('None');
  });

  // ── No global price/fashion advertising (#1498) ───────────────────────────

  it('never advertises a global fashion cycle, even when the viewer knows the fashionable resource', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['irrigation'] }); // irrigation → silk known
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionable = 'silk';
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionTurnsLeft = 5;

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).not.toContain('fashionable');
    expect(text).not.toContain('prices doubled');
  });

  it('never advertises global market prices, trends, or sparklines', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ALL_RESOURCE_TECHS });

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const panel = document.getElementById('marketplace-panel');

    expect(panel?.querySelector('[data-text^="res-price-"]')).toBeNull();
    expect(panel?.textContent).not.toContain('💰');
    expect(panel?.textContent).not.toContain('▁'); // sparkline glyph
  });

  // ── S3: Discoverable footer ───────────────────────────────────────────────

  it('shows discoverable footer when viewer is missing some resource techs', () => {
    // 'mining-tech' unlocks gems + silver (2 of 16); 14 remain hidden
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('more resources');
    expect(text).toContain('research');
  });

  it('footer count is correct: 20 hidden when viewer has only mining-tech (unlocks 2 of 22)', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('20 more resources');
  });

  it('resource type badge shows capitalized label (Luxury / Strategic, not luxury / strategic)', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech', 'animal-husbandry'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    // gems/silver are luxury; horses is strategic — all from different techs
    expect(text).toContain('Luxury');
    expect(text).toContain('Strategic');
    expect(text).not.toContain('luxury');
    expect(text).not.toContain('strategic');
  });

  it('Your Resources lists strategic resources alongside luxury resources', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech', 'bronze-working'],
      cities: {
        city1: {
          id: 'city1',
          owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'hills',
          elevation: 'highland',
          resource: 'gems',
          improvement: 'mine',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
        '2,0': {
          coord: { q: 2, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: 'iron',
          improvement: 'mine',
          improvementTurnsLeft: 0,
          owner: 'p1',
          hasRiver: false,
          wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toContain('Gems');
    expect(text).toContain('Iron');
    // Strategic section should show the iron entry
    expect(text).toContain('Strategic (1)');
    expect(text).toContain('Luxury (1)');
  });

  it('omits discoverable footer when viewer has all 16 enabling techs', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ALL_RESOURCE_TECHS });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).not.toContain('more resources');
  });

  // ── Available from Known Civs section ─────────────────────────────────────
  // Two-civ state: 'p1' has trade-routes + bronze-working; 'enemy' has iron
  // (iron: tech='bronze-working', basePrice=8, mine, cost = 3×8 = 24)
  function buildStateWithKnownCiv(params: {
    playerTechs?: string[];
    playerGold?: number;
    knownCivHasResource?: boolean;
    atWar?: boolean;
    relationshipScore?: number;
    playerAlreadyOwns?: boolean;
  } = {}): GameState {
    const {
      playerTechs = ['bronze-working', 'trade-routes'],
      playerGold = 100,
      knownCivHasResource = true,
      atWar = false,
      relationshipScore = 10,
      playerAlreadyOwns = false,
    } = params;

    const ironTile: Record<string, unknown> = knownCivHasResource ? {
      '5,5': {
        coord: { q: 5, r: 5 }, terrain: 'hills', elevation: 'lowland',
        resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'enemy',
      },
    } : {};

    return {
      turn: 5,
      currentPlayer: 'p1',
      marketplace: buildMarketState(),
      map: {
        tiles: {
          '0,0': {
            coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
            resource: null, improvement: 'none', improvementTurnsLeft: 0,
            hasRiver: false, wonder: null, owner: 'p1',
          },
          ...ironTile,
        },
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
      },
      cities: {
        'p1-city': {
          id: 'p1-city', owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: playerAlreadyOwns ? [{ q: 5, r: 5 }] : [{ q: 0, r: 0 }],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
        'enemy-city': {
          id: 'enemy-city', owner: 'enemy',
          position: { q: 5, r: 5 },
          ownedTiles: knownCivHasResource ? [{ q: 5, r: 5 }] : [],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        p1: {
          id: 'p1',
          cities: ['p1-city'], units: [], gold: playerGold,
          techState: { completed: playerTechs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: {
            relationships: { enemy: relationshipScore },
            treaties: [], events: [],
            atWarWith: atWar ? ['enemy'] : [],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
          },
          civType: 'egypt',
        } as unknown as never,
        enemy: {
          id: 'enemy',
          cities: ['enemy-city'], units: [], gold: 0,
          techState: { completed: ['bronze-working'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: {
            relationships: {},
            treaties: [], events: [],
            atWarWith: atWar ? ['p1'] : [],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
          },
          civType: 'rome',
        } as unknown as never,
      },
    } as unknown as GameState;
  }

  describe('the retired instant market leaves no panel affordance (#1516)', () => {
    it('shows no containment notice for a viewer with known civilizations', () => {
      const state = buildStateWithKnownCiv();
      createMarketplacePanel(container, state, { onClose: vi.fn() });

      expect(container.querySelector('[data-section="resource-imports-rebuilding"]')).toBeNull();
    });

    it('shows no containment notice even for a viewer with no known civilizations', () => {
      const state = buildState({ currentPlayer: 'p1', civTechs: [] });
      createMarketplacePanel(container, state, { onClose: vi.fn() });

      expect(container.querySelector('[data-section="resource-imports-rebuilding"]')).toBeNull();
    });

    it('renders no purchase control and no seller rows even when every old buy condition holds', () => {
      // Widest-open fixture: gold 100, trade-routes researched, a peaceful known seller with iron.
      const state = buildStateWithKnownCiv();
      createMarketplacePanel(container, state, { onClose: vi.fn() });

      const panel = document.getElementById('marketplace-panel')!;
      // The close control is the panel's only button, so no purchase affordance survives anywhere.
      expect(Array.from(panel.querySelectorAll('button')).map(button => button.id)).toEqual(['mp-close']);
      expect(panel.querySelector('[data-buy-resource-btn]')).toBeNull();
      expect(container.querySelector('[data-section="known-civs"]')).toBeNull();
      expect(panel.textContent).not.toContain('Available from Known Civilizations');
      expect(panel.textContent).not.toContain('Buy');
      expect(panel.textContent).not.toContain('10 turns');
    });
  });

  // Trade Routes Overhaul (#553 MR4/4) — extraction regression: buildPlayerRouteListSection
  // was extracted from an inline function into trade-route-presentation.ts so the City
  // panel could reuse it. This proves the Marketplace panel still renders identically
  // through the shared helper, not a frozen inline copy.
  describe('route list (shared with city-panel via trade-route-presentation.ts)', () => {
    function buildStateWithRoute(): GameState {
      const state = buildState({
        currentPlayer: 'p1',
        civTechs: ['trade-routes'],
        cities: {
          city1: { id: 'city1', name: 'Rome', owner: 'p1', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [] },
          city2: { id: 'city2', name: 'Ostia', owner: 'p1', position: { q: 2, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [] },
        },
      });
      state.marketplace!.tradeRoutes = [
        { id: 'route-1', fromCityId: 'city1', toCityId: 'city2', goldPerTrip: 10, turnsPerTrip: 1 },
      ];
      (state as unknown as { units: Record<string, unknown> }).units = {
        caravan1: { id: 'caravan1', type: 'caravan', owner: 'p1', committedToRouteId: 'route-1', routeDirection: 'outbound' },
      };
      (state.civilizations.p1 as unknown as { diplomacy: { relationships: Record<string, unknown> } }).diplomacy = { relationships: {} };
      return state;
    }

    it('shows the "Active Trade Routes" heading and the route row for city1 → city2', () => {
      const state = buildStateWithRoute();
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      const panel = document.getElementById('marketplace-panel');
      expect(panel?.textContent).toContain('Active Trade Routes');
      expect(panel?.textContent).toContain('Rome → Ostia');
      expect(panel?.textContent).toContain('round trip 2 rounds');
    });

    it('clicking a route row with a committed unit calls onSelectUnit with the unit id', () => {
      const state = buildStateWithRoute();
      const onSelectUnit = vi.fn();
      createMarketplacePanel(container, state, { onClose: vi.fn(), onSelectUnit });
      const panel = document.getElementById('marketplace-panel')!;
      const label = Array.from(panel.querySelectorAll('span, button')).find(el => el.textContent === 'Rome → Ostia');
      expect(label).toBeTruthy();
      const row = label!.parentElement!;
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSelectUnit).toHaveBeenCalledWith('caravan1');
    });

    it('the route row also has a keyboard-reachable button that selects the unit exactly once (#1459)', () => {
      const state = buildStateWithRoute();
      const onSelectUnit = vi.fn();
      createMarketplacePanel(container, state, { onClose: vi.fn(), onSelectUnit });
      const button = document.querySelector<HTMLButtonElement>('#marketplace-panel button[aria-label="Select the trade unit on Rome → Ostia"]');
      expect(button).toBeTruthy();
      button!.click();
      expect(onSelectUnit).toHaveBeenCalledTimes(1);
      expect(onSelectUnit).toHaveBeenCalledWith('caravan1');
    });
  });

  it('presents the finished overview as Trade & Supply with Routes, Supplies and Policies (#1504)', () => {
    createMarketplacePanel(container, buildState({ currentPlayer: 'p1' }), { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Trade & Supply');

    const routes = panel.querySelector('[data-section="trade-supply-routes"]');
    const supplies = panel.querySelector('[data-section="trade-supply-supplies"]');
    const policies = panel.querySelector('[data-section="trade-supply-policies"]');
    expect(routes?.textContent).toContain('Routes');
    expect(routes?.textContent).toContain('Active Trade Routes');
    expect(supplies?.textContent).toContain('Supplies');
    expect(policies?.textContent).toContain('Seller policies');

    // With no stored goods revealed, the policy section explains the empty state and offers no
    // unfinished control.
    expect(policies?.querySelectorAll('button').length).toBe(0);
    expect(policies?.textContent).toContain('No stored goods');

    // Supplies exposes no purchase control at this stage (the chooser and route controls live in Routes).
    expect(supplies?.querySelectorAll('button').length).toBe(0);
  });
});

describe('createMarketplacePanel material reserves (#1506 MR09)', () => {
  const iron = resourceGoodId('iron');
  const copper = resourceGoodId('copper');

  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function ironState(balances: ReserveLedger['balances'], extra: Partial<ReserveLedger> = {}): GameState {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['bronze-working', 'stone-weapons'],
      cities: {
        city1: {
          id: 'city1', owner: 'p1', position: { q: 0, r: 0 },
          ownedTiles: [{ q: 0, r: 0 }], workedTiles: [],
        },
      },
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 }, terrain: 'hills', elevation: 'highland',
          resource: 'iron', improvement: 'none', improvementTurnsLeft: 0,
          owner: 'p1', hasRiver: false, wonder: null,
        },
      },
    });
    state.materialReservesByCiv = {
      p1: { balances, reservations: [], incoming: [], lastAccruedTurn: -1, ...extra },
    };
    return state;
  }

  it('edits the good-keyed protected reserve and partner grant through the live policy section', () => {
    const state = ironState({ [iron]: { native: 14, imported: 0 } });
    state.civilizations.p2 = {
      ...state.civilizations.p1!,
      id: 'p2',
      cities: ['p2city'],
      diplomacy: {
        relationships: { p1: 10 },
        treaties: [{ type: 'trade_agreement', civA: 'p2', civB: 'p1', turnsRemaining: -1 }],
        events: [],
        atWarWith: [],
        treacheryScore: 0,
        vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
      },
    } as never;
    state.cities.p2city = {
      ...state.cities.city1!,
      id: 'p2city',
      owner: 'p2',
    };
    state.commercePermissions = {
      resourceExportGrants: [],
      routeAllowances: [],
      resourcePolicies: [{ civId: 'p1', goodId: iron, protectedReserve: 2, partnerCivIds: ['p2'] }],
    };
    const onSetResourcePolicy = vi.fn();
    createMarketplacePanel(container, state, { onClose: vi.fn(), onSetResourcePolicy });

    const row = document.querySelector<HTMLElement>('[data-policy-good="resource:iron"]');
    expect(row).not.toBeNull();
    const reserve = row!.querySelector<HTMLInputElement>('input[data-policy-reserve]')!;
    expect(reserve.value).toBe('2');
    const partner = row!.querySelector<HTMLInputElement>('input[data-policy-partner="p2"]')!;
    expect(partner.checked).toBe(true);

    reserve.value = '5';
    partner.checked = false;
    row!.querySelector<HTMLButtonElement>('button[data-policy-save]')!.click();
    expect(onSetResourcePolicy).toHaveBeenCalledWith({
      civId: 'p1',
      goodId: iron,
      protectedReserve: 5,
      partnerCivIds: [],
    });
  });

  it('shows delivered luxury coverage and edits bounded service allotments', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['cartography'] });
    state.turn = 10;
    state.civilizations.p2 = {
      ...state.civilizations.p1!,
      id: 'p2',
      cities: ['p2city'],
      diplomacy: {
        relationships: { p1: 10 },
        treaties: [{ type: 'trade_agreement', civA: 'p2', civB: 'p1', turnsRemaining: -1 }],
        events: [],
        atWarWith: [],
        treacheryScore: 0,
        vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
      },
    } as never;
    state.cities.p2city = { ...state.cities.city1!, id: 'p2city', owner: 'p2' };
    state.commercePermissions = {
      resourceExportGrants: [],
      routeAllowances: [],
      resourcePolicies: [{
        civId: 'p1',
        goodId: resourceGoodId('spices'),
        protectedReserve: 0,
        partnerCivIds: ['p2'],
        serviceAllotments: 2,
      }],
    };
    state.luxuryServiceByCiv = {
      p1: {
        coverageByGood: {
          [resourceGoodId('spices')]: {
            goodId: resourceGoodId('spices'),
            expiresOnTurn: state.turn + 3,
            supplierCivIds: ['p2'],
          },
        },
      },
    };
    const onSetResourcePolicy = vi.fn();
    createMarketplacePanel(container, state, { onClose: vi.fn(), onSetResourcePolicy });

    const panel = document.getElementById('marketplace-panel')!;
    expect(panel.textContent).toContain(`Delivered coverage until turn ${state.turn + 3}`);
    const row = panel.querySelector<HTMLElement>('[data-policy-good="resource:spices"]')!;
    const service = row.querySelector<HTMLInputElement>('input[data-policy-service]')!;
    expect(service.value).toBe('2');
    service.value = '3';
    row.querySelector<HTMLButtonElement>('button[data-policy-save]')!.click();
    expect(onSetResourcePolicy).toHaveBeenCalledWith(expect.objectContaining({
      civId: 'p1',
      goodId: resourceGoodId('spices'),
      serviceAllotments: 3,
    }));
  });

  it('shows fuel runway and exposes the national conservation posture', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['steam-power'],
      cities: {
        city1: {
          id: 'city1', owner: 'p1', position: { q: 0, r: 0 },
          ownedTiles: [{ q: 0, r: 0 }], workedTiles: [], buildings: ['factory'],
          productionQueue: [], productionProgress: 0,
        },
      },
    });
    state.materialReservesByCiv = {
      p1: {
        balances: { [resourceGoodId('coal')]: { native: 3, imported: 0 } },
        reservations: [],
        incoming: [],
        lastAccruedTurn: -1,
      },
    };
    const onSetFuelConservation = vi.fn();
    createMarketplacePanel(container, state, { onClose: vi.fn(), onSetFuelConservation });

    const panel = document.getElementById('marketplace-panel')!;
    expect(panel.textContent).toContain('Fuel demand 1/round');
    expect(panel.textContent).toContain('runway 3');
    const conserve = panel.querySelector<HTMLButtonElement>('[data-fuel-policy="conserve"]')!;
    conserve.click();
    expect(onSetFuelConservation).toHaveBeenCalledWith('conserve');
  });

  it('replaces the inventory boolean with exact stored/committed/free/incoming counts', () => {
    const state = ironState(
      { [iron]: { native: 14, imported: 0 } },
      {
        reservations: [{
          id: 'city1:1:swordsman:resource:iron',
          goodId: iron,
          ownerCivId: 'p1',
          amount: 10,
          reason: 'active-production',
          allocation: { native: 10, imported: 0 },
          consumer: { ownerCivId: 'p1', cityId: 'city1', occurrence: 1, itemId: 'swordsman' },
        }],
      },
    );
    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const row = document.querySelector<HTMLElement>('[data-reserve-good="resource:iron"]');
    expect(row).not.toBeNull();
    const text = row!.textContent ?? '';
    expect(text).toContain('14/40 units stored');
    expect(text).toContain('10 committed');
    expect(text).toContain('4 free');
    expect(text).toContain('0 incoming');
    expect(text).toContain('+2 units/round');
    expect(text).toContain('1 source');
    expect(text).not.toContain('Not in inventory');
  });

  it('labels migration assistance and storage capping separately from free stock', () => {
    const state = ironState(
      { [iron]: { native: 39, imported: 0 }, [copper]: { native: 0, imported: 8 } },
      {
        reservations: [{
          id: 'migration:grant',
          goodId: copper,
          ownerCivId: 'p1',
          amount: 8,
          reason: 'migration-grant',
          allocation: { native: 0, imported: 8 },
          consumer: { ownerCivId: 'p1', cityId: 'city1', occurrence: 1, itemId: 'swordsman' },
          migrationGrantImported: 8,
        }],
      },
    );
    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const ironText = document.querySelector<HTMLElement>('[data-reserve-good="resource:iron"]')!.textContent ?? '';
    expect(ironText).toContain('Storage capped');
    expect(ironText).toContain('1 unit');

    const copperText = document.querySelector<HTMLElement>('[data-reserve-good="resource:copper"]')!.textContent ?? '';
    expect(copperText).toContain('8 migration assistance');
    expect(copperText).toContain('restricted');
  });
});

