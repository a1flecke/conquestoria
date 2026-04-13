import type { GameState, Quest } from '@/core/types';
import type { NotificationEntry } from '@/ui/notification-log';
import { getQuestIssuedMessageForPlayer } from '@/systems/quest-system';
import {
  formatMinorCivEventMessageForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';

export type MinorCivNotificationEvent =
  | { type: 'minor-civ:quest-issued'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'minor-civ:quest-completed'; majorCivId: string; minorCivId: string; reward: { gold?: number; science?: number } }
  | { type: 'minor-civ:evolved'; minorCivId: string }
  | { type: 'minor-civ:destroyed'; minorCivId: string }
  | { type: 'minor-civ:allied'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:relationship-threshold'; majorCivId: string; minorCivId: string; newStatus: string }
  | { type: 'minor-civ:guerrilla'; targetCivId: string; minorCivId: string }
  | { type: 'minor-civ:quest-expired'; majorCivId: string; minorCivId: string };

function getTargetedMinorCivPresentation(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): ReturnType<typeof getMinorCivPresentationForPlayer> | null {
  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId, 'City-state');
  return presentation.known ? presentation : null;
}

function getQuestCompletedMessage(minorCivName: string, reward: { gold?: number; science?: number }): string {
  const rewards: string[] = [];
  if (reward.gold) rewards.push(`+${reward.gold} gold`);
  if (reward.science) rewards.push(`+${reward.science} science`);

  if (rewards.length === 0) {
    return `${minorCivName} is grateful!`;
  }

  return `${minorCivName} is grateful! ${rewards.join(', ')}`;
}

export function getMinorCivNotification(
  state: GameState,
  viewerCivId: string,
  event: MinorCivNotificationEvent,
): NotificationEntry | null {
  if (event.type === 'minor-civ:evolved') {
    return {
      message: formatMinorCivEventMessageForPlayer(state, viewerCivId, event.minorCivId, 'evolved'),
      type: 'info',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:destroyed') {
    return {
      message: formatMinorCivEventMessageForPlayer(state, viewerCivId, event.minorCivId, 'destroyed'),
      type: 'warning',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:guerrilla') {
    if (event.targetCivId !== viewerCivId) {
      return null;
    }

    return {
      message: formatMinorCivEventMessageForPlayer(state, viewerCivId, event.minorCivId, 'guerrilla'),
      type: 'warning',
      turn: state.turn,
    };
  }

  if (event.majorCivId !== viewerCivId) {
    return null;
  }

  const presentation = getTargetedMinorCivPresentation(state, viewerCivId, event.minorCivId);
  if (!presentation) {
    return null;
  }

  if (event.type === 'minor-civ:quest-issued') {
    return {
      message: getQuestIssuedMessageForPlayer(state, viewerCivId, presentation.name, event.quest),
      type: 'info',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:quest-completed') {
    return {
      message: getQuestCompletedMessage(presentation.name, event.reward),
      type: 'success',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:allied') {
    return {
      message: `${presentation.name} is now your ally!`,
      type: 'success',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:relationship-threshold') {
    return {
      message: `${presentation.name} now considers you ${event.newStatus}`,
      type: 'info',
      turn: state.turn,
    };
  }

  return {
    message: `Quest from ${presentation.name} has expired`,
    type: 'info',
    turn: state.turn,
  };
}
