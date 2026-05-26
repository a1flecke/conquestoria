// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  SVG_WONDER_SPECTACLE_PRIMITIVES,
  createWonderSpectacleVignette,
} from '@/ui/wonder-spectacle-vignette';
import { getNaturalWonderSpectacleRecipes } from '@/systems/wonder-spectacle/presentation';

describe('wonder spectacle vignette', () => {
  it('supports every primitive used by recipes', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      for (const primitive of [...recipe.mapPrimitives, ...recipe.codexPrimitives, ...recipe.revealPrimitives]) {
        expect(SVG_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
      }
    }
  });

  it('renders an accessible ambient Codex vignette', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'codex-ambient',
      reducedMotion: false,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('codex-ambient');
    expect(root.querySelector('svg')?.getAttribute('aria-label')).toBe('Great Volcano spectacle animation');
    expect(root.querySelectorAll('[data-wonder-spectacle-primitive]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('animate').length).toBeGreaterThan(0);
  });

  it('renders static equivalent for reduced motion', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'codex-static',
      reducedMotion: true,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('codex-static');
    expect(root.dataset.vignetteMotion).toBe('static');
    expect(root.querySelectorAll('animate')).toHaveLength(0);
  });

  it('renders amplified replay/reveal mode from the same recipe', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'reveal-amplified',
      reducedMotion: false,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('reveal-amplified');
    expect(root.querySelector('[data-wonder-spectacle-variant="amplified"]')).toBeTruthy();
  });
});
