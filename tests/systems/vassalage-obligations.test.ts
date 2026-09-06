import { resolveMajorCityCapture, emitMajorCityCaptureEvents } from '@/systems/city-capture-system';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { applyDiplomaticAction, acceptDiplomaticRequest, rejectDiplomaticRequest, processVassalageTurn, makePeace } from '@/systems/diplomacy-system';
import { processTurn } from '@/core/turn-manager';
import { makeVassalageFixture } from './helpers/vassalage-fixture';

function active() {
  const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus());
  return acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
}

describe('#910 protection and independence', () => {
  it('starts per-vassal protection on a real war declaration and clears it on defense', () => {
    const state = active();
    const attacked = applyDiplomaticAction(state, 'third', 'vassal', 'declare_war', new EventBus());
    expect(attacked.civilizations.vassal.diplomacy.vassalage.protectionTimers).toEqual([{ attackerCivId: 'third', turnsRemaining: 3 }]);
    expect(state.civilizations.vassal.diplomacy.atWarWith).toEqual([]);
    const defended = applyDiplomaticAction(attacked, 'overlord', 'third', 'declare_war', new EventBus());
    expect(defended.civilizations.vassal.diplomacy.vassalage.protectionTimers).toEqual([]);
  });
  it('enforces vassal restrictions on the canonical human and AI action path', () => {
    const state = active();
    for (const action of ['declare_war', 'alliance', 'trade_agreement'] as const) {
      expect(applyDiplomaticAction(state, 'vassal', 'third', action, new EventBus())).toBe(state);
    }
  });
  it('joins an overlord war without vassal treachery', () => {
    const state = applyDiplomaticAction(active(), 'overlord', 'third', 'declare_war', new EventBus());
    expect(state.civilizations.vassal.diplomacy.atWarWith).toContain('third');
    expect(state.civilizations.third.diplomacy.atWarWith).toContain('vassal');
    expect(state.civilizations.vassal.diplomacy.treacheryScore).toBe(0);
  });
  it('does not let turn processing petition or decide independence for a human', () => {
    const state = active();
    state.civilizations.overlord.units = [];
    const after = processTurn(state, new EventBus());
    expect(after.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    expect(after.pendingDiplomacyRequests).toEqual([]);
  });
  it.each([true, false])('human recipient owns independence resolution: accepted=%s', accepted => {
    const state = active();
    state.civilizations.overlord.units = [];
    const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'petition_independence', new EventBus());
    expect(pending.pendingDiplomacyRequests).toContainEqual(expect.objectContaining({ type: 'independence', fromCivId: 'vassal', toCivId: 'overlord' }));
    expect(pending.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    const id = pending.pendingDiplomacyRequests![0].id;
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('diplomacy:vassalage-ended', ended);
    expect(acceptDiplomaticRequest(pending, 'third', id, bus)).toBe(pending);
    const result = accepted ? acceptDiplomaticRequest(pending, 'overlord', id, bus) : rejectDiplomaticRequest(pending, 'overlord', id, bus);
    expect(result.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    expect(result.civilizations.overlord.diplomacy.vassalage.vassals).toEqual([]);
    expect(result.civilizations.vassal.diplomacy.atWarWith.includes('overlord')).toBe(!accepted);
    expect(result.civilizations.vassal.diplomacy.treacheryScore).toBe(accepted ? 0 : 20);
    expect(result.pendingDiplomacyRequests).toEqual([]);
    expect(ended).toHaveBeenCalledTimes(1);
  });
  it('overlord release clears both sides, protection and treaties with abandonment cost', () => {
    const state = active();
    state.civilizations.vassal.diplomacy.vassalage.protectionTimers = [{ attackerCivId: 'third', turnsRemaining: 2 }];
    const result = applyDiplomaticAction(state, 'overlord', 'vassal', 'release_vassal', new EventBus());
    expect(result.civilizations.vassal.diplomacy.vassalage).toMatchObject({ overlord: null, protectionTimers: [] });
    expect(result.civilizations.overlord.diplomacy.vassalage.vassals).toEqual([]);
    expect(result.civilizations.overlord.diplomacy.treacheryScore).toBe(40);
    expect(result.civilizations.vassal.diplomacy.treaties.filter(t => t.type === 'vassalage')).toEqual([]);
  });
});


describe('#910 protection transitions', () => {
  it('ticks once, expires once, and becomes independent when protection reaches 20', () => {
    let state = applyDiplomaticAction(active(), 'third', 'vassal', 'declare_war', new EventBus());
    state.civilizations.vassal.diplomacy.vassalage.protectionScore = 40;
    const bus = new EventBus(); const failed = vi.fn(); bus.on('diplomacy:protection-failed', failed);
    state = processVassalageTurn(state, bus);
    expect(state.civilizations.vassal.diplomacy.vassalage.protectionTimers[0].turnsRemaining).toBe(2);
    state = processVassalageTurn(state, bus); state = processVassalageTurn(state, bus);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(state.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    processVassalageTurn(state, bus); expect(failed).toHaveBeenCalledTimes(1);
  });
  it('an AI overlord answers the same protection obligation', () => {
    const state = applyDiplomaticAction(active(), 'third', 'vassal', 'declare_war', new EventBus());
    state.civilizations.overlord.isHuman = false;
    const next = processVassalageTurn(state, new EventBus());
    expect(next.civilizations.overlord.diplomacy.atWarWith).toContain('third');
    expect(next.civilizations.vassal.diplomacy.vassalage.protectionTimers).toEqual([]);
  });
  it('military attacks restart a missed protection obligation without refreshing an existing timer', () => {
    let state = applyDiplomaticAction(active(), 'third', 'vassal', 'declare_war', new EventBus());
    const attacker = state.units[state.civilizations.third.units[0]];
    const defender = state.units[state.civilizations.vassal.units[0]];
    const result = { attackerId: attacker.id, defenderId: defender.id, attackerDamage: 0, defenderDamage: 1, attackerSurvived: true, defenderSurvived: true, attackerStrength: 10, defenderStrength: 10, attackerPosition: attacker.position, defenderPosition: defender.position };
    state.civilizations.vassal.diplomacy.vassalage.protectionTimers = [];
    state = applyCombatOutcomeToState(state, result, 42).state;
    expect(state.civilizations.vassal.diplomacy.vassalage.protectionTimers).toEqual([{ attackerCivId: 'third', turnsRemaining: 3 }]);
    state = processVassalageTurn(state, new EventBus());
    state = applyCombatOutcomeToState(state, result, 42).state;
    expect(state.civilizations.vassal.diplomacy.vassalage.protectionTimers[0].turnsRemaining).toBe(2);
  });
  it('peace immediately clears the relevant protection timer', () => {
    const state = applyDiplomaticAction(active(), 'third', 'vassal', 'declare_war', new EventBus());
    const peaceful = makePeace(state.civilizations.vassal.diplomacy, 'third', state.turn);
    expect(peaceful.vassalage.protectionTimers).toEqual([]);
  });
  it('overlord elimination resets the freed vassal protection data', () => {
    const state = active(); state.civilizations.overlord.cities = [];
    state.civilizations.vassal.diplomacy.vassalage.protectionScore = 40;
    state.civilizations.vassal.diplomacy.vassalage.protectionTimers = [{attackerCivId: 'third', turnsRemaining: 1}];
    const result = eliminateCivilization(state, 'overlord', 'third');
    expect(result.state.civilizations.vassal.diplomacy.vassalage).toMatchObject({overlord: null, protectionScore: 100, protectionTimers: []});
  });
  it('expired independence never starts a war or ends the agreement', () => {
    const state = active(); state.civilizations.overlord.units = [];
    const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'petition_independence', new EventBus());
    pending.turn += 10;
    const after = rejectDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
    expect(after.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    expect(after.civilizations.vassal.diplomacy.atWarWith).toEqual([]);
  });
});


it('cannot keep an active vassalage link while declaring war on your own vassal or inviting it to a new league', () => {
  const state = active(); const bus = new EventBus();
  expect(applyDiplomaticAction(state, 'overlord', 'vassal', 'declare_war', bus)).toBe(state);
  expect(applyDiplomaticAction(state, 'third', 'vassal', 'propose_league', bus)).toBe(state);
});


it.each([true, false])('announces freedom at the shared capture/elimination source for human conqueror=%s', human => {
  const state = active(); state.civilizations.third.isHuman = human;
  const cityId = state.civilizations.overlord.cities[0];
  const result = resolveMajorCityCapture(state, cityId, 'third', 'occupy', state.turn);
  const bus = new EventBus(); const ended = vi.fn(); bus.on('diplomacy:vassalage-ended', ended);
  emitMajorCityCaptureEvents(state, result, cityId, 'third', 'overlord', bus);
  expect(ended).toHaveBeenCalledExactlyOnceWith({vassalId: 'vassal', overlordId: 'overlord', reason: 'overlord_eliminated'});
  expect(result.state.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
});


it.each([true, false])('AI vassal owns its petition while recipient human=%s owns the answer', recipientHuman => {
  const state = active(); state.civilizations.vassal.isHuman = false; state.civilizations.overlord.isHuman = recipientHuman;
  state.civilizations.overlord.units = [];
  const after = processVassalageTurn(state, new EventBus());
  if (recipientHuman) {
    expect(after.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    expect(after.pendingDiplomacyRequests).toContainEqual(expect.objectContaining({type: 'independence', toCivId: 'overlord'}));
  } else {
    expect(after.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    expect(after.pendingDiplomacyRequests).toEqual([]);
  }
});


it('ends incompatible treaties on both sides of a forced vassal war without charging treachery', () => {
  const state = active();
  const treaty = {type: 'alliance' as const, civA: 'vassal', civB: 'third', turnsRemaining: -1};
  state.civilizations.vassal.diplomacy.treaties.push(treaty);
  state.civilizations.third.diplomacy.treaties.push(treaty);
  const next = applyDiplomaticAction(state, 'overlord', 'third', 'declare_war', new EventBus());
  expect(next.civilizations.vassal.diplomacy.treaties.some(t => t.type === 'alliance')).toBe(false);
  expect(next.civilizations.third.diplomacy.treaties.some(t => t.type === 'alliance')).toBe(false);
  expect(next.civilizations.vassal.diplomacy.treacheryScore).toBe(0);
});
