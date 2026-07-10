/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { createDefaultSettings } from '@/core/game-state';
import * as saveManager from '@/storage/save-manager';

let storedSettings = createDefaultSettings('small');

function click(selector: string): void {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function advanceThroughMapType(): void {
  click('#hs-map-type-next');
  click('#hs-challenge-next');
}

beforeEach(() => {
  document.body.innerHTML = '';
  storedSettings = createDefaultSettings('small');
  vi.restoreAllMocks();
  vi.spyOn(saveManager, 'loadSettings').mockImplementation(async () => storedSettings);
  vi.spyOn(saveManager, 'saveSettings').mockImplementation(async (settings) => {
    storedSettings = settings;
  });
});

describe('hotseat-setup per-player challenge picker', () => {
  it("changing a player row's challenge selector sets that civ's challenge only", () => {
    const onComplete = vi.fn();
    showHotSeatSetup(document.body, { onComplete, onCancel: vi.fn() });

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');

    // Player 1 picks a civ, then their personal difficulty selector appears
    click('.civ-card[data-civ-id="egypt"]');
    click('#civ-start');
    expect(document.querySelector('[data-opponent-challenge-selector="new-game"]')).not.toBeNull();
    click('[data-challenge="explorer"]');
    expect(document.querySelector('[data-challenge="explorer"]')?.getAttribute('aria-pressed')).toBe('true');
    click('#hs-personal-challenge-next');

    // Player 2 passes to civ pick, chooses civ, leaves their own difficulty at default (standard)
    click('#hs-civ-ready');
    click('.civ-card[data-civ-id="rome"]');
    click('#civ-start');
    click('#hs-personal-challenge-next');
    click('#hs-review-start');

    const config = onComplete.mock.calls[0]![0];
    const player1 = config.players.find((p: { slotId: string }) => p.slotId === 'player-1');
    const player2 = config.players.find((p: { slotId: string }) => p.slotId === 'player-2');
    expect(player1.challenge).toBe('explorer');
    expect(player2.challenge).toBe('standard');
  });
});
