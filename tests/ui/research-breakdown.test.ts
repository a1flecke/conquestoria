// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ResearchOutputBreakdown } from '@/systems/research-output-system';
import { createResearchBreakdown } from '@/ui/research-breakdown';

const breakdown: ResearchOutputBreakdown = {
  civId: 'player',
  cityContributions: [],
  grossCityScience: 58,
  coordinatedCityScience: 24,
  empireBonusScience: 3,
  penaltyMultiplier: 0.25,
  finalScience: 20,
  rows: [
    { kind: 'city-gross', science: 58 },
    { kind: 'coordination', science: -34 },
    { kind: 'empire-bonus', science: 3 },
    { kind: 'temporary-penalty', science: -7 },
    { kind: 'final', science: 20 },
  ],
};

describe('research breakdown', () => {
  it('renders the canonical plain-language output rows in an accessible dialog', () => {
    const panel = createResearchBreakdown(breakdown, { onClose: () => {} });

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.textContent).toContain('Research details');
    expect(panel.querySelector('[data-research-output-kind="city-gross"]')?.textContent).toBe('City science+58');
    expect(panel.querySelector('[data-research-output-kind="coordination"]')?.textContent).toBe('Research network-34');
    expect(panel.querySelector('[data-research-output-kind="empire-bonus"]')?.textContent).toBe('Empire research+3');
    expect(panel.querySelector('[data-research-output-kind="temporary-penalty"]')?.textContent).toBe('Temporary setback-7');
    expect(panel.querySelector('[data-research-output-kind="final"]')?.textContent).toBe('Final research+20');
  });

  it('closes without leaving stale UI and restores focus to the invoking control', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const panel = createResearchBreakdown(breakdown, { onClose, returnFocusTo: opener });
    document.body.appendChild(panel);

    (panel.querySelector('[data-action="close-research-breakdown"]') as HTMLButtonElement).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
