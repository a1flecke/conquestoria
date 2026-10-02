// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderBattleForecastCard } from '@/ui/battle-forecast-card';
import type { BattleForecastView } from '@/ui/battle-forecast-projection';

function view(overrides: Partial<BattleForecastView> = {}): BattleForecastView {
  return {
    band: 'advantage', icon: '👍',
    headline: 'Advantage — you should hurt the Spearman more than it hurts you.',
    you: { name: 'Knight', hp: 100, damage: { min: 8, max: 20, expected: 14 }, fate: '', summary: 'Your Knight: about 14 HP lost (8–20); 100 → ~86 HP.' },
    them: { name: 'Spearman', hp: 100, damage: { min: 22, max: 40, expected: 31 }, fate: 'could be destroyed', summary: 'Enemy Spearman: about 31 HP lost (22–40); 100 → ~69 HP.' },
    why: 'Why: Terrain: +25% defense for them, Veteran +10%',
    workingForYou: ['Veteran +10%'], workingAgainstYou: ['Terrain: +25% defense for them'],
    notActive: ['Combined Arms — not active (its condition is not met here)'], tips: ['A river lies between you. Attack from a tile on the same side to avoid it.'],
    ownerName: 'Rival', ariaLabel: 'Battle preview. Advantage',
    ...overrides,
  };
}

describe('battle forecast card (#1135)', () => {
  it('leads with a plain-language headline, two damage lines and a one-line why', () => {
    const panel = document.createElement('div');
    renderBattleForecastCard(panel, { view: view(), notes: [] }, { onAttack: () => {}, onCancel: () => {} });
    expect(panel.querySelector('[data-testid="battle-forecast-headline"]')!.textContent).toBe('👍 Advantage — you should hurt the Spearman more than it hurts you.');
    const text = panel.textContent!;
    expect(text).toContain('Your Knight: about 14 HP lost (8–20)');
    expect(text).toContain('Enemy Spearman: about 31 HP lost (22–40)');
    expect(text).toContain('Could be destroyed.');
    expect(text).toContain('Why: Terrain');
  });

  it('keeps the exact factors, inactive bonuses and tips behind an expandable section', () => {
    const panel = document.createElement('div');
    renderBattleForecastCard(panel, { view: view(), notes: [] }, { onAttack: () => {}, onCancel: () => {} });
    const details = panel.querySelector('details')!;
    expect(details.querySelector('summary')!.textContent).toBe('More details');
    expect(details.textContent).toContain('Working for you');
    expect(details.textContent).toContain('Working against you');
    expect(details.textContent).toContain('Not active');
    expect(details.textContent).toContain('What you could change');
    expect(details.textContent).toContain('only what you can see');
  });

  it('works on tap alone: 44px targets, labelled group, no hover handlers, no motion', () => {
    const panel = document.createElement('div');
    const onAttack = vi.fn(); const onCancel = vi.fn();
    renderBattleForecastCard(panel, { view: view(), notes: [] }, { onAttack, onCancel });
    const group = panel.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Battle preview. Advantage');
    for (const id of ['btn-attack-confirm', 'btn-cancel-attack']) {
      const btn = panel.querySelector<HTMLButtonElement>(`#${id}`)!;
      expect(btn.style.minHeight).toBe('44px');
      expect(btn.type).toBe('button');
    }
    expect(panel.querySelector('summary')!.getAttribute('style')).toContain('min-height: 44px');
    expect(panel.innerHTML).not.toMatch(/onmouseover|mouseenter|animation|transition/);
    panel.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();
    panel.querySelector<HTMLButtonElement>('#btn-cancel-attack')!.click();
    expect(onAttack).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('never trusts game-generated names as markup', () => {
    const panel = document.createElement('div');
    const evil = '<img src=x onerror=alert(1)>';
    renderBattleForecastCard(panel, {
      view: view({ ownerName: evil, headline: evil, you: { ...view().you, summary: evil } }),
      notes: [{ text: evil, emphasis: 'warning' }],
    }, { onAttack: () => {}, onCancel: () => {} });
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.textContent).toContain(evil);
  });

  it('communicates the band in words and an icon, not colour alone, for every band', () => {
    for (const [band, icon, word] of [['strong-advantage', '✅', 'Strong advantage'], ['even', '⚖️', 'Even fight'], ['severe-risk', '🛑', 'Severe risk']] as const) {
      const panel = document.createElement('div');
      renderBattleForecastCard(panel, { view: view({ band, icon, headline: `${word} — x` }), notes: [] }, { onAttack: () => {}, onCancel: () => {} });
      expect(panel.querySelector('[data-testid="battle-forecast-headline"]')!.textContent).toBe(`${icon} ${word} — x`);
    }
  });

  it('#1213: renders the interception block in words (not colour alone) and a custom action label', () => {
    const panel = document.createElement('div');
    renderBattleForecastCard(panel, {
      view: view({ interception: { headline: 'Interception risk: a Jet Fighter you can see is in range and may intercept.', lines: ['If it intercepts, it fights your Bomber first.'] } }),
      notes: [],
      action: { label: 'Strike', title: 'Air Strike Preview' },
    }, { onAttack: () => {}, onCancel: () => {} });
    const block = panel.querySelector('[data-testid="battle-forecast-interception"]')!;
    expect(block.textContent).toContain('Interception risk');
    expect(block.textContent).toContain('fights your Bomber first');
    expect(panel.querySelector('#btn-attack-confirm')!.textContent).toBe('Strike');
    expect(panel.textContent).toContain('Air Strike Preview');
  });

  it('#1213: an ordinary attack still has no interception block and says Attack', () => {
    const panel = document.createElement('div');
    renderBattleForecastCard(panel, { view: view(), notes: [] }, { onAttack: () => {}, onCancel: () => {} });
    expect(panel.querySelector('[data-testid="battle-forecast-interception"]')).toBeNull();
    expect(panel.querySelector('#btn-attack-confirm')!.textContent).toBe('Attack');
  });
});
