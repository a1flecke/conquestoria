// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GameState } from '@/core/types';
import { createMarketplacePanel } from '@/ui/marketplace-panel';

beforeEach(() => { document.body.innerHTML = '<div id="mp-root"></div>'; });
afterEach(() => { document.body.innerHTML = ''; });

function makeMarketState(options: { knowsSilk?: boolean; knowsIron?: boolean } = {}): GameState {
  const completed: string[] = [];
  if (options.knowsSilk) completed.push('irrigation');
  if (options.knowsIron) completed.push('bronze-working');

  return {
    turn: 1, era: 2, currentPlayer: 'player',
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    cities: {},
    civilizations: {
      'player': {
        id: 'player', civType: 'rome', name: 'Rome',
        cities: [], units: [], gold: 0,
        techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], events: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, tributeAmount: 0, peakCities: 1, peakMilitary: 0 } },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {},
    marketplace: {
      prices: { silk: 8, iron: 8 },
      priceHistory: { silk: [8], iron: [8] },
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
    },
  } as unknown as GameState;
}

describe('marketplace panel effect badges', () => {
  it('test 28: silk row contains "+1 happiness" badge', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState({ knowsSilk: true });
    createMarketplacePanel(container, state, { onClose: () => {} });
    expect(container.textContent).toContain('+1 happiness');
  });

  it('test 29: iron row contains "unlocks advanced units" hint, not literal "null"', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState({ knowsIron: true });
    createMarketplacePanel(container, state, { onClose: () => {} });
    const text = container.textContent ?? '';
    expect(text).toContain('unlocks advanced units');
    expect(text).not.toContain('null');
  });

  it('gems row contains "+1 gold/turn" badge when gems tech known', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState();
    // Inject mining-tech so gems row appears
    (state.civilizations['player'].techState.completed as string[]).push('mining-tech');
    (state.marketplace!.prices as Record<string, number>)['gems'] = 12;
    (state.marketplace!.priceHistory as Record<string, number[]>)['gems'] = [12];
    createMarketplacePanel(container, state, { onClose: () => {} });
    expect(container.textContent).toContain('+1 gold/turn');
  });

  it('cattle row contains "+1 food/turn" badge when domestication known', () => {
    const container = document.getElementById('mp-root')!;
    const state = makeMarketState();
    (state.civilizations['player'].techState.completed as string[]).push('domestication');
    (state.marketplace!.prices as Record<string, number>)['cattle'] = 5;
    (state.marketplace!.priceHistory as Record<string, number[]>)['cattle'] = [5];
    createMarketplacePanel(container, state, { onClose: () => {} });
    expect(container.textContent).toContain('+1 food/turn');
  });
});
