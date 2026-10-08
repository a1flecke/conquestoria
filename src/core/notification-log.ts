import type { CombatModifierFact } from './types/combat';
import type { HexCoord } from './types/hex';
import type { IdCounters } from './types/ids';

export interface NotificationMapTarget {
  kind: 'map';
  coord: HexCoord;
  label: string;
}

export interface NotificationCityAction {
  cityId: string;
  wonderId: string;
  label: string;
}

export type PirateNotificationReview =
  | { kind: 'pirate-faction'; factionId: string }
  | { kind: 'pirate-history'; historyId: string };

export interface CombatNotificationFact {
  label: string;
  operation: CombatModifierFact['operation'];
  value: number;
  outcome: CombatModifierFact['outcome'];
  redacted: boolean;
}

export interface CombatNotificationDetails {
  facts: CombatNotificationFact[];
}

export interface NotificationEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
  read: boolean;
  target?: NotificationMapTarget;
  linkedCityId?: string;
  cityActions?: NotificationCityAction[];
  review?: PirateNotificationReview;
  combatDetails?: CombatNotificationDetails;
}

export type NotificationDraft = Omit<NotificationEntry, 'id' | 'read'> & Partial<Pick<NotificationEntry, 'read'>>;
export type NotificationLog = Record<string, NotificationEntry[]>;

/** The notification-owned slice of `GameState` (#1361); `GameState` extends it unchanged. */
export interface NotificationLogState {
  notificationLog?: NotificationLog; // normalized on load; absent on legacy saves
  idCounters: IdCounters;
}

const MAX_PER_PLAYER = 50;

export function createNotificationLog(): NotificationLog {
  return {};
}

export function appendNotification(
  state: NotificationLogState,
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
