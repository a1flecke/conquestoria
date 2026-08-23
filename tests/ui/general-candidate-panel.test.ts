// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { createGeneralCandidatePanel } from '@/ui/general-candidate-panel';
import type { GeneralDefinition } from '@/systems/great-general-definitions';

describe('general candidate panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const candidates: GeneralDefinition[] = [
    { id: 'gen_a', name: 'General A', civTypeEligibility: [], era: 3, descriptor: 'Test descriptor A', portraitIcon: '⚔️', commandRange: 2, commandCapacity: 3 },
    { id: 'gen_b', name: 'General B', civTypeEligibility: [], era: 4, descriptor: 'Test descriptor B', portraitIcon: '🛡️', commandRange: 2, commandCapacity: 3 },
  ];

  it('shows every candidate\'s name, era, and descriptor', () => {
    createGeneralCandidatePanel(container, candidates, () => {});
    const panel = container.querySelector('#general-candidate-panel')!;
    expect(panel.textContent).toContain('General A');
    expect(panel.textContent).toContain('General B');
    expect(panel.textContent).toContain('Test descriptor A');
    expect(panel.textContent).toContain('Test descriptor B');
    expect(panel.textContent).toContain('3'); // era
    expect(panel.querySelectorAll('button[data-choice]')).toHaveLength(2);
  });

  it('calls onChoose with the selected definition id, exactly once (replay safety)', () => {
    const chosen: string[] = [];
    createGeneralCandidatePanel(container, candidates, id => chosen.push(id));
    const buttonB = container.querySelector('button[data-choice="gen_b"]') as HTMLButtonElement;
    buttonB.click();
    buttonB.click();
    expect(chosen).toEqual(['gen_b']);
    expect(container.querySelector('#general-candidate-panel')).toBeNull();
  });

  it('has no dismiss/close affordance (blocking by design -- a threshold crossing cannot be indefinitely deferred)', () => {
    createGeneralCandidatePanel(container, candidates, () => {});
    expect(container.querySelector('#general-candidate-panel button[data-action="close"]')).toBeNull();
  });

  it('reopening never duplicates', () => {
    createGeneralCandidatePanel(container, candidates, () => {});
    createGeneralCandidatePanel(container, candidates, () => {});
    expect(container.querySelectorAll('#general-candidate-panel')).toHaveLength(1);
  });

  it('every button has both background and color set (no-bare-buttons contract)', () => {
    createGeneralCandidatePanel(container, candidates, () => {});
    for (const button of container.querySelectorAll('button')) {
      const el = button as HTMLButtonElement;
      expect(el.style.background || el.style.backgroundColor).toBeTruthy();
      expect(el.style.color).toBeTruthy();
    }
  });
});
