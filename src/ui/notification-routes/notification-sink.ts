// src/ui/notification-routes/notification-sink.ts
// #1250: the one type every notification router writes through. A type-only leaf: routers depend on it,
// it depends on nothing but the notification-log shapes.
import type { CombatNotificationDetails, NotificationCityAction, NotificationEntry } from '@/core/notification-log';

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
) => void;
