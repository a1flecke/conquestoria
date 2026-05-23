// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { LegendaryWonderCompletionCeremonyAction } from '@/ui/legendary-wonder-completion-ceremony';
import { createLegendaryWonderCompletionQueue } from '@/ui/legendary-wonder-completion-queue';

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
    rewardSummary: '+60 research immediately',
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition('oracle-of-delphi'),
    ...overrides,
  };
}

describe('legendary-wonder-completion-queue', () => {
  it('waits for action settlement and blocking UI before presenting', () => {
    let blocked = true;
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createLegendaryWonderCompletionQueue({
      container: document.body,
      isInteractionBlocked: () => blocked,
      reducedMotion: () => false,
      openCity: vi.fn(),
      openJournal: vi.fn(),
      present,
    });

    queue.enqueue(item());
    queue.notifyActionSettled();
    expect(present).not.toHaveBeenCalled();

    blocked = false;
    queue.pump();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('opens city or journal after the ceremony resolves', async () => {
    const calls: string[] = [];
    const queue = createLegendaryWonderCompletionQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      reducedMotion: () => false,
      openCity: cityId => calls.push(`city:${cityId}`),
      openJournal: (cityId, wonderId) => calls.push(`journal:${cityId}:${wonderId}`),
      present: () => Promise.resolve('open-journal'),
    });

    queue.enqueue(item());
    queue.notifyActionSettled();
    await Promise.resolve();

    expect(calls).toEqual(['journal:city-river:oracle-of-delphi']);

    const cityQueue = createLegendaryWonderCompletionQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      reducedMotion: () => false,
      openCity: cityId => calls.push(`city:${cityId}`),
      openJournal: vi.fn(),
      present: () => Promise.resolve('open-city'),
    });
    cityQueue.enqueue(item({ turnCompleted: 43 }));
    cityQueue.notifyActionSettled();
    await Promise.resolve();

    expect(calls).toContain('city:city-river');
  });

  it('does not present wrong-viewer items represented by null presentation output', () => {
    const present = vi.fn(() => Promise.resolve('continue' as const));
    const queue = createLegendaryWonderCompletionQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      reducedMotion: () => false,
      openCity: vi.fn(),
      openJournal: vi.fn(),
      present,
    });

    queue.enqueue(null);
    queue.notifyActionSettled();

    expect(present).not.toHaveBeenCalled();
  });

  it('deduplicates repeat enqueue for the same civ/wonder/turn', () => {
    const present = vi.fn(() => Promise.resolve('continue' as LegendaryWonderCompletionCeremonyAction));
    const queue = createLegendaryWonderCompletionQueue({
      container: document.body,
      isInteractionBlocked: () => false,
      reducedMotion: () => false,
      openCity: vi.fn(),
      openJournal: vi.fn(),
      present,
    });

    queue.enqueue(item());
    queue.enqueue(item());
    queue.notifyActionSettled();

    expect(queue.pendingCount()).toBe(0);
    expect(present).toHaveBeenCalledTimes(1);
  });
});
