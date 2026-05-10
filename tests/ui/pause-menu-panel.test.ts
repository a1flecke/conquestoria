// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showPauseMenu } from '@/ui/pause-menu-panel';

function makeCallbacks(overrides: Partial<Parameters<typeof showPauseMenu>[1]> = {}): Parameters<typeof showPauseMenu>[1] {
  return {
    turn: 14,
    civName: 'Inca Empire',
    onResume: vi.fn(),
    onSave: vi.fn(async () => {}),
    onNewGame: vi.fn(),
    autoSave: vi.fn(async () => {}),
    ...overrides,
  };
}

function clickButton(label: string): void {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === label) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`No button found with text "${label}"`);
  btn.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pause-menu-panel', () => {
  it('renders with correct turn number and civ name in header', () => {
    showPauseMenu(document.body, makeCallbacks());
    expect(document.body.textContent).toContain('Turn 14');
    expect(document.body.textContent).toContain('Inca Empire');
  });

  it('"Return to Game" calls onResume and removes panel', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('Return to Game');
    expect(callbacks.onResume).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"New Game…" swaps to the confirmation sub-view', () => {
    showPauseMenu(document.body, makeCallbacks());
    clickButton('New Game…');
    expect(document.body.textContent).toContain('Save before leaving?');
    expect(document.body.textContent).toContain('Turn 14');
  });

  it('"Save & Start New Game" calls autoSave then onNewGame', async () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Save & Start New Game');
    await vi.waitFor(() => expect(callbacks.autoSave).toHaveBeenCalledTimes(1));
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"Discard & Start New Game" calls onNewGame without autoSave', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Discard & Start New Game');
    expect(callbacks.autoSave).not.toHaveBeenCalled();
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"Cancel" in sub-view returns to main pause view without calling onNewGame', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Cancel');
    expect(callbacks.onNewGame).not.toHaveBeenCalled();
    expect(document.getElementById('pause-menu')).not.toBeNull();
    expect(document.body.textContent).toContain('Return to Game');
    expect(document.body.textContent).not.toContain('Save before leaving?');
  });

  it('replaces stale pause panels when reopened', () => {
    showPauseMenu(document.body, makeCallbacks({ turn: 5, civName: 'Rome' }));
    showPauseMenu(document.body, makeCallbacks({ turn: 8, civName: 'Egypt' }));
    expect(document.querySelectorAll('#pause-menu')).toHaveLength(1);
    expect(document.body.textContent).toContain('Turn 8');
    expect(document.body.textContent).toContain('Egypt');
  });

  it('all buttons have styled background and color (no browser-default chrome)', () => {
    showPauseMenu(document.body, makeCallbacks());
    const buttons = Array.from(document.querySelectorAll('#pause-menu button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.style.background, `${btn.textContent} background`).not.toBe('');
      expect(btn.style.color, `${btn.textContent} color`).not.toBe('');
    }
  });
});
