import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { applyDiplomaticAction, acceptDiplomaticRequest, rejectDiplomaticRequest } from '@/systems/diplomacy-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { getEconomyStatusForCiv } from '@/systems/economy-system';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';
import type { GameState } from '@/core/types';

function reload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  expect(parsed.status).toBe('success');
  if (parsed.status !== 'success') throw new Error(parsed.message);
  return normalizeLoadedState(parsed.state);
}
function accept(state: GameState) {
  return acceptDiplomaticRequest(state, 'overlord', state.pendingDiplomacyRequests![0].id, new EventBus());
}

describe('#910 real turns and save boundaries', () => {
  it('preserves pending consent across export/import, then accepts identically and continues the same economy', () => {
    const state = normalizeLoadedState(makeVassalageFixture());
    const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', new EventBus());
    const restored = reload(pending);
    expect(restored.pendingDiplomacyRequests).toEqual(pending.pendingDiplomacyRequests);
    expect(restored.defensiveLeagues).toEqual(pending.defensiveLeagues);
    expect(restored.civilizations.vassal.gold).toBe(pending.civilizations.vassal.gold);
    const uninterrupted = accept(pending), loaded = accept(restored);
    expect(loaded.civilizations.vassal.diplomacy).toEqual(uninterrupted.civilizations.vassal.diplomacy);
    const next = processTurn(loaded, new EventBus()), expected = processTurn(uninterrupted, new EventBus());
    expect(next.civilizations.vassal.gold).toBe(expected.civilizations.vassal.gold);
    expect(next.civilizations.overlord.gold).toBe(expected.civilizations.overlord.gold);
  });
  it.each([false, true])('transfers rounded positive tribute exactly once regardless of civ iteration order: reverse=%s', reverse => {
    const state = normalizeLoadedState(makeVassalageFixture()); state.defensiveLeagues = [];
    for (const civ of Object.values(state.civilizations)) civ.gold = 1000;
    if (reverse) state.civilizations = Object.fromEntries(Object.entries(state.civilizations).reverse());
    const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', new EventBus());
    const declined = rejectDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
    const active = accept(pending);
    const baseline = processTurn(declined, new EventBus());
    const tribute = Math.floor(getEconomyStatusForCiv(baseline, 'vassal').grossGoldIncome * 0.25);
    expect(tribute).toBeGreaterThan(0);
    const paid = processTurn(active, new EventBus());
    expect(paid.civilizations.vassal.gold).toBe(baseline.civilizations.vassal.gold - tribute);
    expect(paid.civilizations.overlord.gold).toBe(baseline.civilizations.overlord.gold + tribute);
    const waiting = processTurn(pending, new EventBus());
    expect(waiting.civilizations.vassal.gold).toBe(baseline.civilizations.vassal.gold);
    const released = applyDiplomaticAction(active, 'overlord', 'vassal', 'release_vassal', new EventBus());
    const ended = processTurn(reload(released), new EventBus());
    expect(ended.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    expect(ended.civilizations.overlord.gold).toBe(baseline.civilizations.overlord.gold);
  });
  it('never reverses tribute when outpost costs make income negative', () => {
    const state = normalizeLoadedState(makeVassalageFixture()); state.defensiveLeagues = [];
    for (const civ of Object.values(state.civilizations)) civ.gold = 1000;
    for (const tile of Object.values(state.map.tiles).slice(0, 20)) {
      tile.owner = 'vassal'; tile.improvement = 'resource_outpost'; tile.improvementTurnsLeft = 0;
    }
    const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', new EventBus());
    const before = processTurn(pending, new EventBus());
    const after = processTurn(accept(pending), new EventBus());
    expect(getEconomyStatusForCiv(before, 'vassal').grossGoldIncome).toBeLessThan(0);
    expect(after.civilizations.vassal.gold).toBe(before.civilizations.vassal.gold);
    expect(after.civilizations.overlord.gold).toBe(before.civilizations.overlord.gold);
  });
  it('round-trips protection and an independence petition without making the decision on load', () => {
    let state = accept(applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus()));
    state = applyDiplomaticAction(state, 'third', 'vassal', 'declare_war', new EventBus());
    state.civilizations.overlord.units = [];
    state = applyDiplomaticAction(state, 'vassal', 'overlord', 'petition_independence', new EventBus());
    const restored = reload(state);
    expect(restored.civilizations.vassal.diplomacy.vassalage).toEqual(state.civilizations.vassal.diplomacy.vassalage);
    expect(restored.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
    expect(restored.civilizations.vassal.diplomacy.atWarWith).not.toContain('overlord');
  });
});


it('charges no tribute at exactly zero income after outpost upkeep', () => {
  const state = normalizeLoadedState(makeVassalageFixture()); state.defensiveLeagues = [];
  for (const civ of Object.values(state.civilizations)) civ.gold = 1000;
  const baseline = processTurn(state, new EventBus());
  const income = getEconomyStatusForCiv(baseline, 'vassal').grossGoldIncome;
  expect(income % 2).toBe(0);
  const sites = Object.values(state.map.tiles).filter(tile => tile.owner === null).slice(0, income / 2);
  expect(sites.length * 2).toBe(income);
  for (const tile of sites) { tile.owner = 'vassal'; tile.improvement = 'resource_outpost'; tile.improvementTurnsLeft = 0; }
  const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', new EventBus());
  const waiting = processTurn(pending, new EventBus());
  const paid = processTurn(accept(pending), new EventBus());
  expect(getEconomyStatusForCiv(waiting, 'vassal').grossGoldIncome).toBe(0);
  expect(paid.civilizations.vassal.gold).toBe(waiting.civilizations.vassal.gold);
  expect(paid.civilizations.overlord.gold).toBe(waiting.civilizations.overlord.gold);
});
