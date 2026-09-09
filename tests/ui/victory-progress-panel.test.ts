// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createVictoryProgressPanel } from '@/ui/victory-progress-panel';

describe('victory progress panel', () => {
  it('renders safe known rows in a scrollable panel and closes', () => {
    const onClose = vi.fn();
    const panel = createVictoryProgressPanel({
      viewerId: 'player',
      ruleText: 'To win, be the last independent empire.',
      ownStatusText: 'Your empire is independent.',
      ownVassalCount: 1,
      ownEarnedDefeatCount: 2,
      rows: [{
        civId: 'rome', civName: '<Rome>', evidence: 'reported', reportTurn: 8,
        text: '<Rome> was reported independent on turn 8.', warning: false,
      }],
      uncertaintyText: 'Other empires or changes may be unknown.',
      guidance: { kind: 'espionage', text: 'Gather intelligence.' },
    }, {
      onClose,
      onOpenDiplomacy: vi.fn(),
      onOpenCity: vi.fn(),
      onOpenEspionage: vi.fn(),
    });

    document.body.appendChild(panel);

    expect((panel.querySelector<HTMLElement>('[aria-label="Known empire reports"]'))?.style.overflowY).toBe('auto');
    expect(panel.textContent).toContain('<Rome> was reported independent on turn 8.');
    expect(panel.querySelector('script')).toBeNull();
    const close = [...panel.querySelectorAll('button')].find(button => button.textContent === 'Close');
    close?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('routes an entitled city guidance button without exposing strategic actions', () => {
    const onOpenCity = vi.fn();
    const panel = createVictoryProgressPanel({
      viewerId: 'player', ruleText: 'rule', ownStatusText: 'status', ownVassalCount: 0,
      ownEarnedDefeatCount: 0, rows: [], uncertaintyText: 'unknown',
      guidance: { kind: 'owned-city', text: 'Open Alexandria', cityId: 'city-1' },
    }, { onClose: vi.fn(), onOpenDiplomacy: vi.fn(), onOpenCity, onOpenEspionage: vi.fn() });

    [...panel.querySelectorAll('button')].find(button => button.textContent === 'Open Alexandria')?.click();

    expect(onOpenCity).toHaveBeenCalledWith('city-1');
  });
});
