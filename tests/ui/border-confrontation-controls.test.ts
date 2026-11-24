// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import { BORDER_WITHDRAWAL_PROMISE_TURNS, acceptWithdrawalDemand, demandWithdrawal } from '@/systems/border-confrontation';
import { BORDER_CONFRONTATION_DENIAL_MESSAGES } from '@/systems/border-confrontation';
import { createBorderConfrontationControls } from '@/ui/border-confrontation-controls';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { FAR_SPOT, HOST, INTRUDER, makeBorderConfrontationState } from '../systems/helpers/border-confrontation-fixture';

const callbacks = () => ({
  onAction: vi.fn(),
  onDemandWithdrawal: vi.fn(),
  onAcceptWithdrawalDemand: vi.fn(),
  onRefuseWithdrawalDemand: vi.fn(),
  onClose: () => {},
});

function mount(state: GameState, otherId: string, cbs = callbacks()) {
  const host = document.createElement('div');
  const controls = createBorderConfrontationControls(state, otherId, cbs as never);
  host.append(controls);
  return { host, controls, cbs, buttons: () => Array.from(host.querySelectorAll('button')) };
}

function viewerState(viewerId: string): GameState {
  const state = makeBorderConfrontationState();
  state.currentPlayer = viewerId;
  return state;
}

function promisedState(viewerId: string): GameState {
  const state = viewerState(viewerId);
  const demand = demandWithdrawal(state, HOST, INTRUDER, new EventBus());
  if (!demand.ok) throw new Error(demand.reason);
  const accepted = acceptWithdrawalDemand(demand.state, INTRUDER, demand.request.id, new EventBus());
  if (!accepted.ok) throw new Error(accepted.reason);
  accepted.state.currentPlayer = viewerId;
  return accepted.state;
}

describe('border-confrontation controls (#1766)', () => {
  it('offers a demand with its consequences and requires a confirming second click', () => {
    const { host, buttons, cbs } = mount(viewerState(HOST), INTRUDER);
    expect(host.textContent).toContain('Their armed units are near your cities');
    expect(host.textContent).toContain('refusing worsens relations but does not start a war');
    const button = buttons().find(b => b.textContent === 'Demand withdrawal')!;
    expect(button).toBeDefined();
    button.click();
    expect(cbs.onDemandWithdrawal).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Confirm demand');
    button.click();
    expect(cbs.onDemandWithdrawal).toHaveBeenCalledWith(INTRUDER);
  });

  it('never offers a demand from information the player has not earned', () => {
    const state = viewerState(HOST);
    state.civilizations[HOST].visibility.tiles = {};
    const { host, buttons } = mount(state, INTRUDER);
    expect(host.textContent).toContain(BORDER_CONFRONTATION_DENIAL_MESSAGES['no-border-tension']);
    expect(buttons()).toHaveLength(0);
  });

  it('gives the approached player a readable demand with the deadline consequence and both answers', () => {
    const state = viewerState(HOST);
    const demand = demandWithdrawal(state, HOST, INTRUDER, new EventBus());
    if (!demand.ok) throw new Error(demand.reason);
    demand.state.currentPlayer = INTRUDER;
    const { host, buttons, cbs } = mount(demand.state, HOST);
    expect(host.textContent).toContain('host demands that your armed forces pull back');
    expect(host.textContent).toContain('Promise to withdraw');
    expect(host.textContent).toContain('No war is declared either way');
    buttons().find(b => b.textContent === 'Promise to withdraw')!.click();
    const confirm = buttons().find(b => b.textContent === 'Confirm promise')!;
    confirm.click();
    expect(cbs.onAcceptWithdrawalDemand).toHaveBeenCalledWith(demand.request.id);

    const refuseState = demand.state;
    refuseState.currentPlayer = INTRUDER;
    const refused = mount(refuseState, HOST);
    refused.buttons().find(b => b.textContent === 'Refuse')!.click();
    refused.buttons().find(b => b.textContent === 'Confirm refusal')!.click();
    expect(refused.cbs.onRefuseWithdrawalDemand).toHaveBeenCalledWith(demand.request.id);
  });

  it('shows the promise, its deadline, and whether the visible situation currently satisfies it', () => {
    const hostView = promisedState(HOST);
    const hostMount = mount(hostView, INTRUDER);
    expect(hostMount.host.textContent).toContain(`promised to withdraw its troops by turn ${10 + BORDER_WITHDRAWAL_PROMISE_TURNS}`);
    expect(hostMount.host.textContent).toContain('still near your cities');

    (hostView.units['rival-unit'] as Unit).position = FAR_SPOT;
    expect(mount(hostView, INTRUDER).host.textContent).toContain('that promise is satisfied');

    const intruderView = promisedState(INTRUDER);
    const intruderMount = mount(intruderView, HOST);
    expect(intruderMount.host.textContent).toContain('You promised');
    expect(intruderMount.host.textContent).toContain('Breaking the promise will damage relations and your reputation');
    (intruderView.units['rival-unit'] as Unit).position = FAR_SPOT;
    expect(mount(intruderView, HOST).host.textContent).toContain('you have pulled back far enough');
  });

  it('mounts the live section inside the Diplomacy panel', () => {
    const container = document.createElement('div');
    document.body.append(container);
    createDiplomacyPanel(container, viewerState(HOST), callbacks() as never);
    expect(container.querySelector('[data-role="border-confrontation-controls"]')).not.toBeNull();
    expect(container.querySelector('.diplo-action')).not.toBeNull();
  });
});
