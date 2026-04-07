import { describe, it, expect } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { makeDiplomacyFixture } from './helpers/diplomacy-fixture';

describe('diplomacy-panel breakaway rows', () => {
  it('renders breakaway status, countdown, and reabsorb action for the current player only', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player-2', includeBreakaway: true });
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Breakaway');
    expect(rendered).toContain('50 turns');
    expect(rendered).toContain('reabsorb breakaway');
    expect(rendered).not.toContain('player-1 hidden spies');
  });

  it('hides the reabsorb action when the current player lacks the required relationship or gold', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player-2',
      includeBreakaway: true,
      relationship: 45,
      gold: 150,
    });
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Breakaway');
    expect(rendered).not.toContain('reabsorb breakaway');
  });
});
