// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { showTurnHandoff } from '@/ui/turn-handoff';

function makeFixture() {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob the Very Patient Cartographer', slotId: 'player-2', civType: 'rome', isHuman: true },
    ],
  }, 'handoff-fixture');
  const shell = document.createElement('div');
  shell.id = 'game-shell';
  const layer = document.createElement('div');
  shell.appendChild(layer);
  document.body.appendChild(shell);
  return { state, shell, layer };
}

afterEach(() => document.body.replaceChildren());

describe('turn handoff', () => {
  it('is opaque and blocked until setReady supplies the completed state', async () => {
    const { state, shell, layer } = makeFixture();
    const onReady = vi.fn();
    const controller = showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: false,
      preparingLabel: 'Preparing next turn…',
      onReady,
    });
    const confirm = document.querySelector<HTMLButtonElement>('#handoff-confirm')!;

    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe('Preparing next turn…');
    expect(document.querySelector<HTMLElement>('#turn-handoff')?.style.backgroundColor).toBe('rgb(10, 10, 30)');
    expect(shell.inert).toBe(true);
    expect(shell.getAttribute('aria-hidden')).toBe('true');

    const updated = structuredClone(state);
    updated.turn = 9;
    updated.civilizations['player-2'].gold = 321;
    controller.setReady(updated);
    confirm.click();
    expect(document.body.textContent).toContain('Turn 9');
    expect(document.body.textContent).toContain('321');

    document.querySelector<HTMLButtonElement>('#handoff-start')!.click();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ turn: 9 })));
    expect(shell.inert).toBe(false);
    expect(shell.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps errors opaque and exposes retry and return controls', () => {
    const { state, layer } = makeFixture();
    const onRetry = vi.fn();
    const onReturnToSaves = vi.fn();
    const controller = showTurnHandoff(layer, state, 'player-2', 'Bob', {
      initiallyReady: false,
      onReady: vi.fn(),
    });

    controller.setError('The round could not be completed.', { onRetry, onReturnToSaves });
    document.querySelector<HTMLButtonElement>('[data-action="retry-handoff"]')!.click();
    expect(onRetry).toHaveBeenCalledOnce();
    document.querySelector<HTMLButtonElement>('[data-action="return-to-saves"]')!.click();
    expect(onReturnToSaves).toHaveBeenCalledOnce();
    expect(document.querySelector('#turn-handoff')).toBeNull();
  });

  it('uses bounded scrollable layout and touch-sized controls for phone and laptop viewports', () => {
    const { state, layer } = makeFixture();
    showTurnHandoff(layer, state, 'player-2', 'Bob the Very Patient Cartographer', {
      initiallyReady: true,
      onReady: vi.fn(),
    });
    const card = document.querySelector<HTMLElement>('[data-handoff-card]')!;
    const confirm = document.querySelector<HTMLButtonElement>('#handoff-confirm')!;

    expect(card.style.width).toBe('100%');
    expect(card.style.maxWidth).toBe('520px');
    expect(card.style.maxHeight).toBe('min(90dvh, 720px)');
    expect(card.style.overflowY).toBe('auto');
    expect(card.style.overflowX).toBe('hidden');
    expect(confirm.style.minHeight).toBe('44px');
    expect(document.querySelector('#turn-handoff style')?.textContent).toContain('safe-area-inset');
  });
});
