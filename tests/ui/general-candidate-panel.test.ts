// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { createGeneralCandidatePanel } from '@/ui/general-candidate-panel';
import { GENERAL_DEFINITIONS, type GeneralDefinition } from '@/systems/great-general-definitions';

describe('general candidate panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const candidates: GeneralDefinition[] = [
    { id: 'gen_a', name: 'General A', civTypeEligibility: [], era: 3, descriptor: 'Test descriptor A', portraitIcon: '⚔️', commandRange: 2, commandCapacity: 3, abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10 },
    { id: 'gen_b', name: 'General B', civTypeEligibility: [], era: 4, descriptor: 'Test descriptor B', portraitIcon: '🛡️', commandRange: 2, commandCapacity: 3, abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10 },
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

  it('#888 — renders a mixed authored + generated candidate set through the same contract', () => {
    const mixed: GeneralDefinition[] = [
      candidates[0]!,
      {
        id: 'generated:rome:3:deadbeef',
        name: 'Marcus Valerius, the Steadfast',
        civTypeEligibility: ['rome'],
        era: 3,
        descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅',
        origin: 'generated',
        commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
        maxCommandCharges: 3, cooldownTurns: 10,
      },
    ];
    const chosen: string[] = [];
    createGeneralCandidatePanel(container, mixed, id => chosen.push(id));
    const panel = container.querySelector('#general-candidate-panel')!;
    expect(panel.textContent).toContain('Marcus Valerius, the Steadfast');
    expect(panel.textContent).toContain('Legatus. A Roman field commander');
    const genBtn = container.querySelector('button[data-choice="generated:rome:3:deadbeef"]') as HTMLButtonElement;
    expect(genBtn).toBeTruthy();
    genBtn.click();
    expect(chosen).toEqual(['generated:rome:3:deadbeef']);
  });

  it('#885 — a specialist candidate shows its one-line specialty summary under the descriptor', () => {
    const wellington = GENERAL_DEFINITIONS.find(g => g.id === 'gen_wellington')!;
    createGeneralCandidatePanel(container, [wellington], () => {});
    const panel = container.querySelector('#general-candidate-panel')!;
    expect(panel.textContent).toContain('Defensive Commander');
    expect(panel.textContent).toContain('holding ground');
    expect(panel.textContent).not.toContain('http');
  });

  it('#885 — a generalist candidate shows no specialty line', () => {
    const hannibal = GENERAL_DEFINITIONS.find(g => g.id === 'gen_hannibal')!;
    createGeneralCandidatePanel(container, [hannibal], () => {});
    const panel = container.querySelector('#general-candidate-panel')!;
    expect(panel.textContent).not.toContain('Field Commander');
  });
});
