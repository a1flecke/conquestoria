// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createWonderCodexPanel } from '@/ui/wonder-codex-panel';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

function click(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-codex-panel-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = { great_volcano: 'player' };
  state.wonderDiscoverers = { great_volcano: ['player'] };
  state.currentPlayer = 'player';
  return state;
}

describe('wonder-codex-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders desktop rich reader with catalog drawer by default', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.id).toBe('wonder-codex-panel');
    expect(panel.querySelector('[data-codex-catalog]')).toBeTruthy();
    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Great Volcano');
    expect(panel.textContent).toContain('The Great Volcano');
  });

  it('starts mobile catalog-first without a deep link', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'mobile',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.querySelector('[data-codex-catalog]')).toBeTruthy();
    expect(panel.querySelector('[data-codex-reader]')).toBeNull();
  });

  it('opens mobile reader directly with a safe deep link', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'mobile',
      initialWonderId: 'great_volcano',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Great Volcano');
    expect(panel.querySelector('[data-codex-catalog-back]')).toBeTruthy();
  });

  it('selects every visible catalog item and updates the reader', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    const entries = [...panel.querySelectorAll<HTMLElement>('[data-codex-entry-id]')];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const id = entry.dataset.codexEntryId!;
      click(entry);
      expect(panel.querySelector('[data-codex-reader] [data-codex-page]')?.getAttribute('data-codex-page')).toBe(id);
    }
  });

  it('emits map and close actions', () => {
    const onViewOnMap = vi.fn();
    const onClose = vi.fn();
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap,
      onOpenCity: vi.fn(),
      onClose,
    });

    click(panel.querySelector('[data-codex-action="view-map"]'));
    expect(onViewOnMap).toHaveBeenCalledWith({ q: 0, r: 0 }, 'great_volcano');

    click(panel.querySelector('[data-codex-close]'));
    expect(onClose).toHaveBeenCalled();
    expect(document.querySelector('#wonder-codex-panel')).toBeNull();
  });

  it('starts and stops natural wonder ambience as visible Codex pages change', () => {
    const onNaturalWonderPageShown = vi.fn();
    const onNaturalWonderPageHidden = vi.fn();
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      initialWonderId: 'great_volcano',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
      onNaturalWonderPageShown,
      onNaturalWonderPageHidden,
    });

    expect(onNaturalWonderPageShown).toHaveBeenCalledWith('great_volcano');

    click(panel.querySelector('[data-codex-close]'));

    expect(onNaturalWonderPageHidden).toHaveBeenCalledWith('great_volcano');
  });

  it('stops mobile natural wonder ambience when returning to the catalog', () => {
    const onNaturalWonderPageShown = vi.fn();
    const onNaturalWonderPageHidden = vi.fn();
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'mobile',
      initialWonderId: 'great_volcano',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
      onNaturalWonderPageShown,
      onNaturalWonderPageHidden,
    });

    click(panel.querySelector('[data-codex-catalog-back]'));

    expect(onNaturalWonderPageShown).toHaveBeenCalledWith('great_volcano');
    expect(onNaturalWonderPageHidden).toHaveBeenCalledWith('great_volcano');
  });

  it('catalog entry buttons have card-style background', () => {
    const state = makeLegendaryWonderFixture();
    state.currentPlayer = 'player';

    const container = document.createElement('div');
    document.body.appendChild(container);
    createWonderCodexPanel(container, state, {
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    const entryBtn = container.querySelector('[data-codex-entry-id="oracle-of-delphi"]') as HTMLElement | null;
    expect(entryBtn).not.toBeNull();
    expect(entryBtn?.style.background).toBeTruthy();
    container.remove();
  });
});

describe('wonder-codex-panel — rival intel catalog badge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function stateWithStartedIntelFor(viewerId: string): GameState {
    const state = makeLegendaryWonderFixture();
    state.currentPlayer = viewerId;
    state.legendaryWonderIntel = {
      [viewerId]: [{
        kind: 'started',
        eventId: 'started:oracle-of-delphi:ai-1:rival-city:12',
        projectKey: 'oracle-of-delphi:ai-1:rival-city',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rome',
        cityId: 'rival-city',
        cityName: 'Rome City',
        revealedTurn: 12,
      }],
    };
    return state;
  }

  it('shows rival intel badge on the catalog entry for the current viewer when they have intel', () => {
    const state = stateWithStartedIntelFor('player');
    const panel = createWonderCodexPanel(document.body, state, {
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    const entryBtn = panel.querySelector('[data-codex-entry-id="oracle-of-delphi"]');
    expect(entryBtn).not.toBeNull();
    expect(entryBtn?.querySelector('[data-rival-intel-badge]')).not.toBeNull();
    expect(entryBtn?.querySelector('[data-rival-intel-badge]')?.textContent).toContain('Known rival activity');
  });

  it('does not show rival intel badge when the current viewer has no intel for that wonder', () => {
    const state = makeLegendaryWonderFixture();
    state.currentPlayer = 'player';
    // no legendaryWonderIntel set

    const panel = createWonderCodexPanel(document.body, state, {
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    const entryBtn = panel.querySelector('[data-codex-entry-id="oracle-of-delphi"]');
    expect(entryBtn?.querySelector('[data-rival-intel-badge]')).toBeNull();
  });

  it('rival intel badge is keyed to currentPlayer — player-2 sees no badge when only player has intel', () => {
    const playerState = stateWithStartedIntelFor('player');

    // Same game state but now rendered for player-2 (who has no intel)
    const player2State = { ...playerState, currentPlayer: 'player-2' };

    const panel = createWonderCodexPanel(document.body, player2State, {
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    // oracle-of-delphi is not visible to player-2 (they have no project and no intel)
    // so the entry shouldn't appear in their catalog at all
    const entryBtn = panel.querySelector('[data-codex-entry-id="oracle-of-delphi"]');
    if (entryBtn) {
      // If somehow visible, the badge must not show player's intel
      expect(entryBtn.querySelector('[data-rival-intel-badge]')).toBeNull();
    }
    // Confirm player-2's catalog does not bleed player's intel into any entry
    expect(panel.querySelectorAll('[data-rival-intel-badge]')).toHaveLength(0);
  });
});
