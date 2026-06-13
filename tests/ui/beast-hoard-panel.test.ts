// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';

describe('beast hoard panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const preview = { gold: 160, lore: 120, trophyGoldPerTurn: 3, beastName: 'Emerald Basilisk' };

  it('shows all three options with concrete numbers', () => {
    createBeastHoardPanel(container, preview, () => {});
    const panel = container.querySelector('#beast-hoard-panel')!;
    expect(panel.textContent).toContain('Emerald Basilisk');
    expect(panel.textContent).toContain('160');
    expect(panel.textContent).toContain('120');
    expect(panel.textContent).toContain('3');
    expect(panel.querySelectorAll('button[data-choice]')).toHaveLength(3);
  });

  it('applies exactly once even on double-click (replay safety)', () => {
    const chosen: string[] = [];
    createBeastHoardPanel(container, preview, choice => chosen.push(choice));
    const goldButton = container.querySelector('button[data-choice="gold"]') as HTMLButtonElement;
    goldButton.click();
    goldButton.click();
    expect(chosen).toEqual(['gold']);
    expect(container.querySelector('#beast-hoard-panel')).toBeNull();
  });

  it('has no dismiss/close affordance (blocking by design)', () => {
    createBeastHoardPanel(container, preview, () => {});
    expect(container.querySelector('#beast-hoard-panel button[data-action="close"]')).toBeNull();
  });

  it('reopening never duplicates', () => {
    createBeastHoardPanel(container, preview, () => {});
    createBeastHoardPanel(container, preview, () => {});
    expect(container.querySelectorAll('#beast-hoard-panel')).toHaveLength(1);
  });
});
