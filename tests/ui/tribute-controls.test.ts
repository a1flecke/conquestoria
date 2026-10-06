// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { applyDiplomaticAction } from '@/systems/diplomacy-system';
import { TRIBUTE_DENIAL_MESSAGES } from '@/systems/diplomacy-tribute';
import { createTributeControls } from '@/ui/tribute-controls';
import { DEMANDER, TARGET, letTargetSeeDemander, makeTributeState } from '../systems/helpers/tribute-fixture';

// #1334: the diplomacy panel's tribute section. Everything it shows is the viewer's own.
const callbacks = () => ({
  onAction: vi.fn(),
  onAcceptTreatyProposal: vi.fn(),
  onDeclineTreatyProposal: vi.fn(),
  onClose: () => {},
});

function mount(state: GameState, otherId: string, cbs = callbacks()) {
  const host = document.createElement('div');
  const controls = createTributeControls(state, otherId, cbs as never);
  host.append(controls);
  return { host, controls, cbs, buttons: () => Array.from(host.querySelectorAll('button')) };
}

describe('tribute controls (#1334)', () => {
  it('offers a demand with the exact terms and the refusal consequence before confirming', () => {
    const state = makeTributeState();
    state.currentPlayer = DEMANDER;
    const { host, buttons, cbs } = mount(state, TARGET);
    expect(host.textContent).toMatch(/Demand \d+ gold per round for 10 rounds/);
    expect(host.textContent).toContain('does not automatically start a war');
    expect(host.textContent).toContain('clearly stronger');
    expect(host.textContent).not.toMatch(/strength \d|uncertain/i);
    const button = buttons().find(b => b.textContent === 'Demand Tribute')!;
    expect(button).toBeDefined();
    button.click();
    expect(cbs.onAction).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Confirm Demand');
    button.click();
    button.click();
    expect(cbs.onAction).toHaveBeenCalledTimes(1);
    expect(cbs.onAction).toHaveBeenCalledWith(TARGET, 'demand_tribute');
  });

  it('explains why a demand is unavailable without a number, and offers no button', () => {
    const state = makeTributeState();
    state.currentPlayer = DEMANDER;
    state.civilizations[DEMANDER].visibility.tiles = {};
    const { host, buttons } = mount(state, TARGET);
    expect(host.textContent).toContain(TRIBUTE_DENIAL_MESSAGES['unknown-military']);
    expect(buttons()).toHaveLength(0);
  });

  it('says nothing for a civilization the viewer is at war with or has not met', () => {
    const war = makeTributeState();
    war.currentPlayer = DEMANDER;
    war.civilizations[DEMANDER].diplomacy.atWarWith.push(TARGET);
    war.civilizations[TARGET].diplomacy.atWarWith.push(DEMANDER);
    expect(mount(war, TARGET).host.textContent).toBe('');
  });

  it('shows a human target the exact incoming terms with accept and refuse, and says refusing does not start a war', () => {
    const state = makeTributeState();
    state.civilizations[TARGET].isHuman = true;
    const made = applyDiplomaticAction(state, DEMANDER, TARGET, 'demand_tribute', new EventBus());
    if (!made.ok) throw new Error(made.reason);
    const terms = made.state.pendingDiplomacyRequests![0].tribute!;
    made.state.currentPlayer = TARGET;
    const { host, buttons, cbs } = mount(made.state, DEMANDER);
    expect(host.textContent).toContain(`${terms.goldPerRound} gold per round for ${terms.rounds} rounds`);
    expect(host.textContent).toContain('no war starts automatically');
    buttons().find(b => b.textContent === 'Accept Demand')!.click();
    expect(cbs.onAcceptTreatyProposal).toHaveBeenCalledWith(made.state.pendingDiplomacyRequests![0].id);
  });

  it('shows the demander the pending state, and an uninvolved viewer nothing about the pair', () => {
    const state = makeTributeState();
    state.civilizations[TARGET].isHuman = true;
    const made = applyDiplomaticAction(state, DEMANDER, TARGET, 'demand_tribute', new EventBus());
    if (!made.ok) throw new Error(made.reason);
    made.state.currentPlayer = DEMANDER;
    expect(mount(made.state, TARGET).host.textContent).toContain('Awaiting');

    const third = structuredClone(made.state.civilizations[TARGET]);
    third.name = 'Third Realm';
    third.isHuman = true;
    made.state.civilizations['ai-9'] = third;
    made.state.civilizations['ai-9'].knownCivilizations = [DEMANDER, TARGET];
    made.state.currentPlayer = 'ai-9';
    const text = mount(made.state, TARGET).host.textContent ?? '';
    expect(text).not.toContain('gold per round');
    expect(text).not.toContain('Awaiting');
  });

  it('shows an active contract to each party with payer, receiver, amount and rounds remaining', () => {
    const fresh = makeTributeState();
    letTargetSeeDemander(fresh);
    const made = applyDiplomaticAction(fresh, DEMANDER, TARGET, 'demand_tribute', new EventBus());
    if (!made.ok) throw new Error(made.reason);
    made.state.currentPlayer = TARGET;
    expect(mount(made.state, DEMANDER).host.textContent).toMatch(/you pay .* \d+ gold per round\. 10 rounds remaining/i);
    made.state.currentPlayer = DEMANDER;
    expect(mount(made.state, TARGET).host.textContent).toMatch(/pays you \d+ gold per round\. 10 rounds remaining/i);
  });
});

describe('tribute in the live diplomacy panel (#1334)', () => {
  it('mounts the tribute section and never offers to "break" a tribute like an ordinary treaty', async () => {
    const { createDiplomacyPanel } = await import('@/ui/diplomacy-panel');
    const fresh = makeTributeState();
    letTargetSeeDemander(fresh);
    const made = applyDiplomaticAction(fresh, DEMANDER, TARGET, 'demand_tribute', new EventBus());
    if (!made.ok) throw new Error(made.reason);
    made.state.currentPlayer = TARGET;
    const container = document.createElement('div');
    createDiplomacyPanel(container, made.state, { onAction: () => {}, onClose: () => {} } as never);
    expect(container.querySelector('[data-role="tribute-controls"]')?.textContent).toMatch(/you pay .* gold per round/i);
    expect(container.querySelector('.diplo-break-treaty[data-treaty-type="tribute"]')).toBeNull();
  });
});
