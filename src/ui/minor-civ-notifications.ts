import type { GameState, Quest, QuestReward } from '@/core/types';
import type { NotificationDraft } from '@/core/notification-log';
import { getQuestDescriptionForPlayer, getQuestIssuedMessageForPlayer } from '@/systems/quest-system';
import { formatQuestReward } from '@/systems/quest-presentation';
import {
  formatMinorCivEventMessageForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';

export type MinorCivNotificationEvent =
  | { type: 'minor-civ:quest-issued'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'minor-civ:quest-progressed'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'minor-civ:quest-retargeted'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'minor-civ:quest-cancelled'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:quest-chain-pending'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:quest-completed'; majorCivId: string; minorCivId: string; reward: QuestReward }
  | { type: 'minor-civ:evolved'; minorCivId: string }
  | { type: 'minor-civ:destroyed'; minorCivId: string }
  | { type: 'minor-civ:allied'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:alliance-broken'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:relationship-threshold'; majorCivId: string; minorCivId: string; newStatus: string }
  | { type: 'minor-civ:guerrilla'; targetCivId: string; minorCivId: string }
  | { type: 'minor-civ:production-completed'; minorCivId: string; cityId: string; itemId: string; itemClass: 'building' | 'unit' }
  | { type: 'minor-civ:quest-expired'; majorCivId: string; minorCivId: string };

function getTargetedMinorCivPresentation(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): ReturnType<typeof getMinorCivPresentationForPlayer> | null {
  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId, 'City-state');
  return presentation.known ? presentation : null;
}

function getQuestCompletedMessage(minorCivName: string, reward: QuestReward): string {
  return `${minorCivName} is grateful! ${formatQuestReward(reward)}`;
}

export function getMinorCivNotification(
  state: GameState,
  viewerCivId: string,
  event: MinorCivNotificationEvent,
): NotificationDraft | null {
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

  if (event.type === 'minor-civ:production-completed') {
    const presentation = getTargetedMinorCivPresentation(state, viewerCivId, event.minorCivId);
    if (!presentation) {
      return null;
    }

    return {
      message: event.itemClass === 'unit'
        ? `${presentation.name} is strengthening its defenses.`
        : `${presentation.name} is growing more prosperous.`,
      type: event.itemClass === 'unit' ? 'warning' : 'info',
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

  if (event.type === 'minor-civ:quest-progressed') {
    const description = getQuestDescriptionForPlayer(state, viewerCivId, event.quest);
    return { message: `Progress for ${presentation.name}: ${description}`, type: 'info', turn: state.turn };
  }

  if (event.type === 'minor-civ:quest-retargeted') {
    const description = getQuestDescriptionForPlayer(state, viewerCivId, event.quest);
    return { message: `${presentation.name} updated your objective: ${description}`, type: 'info', turn: state.turn };
  }

  if (event.type === 'minor-civ:quest-chain-pending') {
    return { message: `${presentation.name} is preparing your next alliance objective`, type: 'info', turn: state.turn };
  }

  if (event.type === 'minor-civ:quest-cancelled') {
    return { message: `${presentation.name} could not offer a feasible alliance objective`, type: 'info', turn: state.turn };
  }

  if (event.type === 'minor-civ:allied') {
    return {
      message: `${presentation.name} is now your ally!`,
      type: 'success',
      turn: state.turn,
    };
  }

  if (event.type === 'minor-civ:alliance-broken') {
    return { message: `Your durable alliance with ${presentation.name} has been broken`, type: 'warning', turn: state.turn };
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
