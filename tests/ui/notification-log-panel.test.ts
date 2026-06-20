// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import type { NotificationEntry } from '@/core/notification-log';

describe('notification log panel', () => {
  it('uses semantic close and review buttons and marks reviewed entries read', () => {
    const onClose = vi.fn();
    const onReviewPirate = vi.fn();
    const onMarkRead = vi.fn();
    const review = { kind: 'pirate-faction' as const, factionId: 'pirate-1' };
    const panel = createNotificationLogPanel([
      { id: 'notification-3', message: 'Pirates demand tribute.', type: 'warning', turn: 8, read: false, review },
    ], {
      onClose,
      onFocusTarget: vi.fn(),
      onReviewPirate,
      onMarkRead,
    });

    const close = panel.querySelector('#close-log');
    const reviewButton = panel.querySelector('[data-review-pirate]');
    expect(close?.tagName).toBe('BUTTON');
    expect(close?.getAttribute('aria-label')).toBe('Close message log');
    expect(reviewButton?.tagName).toBe('BUTTON');

    (reviewButton as HTMLButtonElement).click();
    expect(onMarkRead).toHaveBeenCalledWith('notification-3');
    expect(onReviewPirate).toHaveBeenCalledWith(review);
    (close as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('renders target-bearing entries as focusable rows', () => {
    const target = {
      kind: 'map' as const,
      coord: { q: 5, r: 4 },
      label: 'Barbarian raiders',
    };
    const onFocusTarget = vi.fn();
    const entries: NotificationEntry[] = [
      { id: 'notification-1', message: 'Barbarian raiders spotted!', type: 'warning', turn: 7, read: false, target },
    ];

    const panel = createNotificationLogPanel(entries, {
      onClose: vi.fn(),
      onFocusTarget,
    });
    const row = panel.querySelector('[data-notification-target="map"]') as HTMLElement | null;

    expect(row).not.toBeNull();
    row?.click();
    expect(onFocusTarget).toHaveBeenCalledWith(target);
  });

  it('renders city-linked entries as clickable and fires onOpenCity on click', () => {
    const onOpenCity = vi.fn();
    const entries: NotificationEntry[] = [
      { id: 'notification-2', message: 'Carthage can start Oracle of Delphi. Tap to open that city.', type: 'info', turn: 5, read: false, linkedCityId: 'city-1' },
    ];

    const panel = createNotificationLogPanel(entries, {
      onClose: vi.fn(),
      onFocusTarget: vi.fn(),
      onOpenCity,
    });

    const row = panel.querySelector('[data-notification-city]') as HTMLElement | null;
    expect(row).not.toBeNull();
    row?.click();
    expect(onOpenCity).toHaveBeenCalledWith('city-1');
  });
});
