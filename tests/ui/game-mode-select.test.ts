/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { showGameModeSelect } from '@/ui/game-mode-select';

describe('game-mode-select', () => {
  it('renders the new-game launcher inside the shared setup shell and exposes a solo entry card', () => {
    const panel = showGameModeSelect(document.body, {
      initialTitle: 'New Campaign',
      onChooseSolo: () => {},
      onChooseHotSeat: () => {},
    });

    expect(panel.dataset.role).toBe('setup-surface');
    expect(panel.textContent).toContain('New Game');
    expect(panel.querySelector('[data-action="choose-solo-mode"]')).toBeTruthy();
  });
});
