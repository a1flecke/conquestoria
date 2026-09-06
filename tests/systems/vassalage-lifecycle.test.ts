import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { applyDiplomaticAction, acceptDiplomaticRequest, rejectDiplomaticRequest, processVassalageTribute } from '@/systems/diplomacy-system';
import { makeVassalageFixture } from './helpers/vassalage-fixture';
import type { GameState } from '@/core/types';

const offer = (state: GameState, bus = new EventBus()) => applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', bus);

describe('#910 live formation', () => {
  it.each([true, false])('queues for human recipient with proposer human=%s, without early effects', human => {
    const state = makeVassalageFixture(human, true);
    const before = structuredClone(state);
    const pending = offer(state);
    expect(pending.pendingDiplomacyRequests).toEqual([expect.objectContaining({ type: 'treaty', treatyType: 'vassalage', fromCivId: 'vassal', toCivId: 'overlord' })]);
    expect(pending.civilizations).toEqual(before.civilizations);
    expect(pending.defensiveLeagues).toEqual(before.defensiveLeagues);
    expect(state).toEqual(before);
  });

  it('commits both roles, permanent treaty and league departure exactly once after consent', () => {
    const bus = new EventBus();
    const acceptedEvent = vi.fn();
    bus.on('diplomacy:treaty-accepted', acceptedEvent);
    const pending = offer(makeVassalageFixture(), bus);
    const request = pending.pendingDiplomacyRequests![0];
    expect(request).toBeDefined();
    const accepted = acceptDiplomaticRequest(pending, 'overlord', request.id, bus);
    expect(accepted.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    expect(accepted.civilizations.overlord.diplomacy.vassalage.vassals).toEqual(['vassal']);
    for (const id of ['vassal', 'overlord']) expect(accepted.civilizations[id].diplomacy.treaties.filter(t => t.type === 'vassalage')).toHaveLength(1);
    expect(accepted.defensiveLeagues).toEqual([]);
    expect(pending.defensiveLeagues).toHaveLength(1);
    expect(accepted.pendingDiplomacyRequests).toEqual([]);
    expect(acceptDiplomaticRequest(accepted, 'overlord', request.id, bus)).toBe(accepted);
    expect(acceptedEvent).toHaveBeenCalledTimes(1);
  });

  it('only recipient may decide, and decline changes no obligations', () => {
    const pending = offer(makeVassalageFixture());
    expect(pending.pendingDiplomacyRequests).toHaveLength(1);
    const id = pending.pendingDiplomacyRequests![0].id;
    for (const actor of ['vassal', 'third']) {
      expect(acceptDiplomaticRequest(pending, actor, id, new EventBus())).toBe(pending);
      expect(rejectDiplomaticRequest(pending, actor, id)).toBe(pending);
    }
    const declined = rejectDiplomaticRequest(pending, 'overlord', id);
    expect(declined.pendingDiplomacyRequests).toEqual([]);
    expect(declined.civilizations).toEqual(pending.civilizations);
    expect(declined.defensiveLeagues).toEqual(pending.defensiveLeagues);
  });

  it('deduplicates repeated offers', () => {
    const once = offer(makeVassalageFixture());
    expect(offer(once).pendingDiplomacyRequests).toHaveLength(1);
  });

  it.each(['expired', 'recovered', 'war', 'recipient-vassal', 'eliminated'] as const)('revalidates %s without partial commitment', invalidation => {
    let state = offer(makeVassalageFixture());
    expect(state.pendingDiplomacyRequests).toHaveLength(1);
    const id = state.pendingDiplomacyRequests![0].id;
    state = structuredClone(state);
    if (invalidation === 'expired') state.turn += 10;
    if (invalidation === 'recovered') {
      state.civilizations.vassal.diplomacy.vassalage.peakCities = 2;
      state.civilizations.vassal.diplomacy.vassalage.peakMilitary = 2;
    }
    if (invalidation === 'war') state.civilizations.overlord.diplomacy.atWarWith.push('vassal');
    if (invalidation === 'recipient-vassal') state.civilizations.overlord.diplomacy.vassalage.overlord = 'third';
    if (invalidation === 'eliminated') state.civilizations.overlord.isEliminated = true;
    const result = acceptDiplomaticRequest(state, 'overlord', id, new EventBus());
    expect(result.pendingDiplomacyRequests).toEqual([]);
    expect(result.civilizations).toEqual(state.civilizations);
    expect(result.defensiveLeagues).toEqual(state.defensiveLeagues);
  });

  it.each(['era', 'peak', 'loss', 'unmet', 'own-vassal', 'own-overlord', 'recipient-vassal', 'cityless'] as const)('blocks ineligible %s proposal', reason => {
    const state = makeVassalageFixture();
    const vassal = state.civilizations.vassal;
    if (reason === 'era') vassal.techState.completed = [];
    if (reason === 'peak') vassal.diplomacy.vassalage.peakCities = 1;
    if (reason === 'loss') { vassal.diplomacy.vassalage.peakCities = 2; vassal.diplomacy.vassalage.peakMilitary = 2; }
    if (reason === 'unmet') { vassal.knownCivilizations = []; vassal.visibility.tiles = {}; state.civilizations.overlord.knownCivilizations = [];  }
    if (reason === 'own-vassal') vassal.diplomacy.vassalage.overlord = 'third';
    if (reason === 'own-overlord') vassal.diplomacy.vassalage.vassals = ['third'];
    if (reason === 'recipient-vassal') state.civilizations.overlord.diplomacy.vassalage.overlord = 'third';
    if (reason === 'cityless') vassal.cities = [];
    expect(offer(state).pendingDiplomacyRequests).toEqual([]);
  });

  it('never transfers negative income in reverse', () => {
    expect(processVassalageTribute(-7).tributeAmount).toBe(0);
    expect(processVassalageTribute(0).tributeAmount).toBe(0);
    expect(processVassalageTribute(7).tributeAmount).toBe(1);
  });
});

describe('#910 AI recipient consent', () => {
  it.each([true, false])('evaluates and commits immediately for proposer human=%s', human => {
    const state = makeVassalageFixture(human, false);
    const accepted = offer(state);
    expect(accepted.pendingDiplomacyRequests).toEqual([]);
    expect(accepted.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
  });
  it('declines a hostile or overburdened offer without hidden-state evaluation', () => {
    const state = makeVassalageFixture(true, false);
    state.civilizations.overlord.diplomacy.relationships.vassal = -1;
    expect(offer(state)).toBe(state);
    state.civilizations.overlord.diplomacy.relationships.vassal = 30;
    state.civilizations.overlord.units = [];
    expect(offer(state)).toBe(state);
  });
});


it.each(['explorer', 'standard', 'veteran'] as const)('AI consent is stable across difficulty and hidden foreign military: %s', difficulty => {
  const state = makeVassalageFixture(true, false); state.opponentChallenge = difficulty;
  const baseline = offer(state);
  const hidden = structuredClone(state);
  for (const id of hidden.civilizations.vassal.units) delete hidden.units[id];
  hidden.civilizations.vassal.units = [];
  hidden.civilizations.overlord.visibility.tiles = {};
  const changed = offer(hidden);
  expect(changed.civilizations.overlord.diplomacy.vassalage).toEqual(baseline.civilizations.overlord.diplomacy.vassalage);
  expect(changed.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
});

it('allows separate independent vassals under one overlord without nesting or duplicate treaties', () => {
  let state = offer(makeVassalageFixture());
  state = acceptDiplomaticRequest(state, 'overlord', state.pendingDiplomacyRequests![0].id, new EventBus());
  state.civilizations.third.diplomacy.vassalage.peakCities = 3;
  const pending = applyDiplomaticAction(state, 'third', 'overlord', 'offer_vassalage', new EventBus());
  const after = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
  expect(after.civilizations.overlord.diplomacy.vassalage.vassals).toEqual(['vassal', 'third']);
  expect(after.civilizations.overlord.diplomacy.vassalage.overlord).toBeNull();
  expect(after.civilizations.overlord.diplomacy.treaties.filter(t => t.type === 'vassalage')).toHaveLength(2);
});
