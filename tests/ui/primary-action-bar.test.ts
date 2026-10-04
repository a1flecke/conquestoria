// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createPrimaryActionBar,
  type PrimaryActionBarCallbacks,
} from '@/ui/primary-action-bar';

function callbacks(
  overrides: Partial<PrimaryActionBarCallbacks> = {},
): PrimaryActionBarCallbacks {
  return {
    onOpenCouncil: () => {},
    onOpenTech: () => {},
    onOpenCity: () => {},
    onOpenEspionage: () => {},
    onOpenDiplomacy: () => {},
    onOpenMarketplace: () => {},
    onEndTurn: () => {},
    ...overrides,
  };
}

function buttonNamed(bar: HTMLElement, name: string): HTMLButtonElement {
  const button = Array.from(bar.querySelectorAll('button'))
    .find(candidate => candidate.getAttribute('aria-label') === name);
  if (!button) throw new Error(`Missing primary action button: ${name}`);
  return button;
}

describe('primary-action-bar', () => {
  it('renders a Council button in the primary action bar and wires it for opening', () => {
    const onOpenCouncil = vi.fn();

    const bar = createPrimaryActionBar(callbacks({ onOpenCouncil }));
    const councilButton = buttonNamed(bar, 'Council');

    councilButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenCouncil).toHaveBeenCalledTimes(1);
  });

  it('does not suppress a later valid click behind a timer-backed cooldown', () => {
    const onOpenDiplomacy = vi.fn();
    const bar = createPrimaryActionBar(callbacks({ onOpenDiplomacy }));
    const diplomacyButton = buttonNamed(bar, 'Diplo');

    diplomacyButton.click();
    diplomacyButton.click();

    expect(onOpenDiplomacy).toHaveBeenCalledTimes(2);
  });

  it('uses the native click semantic instead of treating touchend as a second activation', () => {
    const onOpenCouncil = vi.fn();
    const bar = createPrimaryActionBar(callbacks({ onOpenCouncil }));
    const councilButton = buttonNamed(bar, 'Council');

    councilButton.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
    expect(onOpenCouncil).not.toHaveBeenCalled();

    councilButton.click();
    expect(onOpenCouncil).toHaveBeenCalledTimes(1);
  });

  it('shows End Turn as busy and blocks duplicate activation until its promise settles', async () => {
    let resolveEndTurn!: () => void;
    const pendingEndTurn = new Promise<void>(resolve => {
      resolveEndTurn = resolve;
    });
    const onEndTurn = vi.fn(() => pendingEndTurn);
    const bar = createPrimaryActionBar(callbacks({ onEndTurn }));
    const endTurnButton = buttonNamed(bar, 'End Turn');

    endTurnButton.click();

    expect(onEndTurn).toHaveBeenCalledTimes(1);
    expect(endTurnButton.disabled).toBe(true);
    expect(endTurnButton.getAttribute('aria-busy')).toBe('true');
    expect(endTurnButton.textContent).toContain('Ending…');

    endTurnButton.click();
    expect(onEndTurn).toHaveBeenCalledTimes(1);

    resolveEndTurn();
    await pendingEndTurn;
    await Promise.resolve();

    expect(endTurnButton.disabled).toBe(false);
    expect(endTurnButton.hasAttribute('aria-busy')).toBe(false);
    expect(endTurnButton.textContent).toContain('End Turn');
  });
});
