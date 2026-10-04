// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createPrimaryActionBar } from '@/ui/primary-action-bar';

function findButton(bar: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(bar.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label);
}

describe('primary-action-bar', () => {
  it('renders a Council button in the primary action bar and wires it for opening', () => {
    const onOpenCouncil = vi.fn();

    const bar = createPrimaryActionBar({
      onOpenCouncil,
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy: () => {},
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
    });

    const councilButton = findButton(bar, 'Council');

    expect(councilButton).toBeTruthy();

    councilButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenCouncil).toHaveBeenCalledTimes(1);
  });

  it('does not drop a second click when the main thread delays the debounce timer (#1301)', () => {
    vi.useFakeTimers();
    const onOpenDiplomacy = vi.fn();

    const bar = createPrimaryActionBar({
      onOpenCouncil: () => {},
      onOpenTech: () => {},
      onOpenCity: () => {},
      onOpenEspionage: () => {},
      onOpenDiplomacy,
      onOpenMarketplace: () => {},
      onEndTurn: () => {},
    });

    const diploButton = findButton(bar, 'Diplo');
    expect(diploButton).toBeTruthy();

    diploButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenDiplomacy).toHaveBeenCalledTimes(1);

    // Simulate a long main-thread task that delays setTimeout callbacks but
    // advances real time past the old 300 ms debounce window.
    vi.setSystemTime(Date.now() + 2_000);
    diploButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenDiplomacy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
