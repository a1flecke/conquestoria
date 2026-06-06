// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';
import { createWonderVideoView } from '@/ui/wonder-video-view';

function preview(surface: WonderVideoPreviewView['surface'] = 'codex'): WonderVideoPreviewView {
  return {
    id: 'video-great-volcano-tonga-eruption',
    wonderId: 'great_volcano',
    surface,
    src: '/conquestoria/videos/wonders/great-volcano-tonga-eruption.mp4',
    mimeType: 'video/mp4',
    label: 'Great Volcano',
    attribution: 'Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm',
    license: 'CC BY 4.0 compatible public data terms',
    audio: 'silent',
    fallbackImage: {
      src: '/conquestoria/images/wonders/codex/volcano.jpg',
      alt: 'Great Volcano source image',
      attribution: 'USGS / public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kilauea_Volcano,_Hawaii_(ASTER).jpg',
      license: 'public domain',
    },
  };
}

describe('createWonderVideoView', () => {
  it('renders a silent looped video with visible controls when motion is allowed', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const element = createWonderVideoView({ preview: preview(), autoplay: 'immediate' });
    const video = element.querySelector('video');
    const source = element.querySelector('source');

    expect(element.dataset.wonderVideoView).toBe('video-great-volcano-tonga-eruption');
    expect(element.dataset.wonderVideoSurface).toBe('codex');
    expect(element.dataset.wonderVideoState).toBe('playing');
    expect(video?.muted).toBe(true);
    expect(video?.defaultMuted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(source?.getAttribute('src')).toBe('/conquestoria/videos/wonders/great-volcano-tonga-eruption.mp4');
    expect(source?.getAttribute('type')).toBe('video/mp4');
    expect(element.querySelector('[data-wonder-video-toggle]')?.textContent).toBe('Pause');
    expect(element.querySelector('a')?.getAttribute('href')).toBe(preview().sourceUrl);
    play.mockRestore();
  });

  it('keeps in-view autoplay paused until an intersection signal exists', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const element = createWonderVideoView({ preview: preview(), autoplay: 'in-view' });

    expect(element.dataset.wonderVideoState).toBe('paused');
    expect(element.querySelector('[data-wonder-video-toggle]')?.textContent).toBe('Play');
    expect(play).not.toHaveBeenCalled();

    play.mockRestore();
  });

  it('toggles between pause and play without creating audio behavior', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const element = createWonderVideoView({ preview: preview(), autoplay: 'immediate' });
    const button = element.querySelector<HTMLButtonElement>('[data-wonder-video-toggle]');

    button?.click();
    expect(pause).toHaveBeenCalled();
    expect(button?.textContent).toBe('Play');
    expect(element.dataset.wonderVideoState).toBe('paused');

    button?.click();
    expect(play).toHaveBeenCalled();
    await Promise.resolve();
    expect(button?.textContent).toBe('Pause');
    expect(element.dataset.wonderVideoState).toBe('playing');

    pause.mockRestore();
    play.mockRestore();
  });

  it('renders the sourced fallback image and no video when reduced motion is enabled', () => {
    const element = createWonderVideoView({ preview: preview(), reducedMotion: true });

    expect(element.dataset.wonderVideoState).toBe('fallback');
    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/conquestoria/images/wonders/codex/volcano.jpg');
    expect(element.querySelector('a')?.getAttribute('href')).toBe(preview().fallbackImage.sourceUrl);
  });

  it('replaces video with the fallback image on media error', () => {
    const element = createWonderVideoView({ preview: preview('natural-reveal'), autoplay: 'in-view' });
    element.querySelector('video')?.dispatchEvent(new Event('error'));

    expect(element.dataset.wonderVideoState).toBe('fallback');
    expect(element.dataset.wonderVideoSurface).toBe('natural-reveal');
    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('img')).toBeTruthy();
  });
});
