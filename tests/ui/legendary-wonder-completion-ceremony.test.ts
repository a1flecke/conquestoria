// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { createLegendaryWonderCompletionCeremony } from '@/ui/legendary-wonder-completion-ceremony';

function item(): LegendaryWonderCompletionCeremonyItem {
  return {
    title: 'Legendary Wonder Completed',
    civId: 'player',
    cityId: 'city-river',
    wonderId: 'oracle-of-delphi',
    turnCompleted: 42,
    name: 'Oracle of Delphi',
    cityName: 'city-river',
    achievementLine: 'city-river has completed a work that will shape its legacy.',
    rewardSummary: '+20% science in this city',
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition('oracle-of-delphi'),
  };
}

describe('legendary-wonder-completion-ceremony', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders completion copy and actions', () => {
    createLegendaryWonderCompletionCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

    expect(document.body.textContent).toContain('Legendary Wonder Completed');
    expect(document.body.textContent).toContain('Oracle of Delphi');
    expect(document.body.textContent).toContain('city-river');
    expect(document.body.textContent).toContain('Reward active');
    expect(document.querySelector('[data-legendary-completion-action="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="open-city"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="open-journal"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="skip"]')).toBeTruthy();
  });

  it('resolves exactly once for repeated clicks', () => {
    const onResolve = vi.fn();
    createLegendaryWonderCompletionCeremony(document.body, item(), { onResolve }, { reducedMotion: false });
    const continueButton = document.querySelector('[data-legendary-completion-action="continue"]')!;
    const skipButton = document.querySelector('[data-legendary-completion-action="skip"]')!;

    continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    skipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('continue');
    expect(document.querySelector('#legendary-wonder-completion-ceremony')).toBeNull();
  });
});
