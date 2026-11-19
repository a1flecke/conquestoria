// src/ui/notification-routes/notification-sink.ts
// #1250: the delivery contract shared by notification routers.
import type { CombatNotificationDetails, NotificationCityAction, NotificationEntry } from '@/core/notification-log';

type HandoffWarning = 'ai:strategic-warning' | 'supply:warning';

export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  cityActions?: NotificationCityAction[],
  // #594 MR7: transient presentation-only cue id (e.g. 'religion-founded'). Never
  // persisted -- deliver() does not pass this to appendNotification, so it has no
  // effect on the notification log or save schema. See ReligionAudioDirector.playCue.
  sfxCue?: string,
  combatDetails?: CombatNotificationDetails,
  handoffWarning?: HandoffWarning,
) => void;

export function deliverViewerWarning(
  sink: NotificationSink,
  viewerId: string,
  presentation: Pick<NotificationEntry, 'message' | 'type' | 'target'>,
  handoffWarning?: HandoffWarning,
): void {
  const { message, type, target } = presentation;
  if (handoffWarning) {
    sink(viewerId, message, type, target, undefined, undefined, undefined, handoffWarning);
  } else {
    sink(viewerId, message, type, target);
  }
}
