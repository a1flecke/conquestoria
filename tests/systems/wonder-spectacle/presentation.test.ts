import { describe, expect, it } from 'vitest';
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';

describe('wonder spectacle render modes', () => {
  it('animates map only for live visible natural wonders at normal zoom with motion enabled', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-animated');
  });

  it('uses static map rendering for last-seen, low zoom, reduced motion, missing recipes, and undiscovered wonders', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'last-seen',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: true,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: true,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'missing-wonder',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: false,
    })).toBe('hidden');
  });

  it('allows Codex ambient and replay modes for discovered natural wonders even when not live visible', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: true,
    })).toBe('codex-ambient');
    expect(getWonderSpectacleRenderMode({
      surface: 'reveal',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: true,
    })).toBe('reveal-amplified');
  });

  it('hides undiscovered Codex/replay spectacle and uses static modes for reduced motion', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: false,
    })).toBe('hidden');
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: true,
      discovered: true,
    })).toBe('codex-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'reveal',
      wonderId: 'great_volcano',
      reducedMotion: true,
      discovered: true,
    })).toBe('reveal-static');
  });
});
