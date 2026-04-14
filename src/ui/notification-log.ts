export interface NotificationEntry {
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
}

export type NotificationLog = Record<string, NotificationEntry[]>;

const MAX_PER_PLAYER = 50;

export function createNotificationLog(): NotificationLog {
  return {};
}

export function appendNotification(log: NotificationLog, civId: string, entry: NotificationEntry): void {
  const list = log[civId] ?? (log[civId] = []);
  list.push(entry);
  if (list.length > MAX_PER_PLAYER) list.shift();
}

export function getNotificationsForPlayer(log: NotificationLog, civId: string): NotificationEntry[] {
  return log[civId] ?? [];
}
