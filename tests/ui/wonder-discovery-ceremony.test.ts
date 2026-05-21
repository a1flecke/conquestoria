// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
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

  it('renders the reveal copy, actions, and animated medallion mode', () => {
    createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

    expect(document.body.textContent).toContain('Natural Wonder Discovered');
    expect(document.body.textContent).toContain('Great Volcano');
    expect(document.body.textContent).toContain('The earth opens');
    expect(document.body.textContent).toContain('Yields +3 Production');
    expect(document.body.textContent).toContain('+30 Science discovery reward');
    expect(document.querySelector('[data-wonder-discovery-action="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="open-atlas"]')).toBeTruthy();
    expect(document.querySelector('[data-wonder-discovery-action="skip"]')).toBeTruthy();
    expect(document.querySelector('[data-vignette-motion="ambient"]')).toBeTruthy();
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
