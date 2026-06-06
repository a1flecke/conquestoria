// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderCodexPageViewModel } from '@/systems/wonder-codex/presentation';
import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';
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

function videoPreview(surface: WonderVideoPreviewView['surface'] = 'codex'): WonderVideoPreviewView {
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

  it('renders supported Codex video previews without hiding actions', () => {
    const root = createWonderCodexPage(page({ videoPreview: videoPreview('codex') }), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('[data-wonder-video-view]')).toBeTruthy();
    expect(root.querySelector('video')).toBeTruthy();
    expect(root.querySelector('[data-codex-action="view-map"]')).toBeTruthy();
    expect(root.textContent).toContain('View on Map');
  });

  it('renders a still fallback instead of video on reduced-motion Codex pages', () => {
    const root = createWonderCodexPage(page({ videoPreview: videoPreview('codex') }), {
      mode: 'desktop',
      reducedMotion: true,
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('[data-wonder-video-view]')).toBeTruthy();
    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('[data-wonder-video-view] img')?.getAttribute('src')).toBe('/images/wonders/codex/volcano.jpg');
  });

  it('keeps Codex actions reachable after video fallback', () => {
    const root = createWonderCodexPage(page({ videoPreview: videoPreview('codex') }), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    root.querySelector('video')?.dispatchEvent(new Event('error'));

    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('[data-codex-action="view-map"]')).toBeTruthy();
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

  it('renders known-rival landmark preview without rival actions', () => {
    const root = createWonderCodexPage(page({
      id: 'oracle-of-delphi',
      kind: 'legendary',
      title: 'Oracle of Delphi',
      subtitle: 'A sanctuary of prophecy.',
      stateLabel: 'Known rival completed',
      visual: getWonderVisualDefinition('oracle-of-delphi'),
      actions: [],
      landmarkPreview: undefined,
      knownRivalLandmarkPreview: {
        cityName: 'Rival Harbor',
        civName: 'Rival',
        learnedTurn: 62,
        items: [{
          wonderId: 'oracle-of-delphi',
          label: 'Oracle of Delphi',
          state: 'completed',
        }],
      },
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    expect(root.querySelector('[data-section="known-rival-landmark-preview"]')?.textContent).toContain('Known rival landmark');
    expect(root.textContent).toContain('Rival Harbor');
    expect(root.textContent).toContain('Location learned on turn 62');
    expect(root.querySelector('[data-codex-action="open-city"]')).toBeNull();
    expect(root.querySelector('[data-codex-action="view-map"]')).toBeNull();
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

describe('wonder-codex-page — rival intel journal section', () => {
  it('renders the rival intel section with summary and event rows when rivalIntel is present', () => {
    const root = createWonderCodexPage(legendaryPage({
      stateLabel: 'Spotted rival project',
      rivalIntel: {
        wonderId: 'oracle-of-delphi',
        activityCount: 1,
        badgeLabel: 'Known rival activity',
        stateLabel: 'Spotted rival project',
        summaryLine: 'Last known: under construction. Rival began Oracle of Delphi in Rival Harbor on turn 41.',
        events: [{
          id: 'started:oracle-of-delphi:ai-1:rival-city:41',
          kind: 'started',
          civId: 'ai-1',
          civName: 'Rival',
          turn: 41,
          title: 'Spotted rival project',
          text: 'Rival began Oracle of Delphi in Rival Harbor on turn 41.',
        }],
      },
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    const section = root.querySelector('[data-rival-intel-section]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Known rival activity');
    expect(section?.textContent).toContain('Last known: under construction');

    const events = section?.querySelectorAll('[data-rival-intel-event]');
    expect(events).toHaveLength(1);
    expect(events?.[0]?.getAttribute('data-rival-intel-event')).toBe('started');
    expect(events?.[0]?.textContent).toContain('Rival began Oracle of Delphi in Rival Harbor on turn 41');
  });

  it('renders multiple rival intel events in order', () => {
    const root = createWonderCodexPage(legendaryPage({
      stateLabel: 'Known rival completed',
      rivalIntel: {
        wonderId: 'oracle-of-delphi',
        activityCount: 2,
        badgeLabel: '2 rival records',
        stateLabel: 'Known rival completed',
        summaryLine: 'Known rival completed: Rival completed Oracle of Delphi on turn 58.',
        events: [
          {
            id: 'started:oracle-of-delphi:ai-1:41',
            kind: 'started',
            civId: 'ai-1',
            civName: 'Rival',
            turn: 41,
            title: 'Spotted rival project',
            text: 'Rival began Oracle of Delphi in Rival Harbor on turn 41.',
          },
          {
            id: 'completed:oracle-of-delphi:ai-1:58',
            kind: 'completed',
            civId: 'ai-1',
            civName: 'Rival',
            turn: 58,
            title: 'Known rival completed',
            text: 'Rival completed Oracle of Delphi on turn 58.',
          },
        ],
      },
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    const events = root.querySelectorAll('[data-rival-intel-event]');
    expect(events).toHaveLength(2);
    expect(events[0]?.getAttribute('data-rival-intel-event')).toBe('started');
    expect(events[1]?.getAttribute('data-rival-intel-event')).toBe('completed');
  });

  it('renders no rival action buttons in the rival intel section', () => {
    const root = createWonderCodexPage(legendaryPage({
      stateLabel: 'Known rival completed',
      actions: [],
      rivalIntel: {
        wonderId: 'oracle-of-delphi',
        activityCount: 1,
        badgeLabel: 'Known rival activity',
        stateLabel: 'Known rival completed',
        summaryLine: 'Known rival completed: Rival completed Oracle of Delphi on turn 58.',
        events: [{
          id: 'completed:oracle-of-delphi:ai-1:58',
          kind: 'completed',
          civId: 'ai-1',
          civName: 'Rival',
          turn: 58,
          title: 'Known rival completed',
          text: 'Rival completed Oracle of Delphi on turn 58.',
        }],
      },
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    const section = root.querySelector('[data-rival-intel-section]');
    expect(section).not.toBeNull();
    expect(section?.querySelector('button')).toBeNull();
    expect(section?.querySelector('[data-codex-action]')).toBeNull();
    expect(root.textContent).not.toContain('Reward:');
    expect(root.textContent).not.toContain('Open City');
    expect(root.textContent).not.toContain('View on Map');
  });

  it('does not render the rival intel section when rivalIntel is absent', () => {
    const root = createWonderCodexPage(legendaryPage({ stateLabel: 'Quest in progress' }), {
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.querySelector('[data-rival-intel-section]')).toBeNull();
  });
});
