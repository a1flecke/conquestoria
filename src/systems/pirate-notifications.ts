import { appendNotification, createNotificationLog, type PirateNotificationReview } from '@/core/notification-log';
import type { GameState } from '@/core/types';

export type PirateNotificationEvent = {
  type: 'sighting' | 'raid' | 'relocated' | 'behavior-changed'
    | 'demand' | 'blockade' | 'contract-exposed' | 'destroyed';
  factionId: string;
  viewerId: string;
  amount?: number;
  cost?: number;
  cityId?: string;
  historyId?: string;
};

const ROUTINE_TYPES = new Set<PirateNotificationEvent['type']>([
  'sighting', 'raid', 'relocated', 'behavior-changed',
]);

function cloneForNotifications(state: GameState): GameState {
  return {
    ...state,
    notificationLog: Object.fromEntries(Object.entries(state.notificationLog ?? createNotificationLog())
      .map(([civId, entries]) => [civId, [...entries]])),
    idCounters: { ...state.idCounters },
  };
}

function eventKey(state: GameState, event: PirateNotificationEvent, grouped: boolean): string {
  return grouped
    ? `notification:${state.turn}:${event.viewerId}:routine`
    : `notification:${state.turn}:${event.viewerId}:${event.type}:${event.cityId ?? event.historyId ?? ''}`;
}

function alreadyEmitted(state: GameState, event: PirateNotificationEvent, key: string): boolean {
  const faction = state.pirates?.factions[event.factionId];
  if (faction?.transitionGuards.emittedEventKeys.includes(key)) return true;
  if (event.historyId) {
    return (state.notificationLog?.[event.viewerId] ?? []).some(entry =>
      entry.review?.kind === 'pirate-history' && entry.review.historyId === event.historyId);
  }
  return false;
}

function markEmitted(state: GameState, factionId: string, key: string): GameState {
  const faction = state.pirates?.factions[factionId];
  if (!faction || faction.transitionGuards.emittedEventKeys.includes(key)) return state;
  return {
    ...state,
    pirates: {
      ...state.pirates!,
      factions: {
        ...state.pirates!.factions,
        [factionId]: {
          ...faction,
          transitionGuards: {
            ...faction.transitionGuards,
            emittedEventKeys: [...faction.transitionGuards.emittedEventKeys, key],
          },
        },
      },
    },
  };
}

function individualDraft(event: PirateNotificationEvent): {
  message: string;
  type: 'info' | 'success' | 'warning';
  review: PirateNotificationReview;
  linkedCityId?: string;
} {
  const activeReview = { kind: 'pirate-faction' as const, factionId: event.factionId };
  switch (event.type) {
    case 'demand':
      return { message: `Pirates demand ${event.cost ?? 0} gold in tribute.`, type: 'warning', review: activeReview };
    case 'blockade':
      return { message: 'Pirates are blockading a coastal city.', type: 'warning', review: activeReview, ...(event.cityId ? { linkedCityId: event.cityId } : {}) };
    case 'contract-exposed':
      return { message: 'A pirate contract employer has been exposed.', type: 'warning', review: activeReview };
    case 'destroyed':
      return {
        message: 'A pirate faction has been destroyed.', type: 'success',
        review: { kind: 'pirate-history', historyId: event.historyId ?? '' },
      };
    default:
      return { message: 'Pirate activity reported.', type: 'info', review: activeReview };
  }
}

export function applyPirateNotifications(state: GameState, events: PirateNotificationEvent[]): GameState {
  let nextState = cloneForNotifications(state);
  const routineGroups = new Map<string, PirateNotificationEvent[]>();
  const individual: PirateNotificationEvent[] = [];
  for (const event of events) {
    if (ROUTINE_TYPES.has(event.type)) {
      const key = `${event.viewerId}:${event.factionId}`;
      routineGroups.set(key, [...(routineGroups.get(key) ?? []), event]);
    } else {
      individual.push(event);
    }
  }

  for (const group of routineGroups.values()) {
    const event = group[0]!;
    const key = eventKey(nextState, event, true);
    if (alreadyEmitted(nextState, event, key)) continue;
    appendNotification(nextState, event.viewerId, {
      message: `${group.length} pirate updates reported.`, type: 'info', turn: state.turn,
      review: { kind: 'pirate-faction', factionId: event.factionId },
    });
    nextState = markEmitted(nextState, event.factionId, key);
  }

  for (const event of individual) {
    const key = eventKey(nextState, event, false);
    if (alreadyEmitted(nextState, event, key)) continue;
    appendNotification(nextState, event.viewerId, {
      ...individualDraft(event), turn: state.turn,
    });
    nextState = markEmitted(nextState, event.factionId, key);
  }
  return nextState;
}

export function deliverPirateActivationWarnings(state: GameState): GameState {
  if (!state.pirates || state.pirates.activatedTurn === null) return state;
  let nextState = cloneForNotifications(state);
  const delivered = { ...state.pirates.activationWarningDeliveredByCiv };
  for (const civId of Object.keys(state.civilizations)) {
    if (delivered[civId]) continue;
    appendNotification(nextState, civId, {
      message: 'Rumors spread of organized pirate waters beyond the coast.',
      type: 'warning',
      turn: state.turn,
    });
    delivered[civId] = true;
  }
  return {
    ...nextState,
    pirates: { ...nextState.pirates!, activationWarningDeliveredByCiv: delivered },
  };
}
