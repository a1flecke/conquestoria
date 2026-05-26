// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createWonderCodexPanel } from '@/ui/wonder-codex-panel';

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
});
