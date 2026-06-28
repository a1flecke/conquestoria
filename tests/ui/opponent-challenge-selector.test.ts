// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPPONENT_CHALLENGE_COPY,
  createOpponentChallengeSelector,
} from '@/ui/opponent-challenge-selector';

describe('opponent challenge selector', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the approved shared copy and marks Standard as recommended', () => {
    const selector = createOpponentChallengeSelector({
      selected: 'standard',
      onSelect: vi.fn(),
      mode: 'new-game',
    });
    document.body.appendChild(selector);

    expect(OPPONENT_CHALLENGE_COPY).toEqual({
      explorer: {
        label: 'Explorer',
        description: 'Clear warnings, smaller attacks, and more time to recover.',
      },
      standard: {
        label: 'Standard',
        badge: 'Recommended',
        description: 'Purposeful rivals, coordinated attacks, and fair breathing room.',
      },
      veteran: {
        label: 'Veteran',
        description: 'Faster plans, stronger coordination, and fewer tactical mistakes.',
      },
    });
    expect(selector.textContent).toContain('Standard');
    expect(selector.textContent).toContain('Recommended');
    for (const copy of Object.values(OPPONENT_CHALLENGE_COPY)) {
      expect(selector.textContent).toContain(copy.label);
      expect(selector.textContent).toContain(copy.description);
    }
  });

  it('defaults new campaigns to Standard but leaves migration unselected', () => {
    const newGame = createOpponentChallengeSelector({
      selected: null,
      onSelect: vi.fn(),
      mode: 'new-game',
    });
    const migration = createOpponentChallengeSelector({
      selected: null,
      onSelect: vi.fn(),
      mode: 'migration',
    });

    expect(newGame.querySelector('[data-challenge="standard"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(migration.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('updates the visible selection immediately and reports the chosen value', () => {
    const onSelect = vi.fn();
    const selector = createOpponentChallengeSelector({
      selected: 'standard',
      onSelect,
      mode: 'settings',
    });
    const explorer = selector.querySelector<HTMLButtonElement>('[data-challenge="explorer"]')!;

    explorer.click();

    expect(onSelect).toHaveBeenCalledWith('explorer');
    expect(explorer.getAttribute('aria-pressed')).toBe('true');
    expect(selector.querySelector('[data-challenge="standard"]')?.getAttribute('aria-pressed'))
      .toBe('false');
  });

  it('uses touch-sized buttons and responsive one-to-three-column layout', () => {
    const selector = createOpponentChallengeSelector({
      selected: 'standard',
      onSelect: vi.fn(),
      mode: 'new-game',
    });

    expect(selector.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(selector.querySelector('style')?.textContent).toContain('@media (min-width: 720px)');
    expect(selector.querySelector('style')?.textContent).toContain('repeat(3, minmax(0, 1fr))');
    for (const card of selector.querySelectorAll<HTMLButtonElement>('[data-challenge]')) {
      expect(card.style.minHeight).toBe('44px');
      expect(card.style.height).not.toMatch(/^\d/);
      expect(card.style.background).not.toBe('');
      expect(card.style.color).not.toBe('');
    }
  });
});
