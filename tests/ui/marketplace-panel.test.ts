// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
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

  // ── S3: Fashion banner ────────────────────────────────────────────────────

  it('suppresses fashion banner when fashionable resource tech is unknown to viewer', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] }); // no irrigation → silk unknown
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionable = 'silk';
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionTurnsLeft = 5;

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    // "fashionable" only appears in the banner
    expect(text).not.toContain('fashionable');
  });

  it('shows fashion banner with display name (not raw id) when tech is known', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['irrigation'] }); // irrigation → silk known
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionable = 'silk';
    (state.marketplace as NonNullable<typeof state.marketplace>).fashionTurnsLeft = 5;

    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    // "Silk is fashionable" proves both the banner appeared AND the display name (not raw id) was used
    expect(text).toContain('Silk is fashionable');
  });

  it('fashion banner absent when marketplace.fashionable is null', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ALL_RESOURCE_TECHS });
    // fashionable defaults to null in buildMarketState
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).not.toContain('fashionable');
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

  it('footer count is correct: 14 hidden when viewer has only mining-tech (unlocks 2 of 16)', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: ['mining-tech'] });
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const text = document.getElementById('marketplace-panel')?.textContent ?? '';
    expect(text).toContain('14 more resources');
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
});
