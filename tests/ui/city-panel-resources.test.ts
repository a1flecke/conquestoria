// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';
import type { GameState } from '@/core/types';

beforeEach(() => {
  document.body.innerHTML = '<div id="panel-root"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

const noopCallbacks = {
  onBuild: () => {},
  onOpenWonderPanel: () => {},
  onClose: () => {},
};

/**
 * Returns a state with a silk tile (happiness luxury) owned by player.
 * Silk requires 'irrigation' tech + 'plantation' improvement.
 */
function makeStateWithSilk(): GameState {
  const state = makeLegendaryWonderFixture({ completedTechs: ['irrigation', 'philosophy', 'sacred-sites'] });
  // city-river city owns tiles at (2,2) and (2,3). Add silk at (2,3).
  state.map.tiles['2,3'] = {
    coord: { q: 2, r: 3 },
    terrain: 'grassland',
    elevation: 'lowland',
    resource: 'silk' as never,
    improvement: 'plantation' as never,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    owner: 'player',
  };
  return state;
}

/**
 * Returns a state with a gems tile (gold/turn yield luxury) owned by player.
 * Gems requires 'mining-tech' tech + 'mine' improvement.
 */
function makeStateWithGems(): GameState {
  const state = makeLegendaryWonderFixture({ completedTechs: ['mining-tech', 'philosophy', 'sacred-sites'] });
  state.map.tiles['2,3'] = {
    coord: { q: 2, r: 3 },
    terrain: 'hills',
    elevation: 'highland',
    resource: 'gems' as never,
    improvement: 'mine' as never,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    owner: 'player',
  };
  return state;
}

/**
 * Returns a state with a gold resource tile owned by player.
 * Gold requires 'currency' tech + 'mine' improvement.
 */
function makeStateWithGoldResource(): GameState {
  const state = makeLegendaryWonderFixture({ completedTechs: ['currency', 'philosophy', 'sacred-sites'] });
  state.map.tiles['2,3'] = {
    coord: { q: 2, r: 3 },
    terrain: 'hills',
    elevation: 'highland',
    resource: 'gold' as never,
    improvement: 'mine' as never,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    owner: 'player',
  };
  return state;
}

/**
 * Returns a state with no resources on player tiles.
 */
function makeStateNoResources(): GameState {
  return makeLegendaryWonderFixture({ completedTechs: ['philosophy', 'sacred-sites'] });
}

describe('city panel resource bonus section', () => {
  it('labels optional resource discounts as Faster with rather than Required', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['steam-power', 'philosophy', 'sacred-sites'] });
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);

    expect(container.textContent).toContain('Faster with: Coal');
    expect(container.textContent).not.toContain('Required: Coal');
  });

  it('test 21: silk owned → "Empire bonuses" header and "Silk" text with "+1 happiness"', () => {
    const state = makeStateWithSilk();
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('Empire bonuses');
    expect(text).toContain('Silk');
    expect(text).toContain('+1 happiness');
  });

  it('test 22: gems owned → "City bonuses" header and "Gems" with "+1 gold/turn"', () => {
    const state = makeStateWithGems();
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('City bonuses');
    expect(text).toContain('Gems');
    expect(text).toContain('+1 gold/turn');
  });

  it('test 23: gold resource shows "Gold deposits" not bare "Gold"', () => {
    const state = makeStateWithGoldResource();
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).toContain('Gold deposits');
    expect(text).toContain('+1 gold/turn');
  });

  it('test 24: only yield resources (gems, no silk) → "Empire bonuses" header absent', () => {
    const state = makeStateWithGems();
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Empire bonuses');
    expect(text).toContain('City bonuses');
  });

  it('test 25: no resources → entire "Resources" section absent', () => {
    const state = makeStateNoResources();
    const city = state.cities['city-river'];
    const container = document.getElementById('panel-root')!;
    createCityPanel(container, city, state, noopCallbacks);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Empire bonuses');
    expect(text).not.toContain('City bonuses');
    expect(text).not.toContain('+1 happiness');
  });
});
