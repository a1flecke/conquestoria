/**
 * #1766: player-facing border-confrontation commands, kept out of the general diplomacy controller so this feature
 * never competes for edits in `diplomacy-actions-controller.ts` / `panel-actions-shared.ts`. It is wired live through
 * `diplomacy-trade-panel-actions-controller.ts`, which owns the Diplomacy panel's callbacks.
 *
 * The controller only orchestrates: legality, the AI answer, the promise lifecycle and its consequences all live in
 * the canonical `@/systems/border-confrontation` domain.
 */
import type { EventBus } from '@/core/event-bus';
import type { GameSession } from '@/app/ports';
import { DIPLOMATIC_ACTION_DENIAL_MESSAGES } from '@/systems/diplomacy-actions';
import { applyDiplomaticAction } from '@/systems/diplomacy-system';
import {
  acceptWithdrawalDemand,
  getActiveBorderPromise,
  getLastBorderConfrontation,
  refuseWithdrawalDemand,
} from '@/systems/border-confrontation';

export interface BorderConfrontationActionsController {
  handleDemandWithdrawal(targetCivId: string): void;
  handleAcceptWithdrawalDemand(requestId: string): void;
  handleRefuseWithdrawalDemand(requestId: string): void;
}

export interface BorderConfrontationActionsControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  /** Re-render the open Diplomacy panel from post-mutation state. */
  readonly openDiplomacyPanel: () => void;
}

export function createBorderConfrontationActionsController(
  deps: BorderConfrontationActionsControllerDeps,
): BorderConfrontationActionsController {
  function handleDemandWithdrawal(targetCivId: string): void {
    const before = deps.session.getState();
    const actorId = before.currentPlayer;
    const targetName = before.civilizations[targetCivId]?.name ?? 'They';
    const attempt = applyDiplomaticAction(before, actorId, targetCivId, 'demand_withdrawal', deps.bus);
    if (!attempt.ok) {
      deps.showNotification(DIPLOMATIC_ACTION_DENIAL_MESSAGES[attempt.reason], 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    deps.session.commit(attempt.state);
    deps.openDiplomacyPanel();

    const after = deps.session.getState();
    const pending = (after.pendingDiplomacyRequests ?? []).some(request =>
      request.type === 'withdrawal' && request.fromCivId === actorId && request.toCivId === targetCivId);
    const promise = getActiveBorderPromise(after, actorId, targetCivId);
    if (pending) {
      deps.showNotification(`Withdrawal demand sent to ${targetName}. Awaiting their answer.`, 'info');
    } else if (promise) {
      deps.showNotification(`${targetName} promised to withdraw by turn ${promise.deadlineTurn}.`, 'success');
    } else if (getLastBorderConfrontation(after, actorId, targetCivId)?.status === 'refused') {
      deps.showNotification(`${targetName} refused to withdraw. Relations worsened; no war was declared.`, 'warning');
    } else {
      deps.showNotification('The demand is no longer available.', 'warning');
    }
  }

  function handleAcceptWithdrawalDemand(requestId: string): void {
    const before = deps.session.getState();
    const result = acceptWithdrawalDemand(before, before.currentPlayer, requestId, deps.bus);
    if (!result.ok) {
      deps.showNotification('This demand is no longer available.', 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    deps.session.commit(result.state);
    deps.openDiplomacyPanel();
    const record = (result.state.borderConfrontations ?? []).find(candidate => candidate.id === requestId);
    deps.showNotification(
      record?.deadlineTurn !== undefined
        ? `You promised to withdraw by turn ${record.deadlineTurn}. Keeping it will improve relations.`
        : 'You promised to withdraw.',
      'info',
    );
  }

  function handleRefuseWithdrawalDemand(requestId: string): void {
    const before = deps.session.getState();
    const result = refuseWithdrawalDemand(before, before.currentPlayer, requestId, deps.bus);
    if (!result.ok) {
      deps.showNotification('This demand is no longer available.', 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    deps.session.commit(result.state);
    deps.openDiplomacyPanel();
    deps.showNotification('Withdrawal refused. Relations worsened; no war was declared.', 'info');
  }

  return { handleDemandWithdrawal, handleAcceptWithdrawalDemand, handleRefuseWithdrawalDemand };
}
