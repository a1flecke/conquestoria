// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { showLegacyOpponentChallengePrompt } from '@/ui/legacy-opponent-challenge-prompt';

describe('legacy opponent challenge prompt', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('requires an explicit legacy choice and preserves selection across retry', async () => {
    const onContinue = vi.fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(undefined);
    const panel = showLegacyOpponentChallengePrompt(document.body, {
      hotSeat: true,
      onContinue,
      onCancel: vi.fn(),
    });
    const continueButton = panel.querySelector<HTMLButtonElement>('[data-action="continue"]')!;

    expect(continueButton.disabled).toBe(true);
    panel.querySelector<HTMLButtonElement>('[data-challenge="explorer"]')!.click();
    expect(continueButton.disabled).toBe(false);
    continueButton.click();
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(continueButton.textContent).toBe('Saving…');
    await vi.waitFor(() => expect(panel.textContent).toContain('Could not save your choice'));
    expect(panel.querySelector('[data-challenge="explorer"]')?.getAttribute('aria-pressed')).toBe('true');
    continueButton.click();
    await vi.waitFor(() => expect(onContinue).toHaveBeenCalledTimes(2));
    expect(onContinue).toHaveBeenNthCalledWith(1, 'explorer');
    expect(onContinue).toHaveBeenNthCalledWith(2, 'explorer');
  });

  it('renders a labelled, scroll-safe dialog with the hot-seat fairness sentence', () => {
    const panel = showLegacyOpponentChallengePrompt(document.body, {
      hotSeat: true,
      onContinue: vi.fn(),
      onCancel: vi.fn(),
    });
    const dialog = panel.querySelector<HTMLElement>('[data-legacy-challenge-dialog]')!;

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe('legacy-opponent-challenge-title');
    expect(document.activeElement).toBe(panel.querySelector('#legacy-opponent-challenge-title'));
    expect(panel.textContent).toContain('Choose Opponent Challenge');
    expect(panel.textContent).toContain(
      'This campaign was created before opponent difficulty was added. Choose how computer rivals and roaming threats should behave.',
    );
    expect(panel.textContent).toContain('Combat rules and bonuses remain the same.');
    expect(panel.textContent).toContain(
      'This choice applies to computer-controlled opponents for everyone in this campaign.',
    );
    expect(dialog.style.maxHeight).toBe('min(90dvh, 720px)');
    expect(dialog.style.overflowY).toBe('auto');
    expect(dialog.style.padding).toBe('16px');
    expect(dialog.querySelector('style')?.textContent).toContain('safe-area-inset');
  });

  it('omits the hot-seat sentence for solo saves', () => {
    const panel = showLegacyOpponentChallengePrompt(document.body, {
      hotSeat: false,
      onContinue: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(panel.textContent).not.toContain('for everyone in this campaign');
  });

  it('traps keyboard focus and Escape cancels once and restores invoking-row focus', () => {
    const invokingRow = document.createElement('button');
    invokingRow.textContent = 'Load old save';
    document.body.appendChild(invokingRow);
    invokingRow.focus();
    const onCancel = vi.fn();
    const panel = showLegacyOpponentChallengePrompt(document.body, {
      hotSeat: false,
      returnFocusTo: invokingRow,
      onContinue: vi.fn(),
      onCancel,
    });
    const focusable = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = focusable[0]!;
    const last = focusable.at(-1)!;

    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(last);

    panel.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    panel.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(invokingRow);
    expect(panel.isConnected).toBe(false);
  });

  it('renders all player-visible strings as text rather than markup', () => {
    const panel = showLegacyOpponentChallengePrompt(document.body, {
      hotSeat: false,
      onContinue: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(panel.querySelector('script')).toBeNull();
    expect(panel.querySelectorAll('[data-challenge]')).toHaveLength(3);
    for (const card of panel.querySelectorAll<HTMLButtonElement>('[data-challenge]')) {
      expect(card.querySelector('img,iframe,object')).toBeNull();
    }
  });
});
