// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderCodexPageViewModel } from '@/systems/wonder-codex/presentation';
import { createWonderCodexPage } from '@/ui/wonder-codex-page';

function page(overrides: Partial<WonderCodexPageViewModel> = {}): WonderCodexPageViewModel {
  return {
    id: 'great_volcano',
    kind: 'natural',
    title: 'Great Volcano',
    subtitle: 'A mountain that makes creation and ruin visible.',
    stateLabel: 'Discovered',
    visual: getWonderVisualDefinition('great_volcano'),
    authoredLead: 'The Great Volcano dominates its horizon.',
    learningText: 'Volcanic landscapes can be fertile and dangerous.',
    image: {
      src: '/images/wonders/codex/volcano.jpg',
      alt: 'Great Volcano source image',
      attribution: 'USGS / public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kilauea_Volcano,_Hawaii_(ASTER).jpg',
      license: 'public domain',
    },
    statusLines: ['Yields: +3 production, +1 science', 'Known location: Q0, R0'],
    sections: [
      { kind: 'landscape', heading: 'Living Stone', body: 'Smoke and mineral color make the tile feel powerful.' },
      { kind: 'legacy', heading: 'Settling Near Fire', body: 'Nearby cities inherit abundance and anxiety.' },
    ],
    relatedEntries: [{ id: 'sacred_mountain', title: 'Sacred Mountain', kind: 'natural', sharedTags: ['stone'] }],
    actions: [{ type: 'view-map', label: 'View on Map', wonderId: 'great_volcano', coord: { q: 0, r: 0 } }],
    ...overrides,
  };
}

describe('wonder-codex-page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders sourced image, attribution, story, status, and sections', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('img')?.getAttribute('src')).toBe('/images/wonders/codex/volcano.jpg');
    expect(root.querySelector('figcaption a')?.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('figcaption a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.textContent).toContain('USGS / public domain');
    expect(root.textContent).toContain('The Great Volcano dominates its horizon.');
    expect(root.textContent).toContain('Volcanic landscapes can be fertile and dangerous.');
    expect(root.textContent).toContain('Known location: Q0, R0');
    expect(root.textContent).toContain('Living Stone');
  });

  it('emits actions and related selection callbacks', () => {
    const onAction = vi.fn();
    const onSelectRelated = vi.fn();
    const root = createWonderCodexPage(page(), { onAction, onSelectRelated });

    root.querySelector<HTMLElement>('[data-codex-action="view-map"]')?.click();
    root.querySelector<HTMLElement>('[data-codex-related="sacred_mountain"]')?.click();

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'view-map', wonderId: 'great_volcano' }));
    expect(onSelectRelated).toHaveBeenCalledWith('sacred_mountain');
  });

  it('uses expandable sections on mobile without duplicating content', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'mobile',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelectorAll('details[data-codex-section]')).toHaveLength(2);
    root.querySelector<HTMLElement>('summary')?.click();
    root.querySelector<HTMLElement>('summary')?.click();
    expect(root.textContent?.match(/Smoke and mineral color/g)).toHaveLength(1);
  });

  it('renders visual-only replay control for natural wonder spectacle', () => {
    const onAction = vi.fn();
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction,
      onSelectRelated: vi.fn(),
    });

    const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]');
    expect(replay).toBeTruthy();
    expect(replay!.textContent).toContain('Replay animation');
    expect(replay!.getAttribute('aria-label')).toBe('Replay Great Volcano animation');
    expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();

    replay!.click();
    expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3600);
    expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();
  });

  it('does not render replay for legendary pages or promise video playback', () => {
    const root = createWonderCodexPage(page({
      id: 'oracle-of-delphi',
      kind: 'legendary',
      title: 'Oracle of Delphi',
      stateLabel: 'Legendary wonder',
      actions: [],
    }), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('[data-codex-replay-animation]')).toBeNull();
    expect(root.textContent).not.toContain('Play video');
  });

  it('keeps reduced-motion Codex spectacle static', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      reducedMotion: true,
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('[data-wonder-spectacle-mode="codex-static"]')).toBeTruthy();
    const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]');
    expect(replay?.disabled).toBe(true);
    expect(replay?.getAttribute('aria-label')).toContain('reduced motion');
    replay?.click();
    expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeNull();
  });

  it('restarts visual replay cleanly when clicked twice', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]')!;

    replay.click();
    vi.advanceTimersByTime(1800);
    replay.click();
    vi.advanceTimersByTime(2000);
    expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();

    vi.advanceTimersByTime(1800);
    expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();
  });
});
