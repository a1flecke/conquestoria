// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';

describe('pacing-debug-panel', () => {
  it('shows the summary fields needed for balancing decisions', () => {
    const state = createNewGame(undefined, 'pacing-debug-panel-seed', 'small');
    const panel = createPacingDebugPanel(document.body, state);

    expect(panel.textContent).toContain('Pacing Debug');
    expect(panel.textContent).toContain('Recommended');
    expect(panel.textContent).toContain('Target');
  });

  it('can reveal the full catalog instead of only the initial subset', () => {
    const state = createNewGame(undefined, 'pacing-debug-show-all-seed', 'small');
    const panel = createPacingDebugPanel(document.body, state);

    const showAllButton = panel.querySelector('[data-action="show-all-audit"]') as HTMLButtonElement | null;
    expect(showAllButton).not.toBeNull();
    showAllButton?.click();

    expect(panel.textContent).toContain('Digital Surveillance');
  });
});
