import type { GameEvents, GameState } from '@/core/types';
import { getWitnessCivIds } from '@/systems/crisis-interaction-system';

/**
 * The one authoritative audience contract for espionage notifications (#1201).
 *
 * Before this, every `route*` function in `notification-routing.ts` hand-listed its
 * recipients ("Both sides must be told"), so adding a new mission consequence had no
 * generic test that each intended party received exactly one message. Here the
 * recipients and their role are derived from the event's typed parties (plus the
 * existing witness rule), and the routers only turn a role into copy. A new
 * notification event cannot silently omit or duplicate a required party because the
 * exhaustive `ESPIONAGE_NOTIFICATION_ROUTES` record in `notification-routing.ts` is
 * typed over `EspionageNotificationEventType`, and the generic test asserts every
 * route's delivered audience equals this contract's.
 */
export type EspionageNotificationEventType =
  | 'espionage:sabotage-relief-discovered'
  | 'espionage:city-flipped'
  | 'espionage:courier-intercepted'
  | 'espionage:official-bribed'
  | 'espionage:scandal-exposed'
  | 'espionage:intel-report-acquired';

export type EspionageNotificationEvent =
  | (GameEvents['espionage:sabotage-relief-discovered'] & { type: 'espionage:sabotage-relief-discovered' })
  | (GameEvents['espionage:city-flipped'] & { type: 'espionage:city-flipped' })
  | (GameEvents['espionage:courier-intercepted'] & { type: 'espionage:courier-intercepted' })
  | (GameEvents['espionage:official-bribed'] & { type: 'espionage:official-bribed' })
  | (GameEvents['espionage:scandal-exposed'] & { type: 'espionage:scandal-exposed' })
  | (GameEvents['espionage:intel-report-acquired'] & { type: 'espionage:intel-report-acquired' });

/**
 * The part a recipient plays in an event. The router maps this to copy; it is never
 * used to decide *whether* a civ is told — only the contract above does that.
 */
export type EspionageRecipientRole = 'actor' | 'target' | 'partner' | 'witness';

export interface EspionageRecipient {
  civId: string;
  role: EspionageRecipientRole;
}

/** The canonical list of espionage events that deliver a player-visible notification. */
export const ESPIONAGE_NOTIFICATION_EVENT_TYPES = [
  'espionage:sabotage-relief-discovered',
  'espionage:city-flipped',
  'espionage:courier-intercepted',
  'espionage:official-bribed',
  'espionage:scandal-exposed',
  'espionage:intel-report-acquired',
] as const satisfies readonly EspionageNotificationEventType[];

/**
 * Exactly the civs that must each receive one message for this event, with the role
 * that drives their copy. Deduped by civ id (first role wins), so a party can never
 * be told twice.
 */
export function getEspionageNotificationAudience(
  state: GameState,
  event: EspionageNotificationEvent,
): EspionageRecipient[] {
  switch (event.type) {
    case 'espionage:sabotage-relief-discovered':
      return dedupe([
        { civId: event.targetCivId, role: 'target' },
        ...getWitnessCivIds(state, event.actorCivId, event.targetCivId)
          .map((civId): EspionageRecipient => ({ civId, role: 'witness' })),
      ]);
    case 'espionage:city-flipped':
      return dedupe([
        { civId: event.civId, role: 'actor' },
        { civId: event.victimCivId, role: 'target' },
      ]);
    case 'espionage:courier-intercepted':
      return dedupe([
        { civId: event.civId, role: 'actor' },
        { civId: event.targetCivId, role: 'target' },
      ]);
    case 'espionage:official-bribed':
      return dedupe([
        { civId: event.civId, role: 'actor' },
        { civId: event.targetCivId, role: 'target' },
      ]);
    case 'espionage:scandal-exposed':
      return dedupe([
        { civId: event.civId, role: 'actor' },
        { civId: event.targetCivId, role: 'target' },
        ...event.partnerCivIds.map((civId): EspionageRecipient => ({ civId, role: 'partner' })),
      ]);
    case 'espionage:intel-report-acquired':
      return [{ civId: event.civId, role: 'actor' }];
  }
}

function dedupe(recipients: EspionageRecipient[]): EspionageRecipient[] {
  const seen = new Set<string>();
  const result: EspionageRecipient[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.civId)) continue;
    seen.add(recipient.civId);
    result.push(recipient);
  }
  return result;
}

/**
 * Coverage check used by the generic meta-test: returns every supplied event type that
 * the audience contract does not cover. Non-vacuous — a synthetic unknown event type
 * is reported, so a new notification event without a contract fails loudly.
 */
export function findUncoveredEspionageNotifications(
  eventTypes: readonly string[],
): string[] {
  const covered = new Set<string>(ESPIONAGE_NOTIFICATION_EVENT_TYPES);
  return eventTypes.filter(type => !covered.has(type));
}
