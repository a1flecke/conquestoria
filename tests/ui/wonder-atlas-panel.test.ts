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
    const onNaturalWonderPageShown = vi.fn();

    const panel = createWonderAtlasPanel(document.body, state, {
      onViewOnMap: () => {},
      onClose: () => {},
      onNaturalWonderPageShown,
    });

    expect(panel.id).toBe('wonder-codex-panel');
    expect(document.querySelector('#wonder-codex-panel')).toBeTruthy();
    expect(document.body.textContent).toContain('Wonder Codex');
    expect(document.body.textContent).toContain('Great Volcano');
    expect(onNaturalWonderPageShown).toHaveBeenCalledWith('great_volcano');
  });

  it('does not reveal undiscovered natural wonders through the catalog or reader', () => {
    const panel = createWonderAtlasPanel(document.body, makeState(), {
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-codex-entry-id="great_volcano"]')).toBeNull();
    expect(panel.querySelector('[data-codex-replay-animation]')).toBeNull();
    expect(panel.textContent).not.toContain('The Great Volcano');
    expect(panel.textContent).not.toContain('Replay animation');
    expect(panel.textContent).not.toContain('volcanic-breath');
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
    expect(panel.querySelector('[data-wonder-video-view]')).toBeTruthy();
    expect(panel.querySelector('video source')?.getAttribute('src')).toBe('/videos/wonders/great-volcano-tonga-eruption.mp4');
    panel.querySelector('video')?.dispatchEvent(new Event('error'));
    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('USGS / public domain');
    expect(panel.querySelector('[data-wonder-video-view] img')?.getAttribute('src')).toBe('/images/wonders/codex/volcano.jpg');
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

  it('renders rival activity badge and journal for the current viewer only', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
          projectKey: 'oracle-of-delphi:ai-1:rival-city',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
      ],
      'player-2': [
        {
          kind: 'completed',
          eventId: 'completed:grand-canal:ai-1:58',
          wonderId: 'grand-canal',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    const panel = createWonderAtlasPanel(document.body, state, {
      initialWonderId: 'oracle-of-delphi',
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-rival-intel-badge]')?.textContent).toContain('Known rival activity');
    expect(panel.querySelector('[data-rival-intel-section]')?.textContent).toContain('Spotted rival project');
    expect(panel.querySelector('[data-rival-intel-section]')?.textContent).toContain('Rival Harbor');
    expect(panel.textContent).not.toContain('Grand Canal on turn 58');
    expect(panel.querySelector('[data-codex-action="open-city"]')).toBeNull();
    expect(panel.querySelector('[data-codex-action="view-map"]')).toBeNull();
  });

  it('rerenders rival intel when reopened for a different hot-seat viewer', () => {
    const state = makeState();
    state.civilizations['player-2'] = {
      ...state.civilizations.player,
      id: 'player-2',
      name: 'Second Player',
      isHuman: true,
      cities: [],
      units: [],
    };
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
          projectKey: 'oracle-of-delphi:ai-1:rival-city',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
      ],
      'player-2': [
        {
          kind: 'completed',
          eventId: 'completed:grand-canal:ai-1:58',
          wonderId: 'grand-canal',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    createWonderAtlasPanel(document.body, state, {
      initialWonderId: 'oracle-of-delphi',
      onViewOnMap: () => {},
      onClose: () => {},
    });
    expect(document.body.textContent).toContain('Rival Harbor');

    state.currentPlayer = 'player-2';
    createWonderAtlasPanel(document.body, state, {
      initialWonderId: 'grand-canal',
      onViewOnMap: () => {},
      onClose: () => {},
    });

    expect(document.querySelectorAll('#wonder-codex-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Rival completed Grand Canal on turn 58');
    expect(document.body.textContent).not.toContain('Rival Harbor');
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
