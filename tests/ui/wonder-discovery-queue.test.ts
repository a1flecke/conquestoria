// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';
import { createWonderDiscoveryRevealQueue } from '@/ui/wonder-discovery-queue';

function item(wonderId: string, q: number): WonderDiscoveryRevealItem {
  return {
    title: 'Natural Wonder Discovered',
    wonderId,
    civId: 'player',
    coord: { q, r: 0 },
    name: wonderId === 'great_volcano' ? 'Great Volcano' : 'Crystal Caverns',
    revealLine: 'A discovery line.',
    effectSummary: 'Yields +1 Science',
    rewardSummary: '+30 Science discovery reward',
    visual: getWonderVisualDefinition(wonderId),
    motionAssetId: null,
  };
}

describe('wonder-discovery-queue', () => {
  it('waits for action-settled before presenting the first ceremony', () => {
    const presented: WonderDiscoveryRevealItem[] = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: reveal => { presented.push(reveal); return Promise.resolve('continue'); },
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.pump();
    expect(presented).toHaveLength(0);

    queue.notifyActionSettled();
    expect(presented).toHaveLength(1);
  });

  it('plays multiple items one at a time in event order', async () => {
    const resolvers: Array<(action: WonderDiscoveryCeremonyAction) => void> = [];
    const requestMapHighlight = vi.fn();
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: reveal => new Promise(resolve => { resolvers.push(resolve); document.body.dataset.activeWonder = reveal.wonderId; }),
      requestMapHighlight,
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.enqueue(item('crystal_caverns', 4));
    queue.notifyActionSettled();

    expect(document.body.dataset.activeWonder).toBe('great_volcano');
    resolvers[0]('continue');
    await Promise.resolve();
    expect(requestMapHighlight).toHaveBeenCalledWith(expect.objectContaining({ wonderId: 'great_volcano' }), false);
    expect(document.body.dataset.activeWonder).toBe('crystal_caverns');
  });

  it('waits while another blocking UI is active and resumes when pumped', () => {
    let blocked = true;
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => blocked,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    expect(present).not.toHaveBeenCalled();

    blocked = false;
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('opens Atlas after requesting the map highlight for open-atlas resolution', async () => {
    const calls: string[] = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: () => Promise.resolve('open-atlas'),
      requestMapHighlight: reveal => { calls.push(`highlight:${reveal.wonderId}`); },
      openAtlas: wonderId => { calls.push(`atlas:${wonderId}`); },
      reducedMotion: () => true,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();

    expect(calls).toEqual(['highlight:great_volcano', 'atlas:great_volcano']);
  });

  it('dedupes a same-session civ and wonder reveal after one is queued', () => {
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();

    expect(queue.pendingCount()).toBe(0);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh action-settled signal for a later discovery after the queue drains', async () => {
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present,
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);

    queue.enqueue(item('crystal_caverns', 4));
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);

    queue.notifyActionSettled();
    expect(present).toHaveBeenCalledTimes(2);
  });

  it('marks the ceremony as blocking only while the reveal is active', async () => {
    const overlays: Array<string | null> = [];
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: () => Promise.resolve('continue'),
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
      setBlockingOverlay: id => overlays.push(id),
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();
    await Promise.resolve();

    expect(overlays).toEqual(['wonder-discovery-ceremony', null]);
  });

  it('notifies when a reveal starts so audio can play in sync with the ceremony', () => {
    const onRevealStarted = vi.fn();
    const queue = createWonderDiscoveryRevealQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      present: () => Promise.resolve('continue'),
      requestMapHighlight: vi.fn(),
      openAtlas: vi.fn(),
      reducedMotion: () => false,
      onRevealStarted,
    });

    queue.enqueue(item('great_volcano', 2));
    queue.notifyActionSettled();

    expect(onRevealStarted).toHaveBeenCalledWith(expect.objectContaining({ wonderId: 'great_volcano' }));
  });
});
