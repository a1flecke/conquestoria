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

  it('renders a useful empty Known Natural state without fake unknown wonder cards', () => {
    const state = makeState();

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.id).toBe('wonder-atlas-panel');
    expect(panel.textContent).toContain('No natural wonders discovered yet.');
    expect(panel.textContent).not.toContain('Great Volcano');
    expect(panel.querySelectorAll('[data-wonder-kind="natural"]')).toHaveLength(0);
  });

  it('selects a discovered natural wonder and updates the vignette immediately', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    click(panel.querySelector('[data-wonder-entry="great_volcano"]'));

    expect(panel.querySelector('[data-wonder-detail]')?.textContent).toContain('Great Volcano');
    expect(panel.querySelector('[data-wonder-detail]')?.textContent).toContain('Q0, R0');
    expect(panel.querySelector('[data-wonder-detail]')?.textContent).toContain('Yields');
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
    click(panel.querySelector('[data-wonder-entry="great_volcano"]'));
    click(panel.querySelector('[data-view-wonder-on-map="great_volcano"]'));

    expect(onViewOnMap).toHaveBeenCalledWith({ q: 0, r: 0 }, 'great_volcano');
  });

  it('omits View on map when the discovered coordinate is unavailable', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = null;
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });
    click(panel.querySelector('[data-wonder-entry="great_volcano"]'));

    expect(panel.querySelector('[data-view-wonder-on-map="great_volcano"]')).toBeNull();
    expect(panel.textContent).toContain('Location unknown');
  });

  it('renders legendary wonders as masked slots only', () => {
    const state = makeState();

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
    });
    click(panel.querySelector('[data-atlas-tab="legendary"]'));

    expect(panel.querySelectorAll('[data-wonder-kind="legendary"]').length).toBeGreaterThan(0);
    expect(panel.textContent).toContain('Legendary wonder');
    expect(panel.textContent).not.toContain('Start Construction');
  });

  it('uses a static vignette when reduced motion is requested', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
      reducedMotion: true,
    });
    click(panel.querySelector('[data-wonder-entry="great_volcano"]'));

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

    expect(document.querySelectorAll('#wonder-atlas-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Great Volcano');
  });
});
