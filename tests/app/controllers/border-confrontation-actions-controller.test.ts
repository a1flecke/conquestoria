// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import type { GameState } from '@/core/types';
import {
  createBorderConfrontationActionsController,
  type BorderConfrontationActionsControllerDeps,
} from '@/app/controllers/border-confrontation-actions-controller';
import { getActiveBorderPromise, getBorderConfrontationEligibility } from '@/systems/border-confrontation';
import { HOST, INTRUDER, makeBorderConfrontationState } from '../../systems/helpers/border-confrontation-fixture';

function makeDeps(state: GameState, overrides: Partial<BorderConfrontationActionsControllerDeps> = {}) {
  return {
    session: createGameSession(state),
    bus: new EventBus(),
    showNotification: vi.fn(),
    openDiplomacyPanel: vi.fn(),
    ...overrides,
  };
}

describe('BorderConfrontationActionsController (#1766)', () => {
  it('sends the demand through the canonical executor and reports the AI answer', () => {
    const state = makeBorderConfrontationState();
    state.currentPlayer = HOST;
    state.civilizations[INTRUDER].civType = 'greece';
    const deps = makeDeps(state);
    const controller = createBorderConfrontationActionsController(deps);

    controller.handleDemandWithdrawal(INTRUDER);

    const after = deps.session.getState();
    const promise = getActiveBorderPromise(after, HOST, INTRUDER);
    expect(promise).toBeDefined();
    expect(getBorderConfrontationEligibility(after, HOST, INTRUDER)).toEqual({ ok: false, reason: 'active-confrontation' });
    expect(deps.openDiplomacyPanel).toHaveBeenCalled();
    expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('promised to withdraw'), 'success');
  });

  it('surfaces an aggressive refusal as a warning and records the immediate penalty', () => {
    const state = makeBorderConfrontationState();
    state.currentPlayer = HOST;
    state.civilizations[INTRUDER].civType = 'rome';
    const deps = makeDeps(state);
    const controller = createBorderConfrontationActionsController(deps);

    controller.handleDemandWithdrawal(INTRUDER);

    const after = deps.session.getState();
    expect(getActiveBorderPromise(after, HOST, INTRUDER)).toBeUndefined();
    expect(after.borderConfrontations?.[0].status).toBe('refused');
    expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('refused to withdraw'), 'warning');
    expect(deps.openDiplomacyPanel).toHaveBeenCalled();
  });

  it('accepts an incoming demand and re-renders with the deadline; a stale click is a typed warning', () => {
    const state = makeBorderConfrontationState();
    state.currentPlayer = HOST;
    // A demand addressed to the viewer: the request lifecycle is the source of truth, not the UI's stale render.
    state.pendingDiplomacyRequests = [{
      id: 'withdrawal:rival:host:10',
      type: 'withdrawal',
      fromCivId: INTRUDER,
      toCivId: HOST,
      turnIssued: state.turn,
      turnsRemaining: 5,
    }];
    const deps = makeDeps(state);
    const controller = createBorderConfrontationActionsController(deps);

    controller.handleAcceptWithdrawalDemand('withdrawal:rival:host:10');
    expect(getActiveBorderPromise(deps.session.getState(), INTRUDER, HOST)?.status).toBe('promised');
    expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('You promised to withdraw'), 'info');

    controller.handleAcceptWithdrawalDemand('withdrawal:rival:host:10');
    expect(deps.showNotification).toHaveBeenLastCalledWith('This demand is no longer available.', 'warning');
  });
});
