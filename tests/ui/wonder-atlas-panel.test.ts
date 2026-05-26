// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';

function click(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-atlas-ui-test');
  for (const tile of Object.values(state.map.tiles)) {
    tile.wonder = null;
  }
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = {};
  state.wonderDiscoverers = {};
  state.currentPlayer = 'player';
  return state;
}

describe('wonder-atlas-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
  });

  it('keeps createWonderAtlasPanel as the public entry point for the codex shell', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.id).toBe('wonder-codex-panel');
    expect(document.querySelector('#wonder-codex-panel')).toBeTruthy();
    expect(document.body.textContent).toContain('Wonder Codex');
    expect(document.body.textContent).toContain('Great Volcano');
  });

  it('does not reveal undiscovered natural wonders through the catalog or reader', () => {
    const panel = createWonderAtlasPanel(document.body, makeState(), {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-codex-entry-id="great_volcano"]')).toBeNull();
    expect(panel.textContent).not.toContain('The Great Volcano');
    expect(panel.textContent).toContain('Legendary wonder');
  });

  it('selects a discovered natural wonder and renders sourced codex detail', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    click(panel.querySelector('[data-codex-entry-id="great_volcano"]'));

    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Great Volcano');
    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Q0, R0');
    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('USGS / public domain');
    expect(panel.querySelector('img')?.getAttribute('src')).toBe('/images/wonders/codex/volcano.jpg');
  });

  it('calls View on map for a discovered wonder with a coordinate', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];
    const onViewOnMap = vi.fn();

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap,
      onClose: () => {},
    });
    click(panel.querySelector('[data-codex-entry-id="great_volcano"]'));
    click(panel.querySelector('[data-codex-action="view-map"]'));

    expect(onViewOnMap).toHaveBeenCalledWith({ q: 0, r: 0 }, 'great_volcano');
  });

  it('omits View on map when the discovered coordinate is unavailable', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = null;
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      initialWonderId: 'great_volcano',
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-codex-action="view-map"]')).toBeNull();
    expect(panel.textContent).toContain('Location unknown');
  });

  it('renders safe legendary codex entries without exposing rival progress', () => {
    const state = makeState();
    state.legendaryWonderProjects = {
      'oracle-of-delphi:player:city-river': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 40,
        transferableProduction: 0,
        questSteps: [],
      },
      'grand-canal:rival:rival-city': {
        wonderId: 'grand-canal',
        ownerId: 'ai-1',
        cityId: 'rival-city',
        phase: 'building',
        investedProduction: 90,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });
    click(panel.querySelector('[data-codex-entry-id="oracle-of-delphi"]'));

    expect(panel.textContent).toContain('Under construction');
    expect(panel.textContent).not.toContain('rival-city');
    expect(panel.textContent).not.toContain('90');
  });

  it('uses a static vignette when reduced motion is requested', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      initialWonderId: 'great_volcano',
      onViewOnMap: () => {},
      onClose: () => {},
      reducedMotion: true,
    });

    expect(panel.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
  });

  it('refreshes visibility when reopened for a different current player', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });
    expect(document.body.textContent).not.toContain('Great Volcano');

    state.currentPlayer = 'ai-1';
    createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(document.querySelectorAll('#wonder-codex-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Great Volcano');
  });
});
