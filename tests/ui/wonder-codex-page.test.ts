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
    const onReplayNaturalWonder = vi.fn();
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction,
      onSelectRelated: vi.fn(),
      onReplayNaturalWonder,
    });

    const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]');
    expect(replay).toBeTruthy();
    expect(replay!.textContent).toContain('Replay animation');
    expect(replay!.getAttribute('aria-label')).toBe('Replay Great Volcano animation');
    expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();

    replay!.click();
    expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
    expect(onReplayNaturalWonder).toHaveBeenCalledWith('great_volcano');

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

  it('renders compact landmark preview without adding rival actions', () => {
    const root = createWonderCodexPage(page({
      id: 'oracle-of-delphi',
      kind: 'legendary',
      title: 'Oracle of Delphi',
      subtitle: 'A sanctuary of prophecy.',
      stateLabel: 'Completed',
      visual: getWonderVisualDefinition('oracle-of-delphi'),
      actions: [],
      landmarkPreview: {
        cityId: 'city-river',
        cityName: 'River City',
        items: [{
          wonderId: 'oracle-of-delphi',
          label: 'Oracle of Delphi',
          state: 'completed',
        }],
      },
    }), { onAction: () => {}, onSelectRelated: () => {} });

    expect(root.querySelector('[data-section="legendary-landmark-preview"]')?.textContent).toContain('Oracle of Delphi');
    expect(root.querySelector('[data-codex-action="open-city"]')).toBeNull();
  });

  it('keeps reduced-motion Codex spectacle static', () => {
    const onReplayNaturalWonder = vi.fn();
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      reducedMotion: true,
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
      onReplayNaturalWonder,
    });

    expect(root.querySelector('[data-wonder-spectacle-mode="codex-static"]')).toBeTruthy();
    const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]');
    expect(replay?.disabled).toBe(true);
    expect(replay?.getAttribute('aria-label')).toContain('reduced motion');
    replay?.click();
    expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeNull();
    expect(onReplayNaturalWonder).not.toHaveBeenCalled();
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

function legendaryPage(overrides: Partial<WonderCodexPageViewModel> = {}): WonderCodexPageViewModel {
  return page({
    id: 'oracle-of-delphi',
    kind: 'legendary',
    title: 'Oracle of Delphi',
    subtitle: 'A sanctuary of prophecy.',
    stateLabel: 'Quest in progress',
    actions: [],
    sections: [],
    relatedEntries: [],
    ...overrides,
  });
}

describe('wonder-codex-page — legendary UI redesign', () => {
  it('renders a status badge element for legendary wonders', () => {
    const root = createWonderCodexPage(legendaryPage({ stateLabel: 'Quest in progress' }), {
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });
    const badge = root.querySelector('[data-codex-status-badge]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Quest in progress');
  });

  it('renders a primary Start Construction button when canStartBuild is true', () => {
    const root = createWonderCodexPage(legendaryPage({
      canStartBuild: true,
      stateLabel: 'Available',
      actions: [{ type: 'open-city', label: 'Open City', wonderId: 'oracle-of-delphi', cityId: 'c1' }],
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    const primaryBtn = root.querySelector('[data-codex-action="start-construction"]') as HTMLButtonElement | null;
    expect(primaryBtn).not.toBeNull();
    expect(root.querySelectorAll('[data-codex-action="open-city"]')).toHaveLength(0);
  });

  it('does not render a primary Start Construction button when canStartBuild is false', () => {
    const root = createWonderCodexPage(legendaryPage({
      canStartBuild: false,
      actions: [{ type: 'open-city', label: 'Open City', wonderId: 'oracle-of-delphi', cityId: 'c1' }],
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    expect(root.querySelector('[data-codex-action="start-construction"]')).toBeNull();
    expect(root.querySelector('[data-codex-action="open-city"]')).not.toBeNull();
  });

  it('renders quest steps as a checklist when questSteps is present', () => {
    const root = createWonderCodexPage(legendaryPage({
      questSteps: [
        { id: 'q1', description: 'Discover a natural wonder', completed: true },
        { id: 'q2', description: 'Establish a trade route', completed: false },
      ],
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    const checklist = root.querySelector('[data-codex-quest-steps]');
    expect(checklist).not.toBeNull();
    const items = checklist?.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items?.[0]?.dataset.completed).toBe('true');
    expect(items?.[1]?.dataset.completed).toBe('false');
    expect(items?.[0]?.textContent).toContain('Discover a natural wonder');
  });

  it('fires onAction with the open-city action when Start Construction is clicked', () => {
    const onAction = vi.fn();
    const cityAction = { type: 'open-city' as const, label: 'Open City', wonderId: 'oracle-of-delphi', cityId: 'c1' };
    const root = createWonderCodexPage(legendaryPage({
      canStartBuild: true,
      actions: [cityAction],
    }), { onAction, onSelectRelated: vi.fn() });

    root.querySelector<HTMLElement>('[data-codex-action="start-construction"]')?.click();
    expect(onAction).toHaveBeenCalledWith(cityAction);
  });
});
