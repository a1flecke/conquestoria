// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import type { GameState } from '@/core/types';

function buildMarketState(overrides: Partial<NonNullable<GameState['marketplace']>> = {}): NonNullable<GameState['marketplace']> {
  const prices: Record<string, number> = {};
  const priceHistory: Record<string, number[]> = {};
  const resources = ['silk','wine','spices','gems','ivory','incense','gold','silver','furs','sheep','copper','iron','horses','stone','cattle','salt'];
  for (const r of resources) {
    prices[r] = 5;
    priceHistory[r] = [5];
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

describe('createMarketplacePanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

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

  it('shows ✗ Not available badge when player has tech but no improvement', () => {
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
    expect(panel?.textContent).toContain('✗ Not available');
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

  it('Your Resources empty state mentions tech and improvements', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toMatch(/tech|research/i);
    expect(text).toMatch(/improvement/i);
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
});
