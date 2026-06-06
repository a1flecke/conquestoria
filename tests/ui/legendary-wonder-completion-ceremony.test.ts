// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';
import { createLegendaryWonderCompletionCeremony } from '@/ui/legendary-wonder-completion-ceremony';

function videoPreview(surface: WonderVideoPreviewView['surface'] = 'legendary-completion'): WonderVideoPreviewView {
  return {
    id: 'video-starvault-paranal-observatory',
    wonderId: 'starvault-observatory',
    surface,
    src: '/videos/wonders/starvault-paranal-observatory.mp4',
    mimeType: 'video/mp4',
    label: 'Starvault Observatory',
    attribution: 'ESO/J. Colosimo - CC BY 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm',
    license: 'CC BY 4.0',
    audio: 'silent',
    fallbackImage: {
      src: '/images/wonders/codex/observatory.jpg',
      alt: 'Starvault Observatory source image',
      attribution: 'ESO and G. Hudepohl / CC BY 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Paranal_and_the_Pacific_at_sunset_(dsc4088,_retouched,_cropped).jpg',
      license: 'CC BY 4.0',
    },
  };
}

function item(overrides: Partial<LegendaryWonderCompletionCeremonyItem> = {}): LegendaryWonderCompletionCeremonyItem {
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
    ...overrides,
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

  it('uses the video view for supported legendary completions while keeping actions clickable', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onResolve = vi.fn();
    createLegendaryWonderCompletionCeremony(
      document.body,
      item({ videoPreview: videoPreview('legendary-completion') }),
      { onResolve },
      { reducedMotion: false },
    );

    expect(document.querySelector('[data-wonder-video-view]')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('[data-legendary-completion-action="continue"]')?.click();
    expect(onResolve).toHaveBeenCalledWith('continue');

    play.mockRestore();
  });

  it('keeps the static legendary ceremony visual in reduced motion', () => {
    createLegendaryWonderCompletionCeremony(
      document.body,
      item({ videoPreview: videoPreview('legendary-completion') }),
      { onResolve: () => {} },
      { reducedMotion: true },
    );

    expect(document.querySelector('[data-wonder-video-view]')).toBeNull();
    expect(document.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
  });
});
