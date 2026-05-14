import type { NotificationMapTarget } from '@/ui/notification-log';

export function formatNotificationTargetFocusMessage(
  target: NotificationMapTarget,
  isCurrentlyVisible: boolean,
): string {
  if (isCurrentlyVisible) {
    return `Focused ${target.label}.`;
  }
  return `${target.label} was last spotted here.`;
}
