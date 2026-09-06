// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { EventBus } from '@/core/event-bus';
import { applyDiplomaticAction, acceptDiplomaticRequest, rejectDiplomaticRequest } from '@/systems/diplomacy-system';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

function harness() {
  let state = makeVassalageFixture();
  const container = document.createElement('div');
  const bus = new EventBus();
  const action = vi.fn((target, choice) => { state = applyDiplomaticAction(state, state.currentPlayer, target, choice, bus); render(); });
  function render() {
    container.replaceChildren();
    createDiplomacyPanel(container, state, {
      onAction: action, onClose: () => {},
      onAcceptTreatyProposal: id => { state = acceptDiplomaticRequest(state, state.currentPlayer, id, bus); render(); },
      onDeclineTreatyProposal: id => { state = rejectDiplomaticRequest(state, state.currentPlayer, id, bus); render(); },
    });
  }
  function click(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === label);
    expect(button, label).toBeDefined();
    button!.click();
    return button!;
  }
  return { container, render, click, action, get state() { return state; }, viewer: (id: string) => { state.currentPlayer = id; render(); } };
}

describe('live vassalage diplomacy controls', () => {
  it('offers, displays pending consent, accepts and immediately displays the correct roles', () => {
    const h = harness(); h.render();
    expect(Array.from(h.container.querySelectorAll('button')).filter(b => b.textContent === 'Offer Vassalage')).toHaveLength(2);
    const button = h.click('Offer Vassalage');
    button.click();
    expect(h.action).toHaveBeenCalledTimes(1);
    expect(h.container.textContent).toContain('Awaiting');
    expect(h.container.textContent).toContain('25%');
    h.viewer('overlord');
    h.click('Accept Vassalage');
    expect(h.container.textContent).toContain('Your vassal');
    expect(h.container.querySelector('[data-treaty-type="vassalage"]')).toBeNull();
    h.viewer('vassal');
    expect(h.container.textContent).toContain('Your overlord');
    expect(h.container.textContent).toContain('Protection: 100');
    expect(h.container.textContent).not.toContain('Accept Vassalage');
  });
  it.each([true, false])('renders a human petition and its immediate resolution: grant=%s', grant => {
    const h = harness(); h.render(); h.click('Offer Vassalage'); h.viewer('overlord'); h.click('Accept Vassalage');
    h.state.civilizations.overlord.units = [];
    h.viewer('vassal'); h.click('Petition Independence');
    expect(h.container.textContent).toContain('Awaiting');
    h.viewer('third'); expect(h.container.textContent).not.toContain('Grant Independence');
    h.viewer('overlord'); h.click(grant ? 'Grant Independence' : 'Refuse — War');
    expect(h.container.textContent).not.toContain('Your vassal');
    expect(h.state.civilizations.vassal.diplomacy.atWarWith.includes('overlord')).toBe(!grant);
  });
  it('requires a second release click and displays the reputation cost', () => {
    const h = harness(); h.render(); h.click('Offer Vassalage'); h.viewer('overlord'); h.click('Accept Vassalage');
    expect(h.container.textContent).toContain('40');
    h.click('Release Vassal');
    expect(h.state.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    h.click('Confirm Release');
    expect(h.container.textContent).not.toContain('Your vassal');
  });
  it('hides offers outside canonical eligibility and private incoming decisions from other viewers', () => {
    const h = harness(); h.state.civilizations.vassal.diplomacy.vassalage.peakCities = 1; h.render();
    expect(h.container.textContent).not.toContain('Offer Vassalage');
  });
});
