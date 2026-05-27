// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import type { NotificationEntry } from '@/ui/notification-log';

describe('notification log panel', () => {
  it('renders target-bearing entries as focusable rows', () => {
    const target = {
      kind: 'map' as const,
      coord: { q: 5, r: 4 },
      label: 'Barbarian raiders',
    };
    const onFocusTarget = vi.fn();
    const entries: NotificationEntry[] = [
      { message: 'Barbarian raiders spotted!', type: 'warning', turn: 7, target },
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
      { message: 'Carthage can start Oracle of Delphi. Tap to open that city.', type: 'info', turn: 5, linkedCityId: 'city-1' },
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
