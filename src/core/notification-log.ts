import type { GameState, HexCoord } from './types';

export interface NotificationMapTarget {
  kind: 'map';
  coord: HexCoord;
  label: string;
}

export type PirateNotificationReview =
  | { kind: 'pirate-faction'; factionId: string }
  | { kind: 'pirate-history'; historyId: string };

export interface NotificationEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
  read: boolean;
  target?: NotificationMapTarget;
  linkedCityId?: string;
  review?: PirateNotificationReview;
}

export type NotificationDraft = Omit<NotificationEntry, 'id' | 'read'> & Partial<Pick<NotificationEntry, 'read'>>;
export type NotificationLog = Record<string, NotificationEntry[]>;

const MAX_PER_PLAYER = 50;

export function createNotificationLog(): NotificationLog {
  return {};
}

export function appendNotification(
  state: Pick<GameState, 'notificationLog' | 'idCounters'>,
  civId: string,
  draft: NotificationDraft,
): NotificationEntry {
  state.notificationLog ??= createNotificationLog();
  const nextId = state.idCounters.nextNotificationId ?? 1;
  state.idCounters.nextNotificationId = nextId + 1;
  const entry: NotificationEntry = {
    ...draft,
    id: `notification-${nextId}`,
    read: draft.read ?? false,
  };
  const list = state.notificationLog[civId] ?? (state.notificationLog[civId] = []);
  list.push(entry);
  if (list.length > MAX_PER_PLAYER) list.shift();
  return entry;
}

export function getNotificationsForPlayer(log: NotificationLog, civId: string): NotificationEntry[] {
  return log[civId] ?? [];
}
