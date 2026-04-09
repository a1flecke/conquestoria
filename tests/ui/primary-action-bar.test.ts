// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createPrimaryActionBar } from '@/ui/primary-action-bar';

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

    const councilButton = Array.from(bar.querySelectorAll('button')).find(button => button.textContent?.includes('Council'));

    expect(councilButton).toBeTruthy();

    councilButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenCouncil).toHaveBeenCalledTimes(1);
  });
});
