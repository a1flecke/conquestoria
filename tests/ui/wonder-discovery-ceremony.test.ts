// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';
import { createWonderDiscoveryCeremony } from '@/ui/wonder-discovery-ceremony';

function item(overrides: Partial<WonderDiscoveryRevealItem> = {}): WonderDiscoveryRevealItem {
  return {
    title: 'Natural Wonder Discovered',
    wonderId: 'great_volcano',
    civId: 'player',
    coord: { q: 2, r: 3 },
    name: 'Great Volcano',
    revealLine: 'The earth opens and the sky remembers.',
    effectSummary: 'Yields +3 Production, +1 Science. May erupt and damage nearby improvements.',
    rewardSummary: '+30 Science discovery reward',
    visual: getWonderVisualDefinition('great_volcano'),
    motionAssetId: null,
    ...overrides,
  };
}

function videoPreview(surface: WonderVideoPreviewView['surface'] = 'natural-reveal'): WonderVideoPreviewView {
  return {
    id: 'video-great-volcano-tonga-eruption',
    wonderId: 'great_volcano',
    surface,
    src: '/videos/wonders/great-volcano-tonga-eruption.mp4',
    mimeType: 'video/mp4',
    label: 'Great Volcano',
    attribution: 'Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm',
    license: 'CC BY 4.0 compatible public data terms',
    audio: 'silent',
    fallbackImage: {
      src: '/images/wonders/codex/volcano.jpg',
      alt: 'Great Volcano source image',
      attribution: 'USGS / public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kilauea_Volcano,_Hawaii_(ASTER).jpg',
      license: 'public domain',
    },
  };
}

function click(selector: string): void {
  const element = document.querySelector(selector);
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('wonder-discovery-ceremony', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  it('renders the reveal copy, actions, and amplified spectacle mode', () => {
    createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

    expect(document.body.textContent).toContain('Natural Wonder Discovered');
    expect(document.body.textContent).toContain('Great Volcano');
    expect(document.body.textContent).toContain('The earth opens');
    expect(document.body.textContent).toContain('Yields +3 Production');
    expect(document.body.textContent).toContain('+30 Science discovery reward');
    expect(document.querySelector('[data-wonder-discovery-action="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="open-atlas"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="skip"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
  });

  it('renders amplified spectacle from the natural wonder recipe', () => {
    createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

    expect(document.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-spectacle-variant="amplified"]')).toBeTruthy();
  });

  it('uses the video view for supported natural discoveries while keeping actions clickable', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(
      document.body,
      item({ videoPreview: videoPreview('natural-reveal') }),
      { onResolve },
      { reducedMotion: false },
    );

    expect(document.querySelector('[data-wonder-video-view]')).toBeTruthy();
    click('[data-wonder-discovery-action="skip"]');
    expect(onResolve).toHaveBeenCalledWith('skip');

    play.mockRestore();
  });

  it('keeps the static ceremony visual in reduced motion when a video preview exists', () => {
    createWonderDiscoveryCeremony(
      document.body,
      item({ videoPreview: videoPreview('natural-reveal') }),
      { onResolve: () => {} },
      { reducedMotion: true },
    );

    expect(document.querySelector('[data-wonder-video-view]')).toBeNull();
    expect(document.querySelector('[data-wonder-spectacle-mode="reveal-static"]')).toBeTruthy();
  });

  it('uses static spectacle for reduced-motion reveal', () => {
    createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: true });

    expect(document.querySelector('[data-wonder-spectacle-mode="reveal-static"]')).toBeTruthy();
    expect(document.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
  });

  it('resolves exactly once for repeated action clicks', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: false });
    const continueButton = document.querySelector('[data-wonder-discovery-action="continue"]')!;
    const skipButton = document.querySelector('[data-wonder-discovery-action="skip"]')!;
    const atlasButton = document.querySelector('[data-wonder-discovery-action="open-atlas"]')!;

    continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    skipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    atlasButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('continue');
    expect(document.querySelector('#wonder-discovery-ceremony')).toBeNull();
  });

  it('returns open-atlas when the Atlas action is selected', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: false });

    click('[data-wonder-discovery-action="open-atlas"]');

    expect(onResolve).toHaveBeenCalledWith('open-atlas');
  });

  it('uses static mode for reduced motion and keeps actions available before timers run', () => {
    const onResolve = vi.fn();
    createWonderDiscoveryCeremony(document.body, item(), { onResolve }, { reducedMotion: true });

    expect(document.querySelector('[data-wonder-discovery-motion="static"]')).toBeTruthy();
    expect(document.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
    click('[data-wonder-discovery-action="skip"]');
    expect(onResolve).toHaveBeenCalledWith('skip');
  });

  it('inserts dynamic text safely', () => {
    createWonderDiscoveryCeremony(
      document.body,
      item({ name: '<img src=x onerror=alert(1)>', revealLine: '<script>alert(1)</script>' }),
      { onResolve: () => {} },
      { reducedMotion: false },
    );

    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.body.innerHTML).not.toContain('<script>alert(1)</script>');
  });
});
