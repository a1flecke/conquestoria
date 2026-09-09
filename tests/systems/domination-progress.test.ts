import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import {
  checkDominationVictory,
  finalizeDominationVictory,
  getDominationProgress,
  getDominationResolutionBlocker,
} from '@/systems/victory-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';
import { makeVassalageFixture } from './helpers/vassalage-fixture';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

describe('Domination progress adapter', () => {
  it('emits one final event only when Domination changes a live campaign into an outcome', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('victory:resolved', event => events.push(event));

    const finished = finalizeDominationVictory(state, bus);
    finalizeDominationVictory(finished, bus);

    expect(events).toEqual([{ winnerId: 'player', reason: 'domination', turn: state.turn }]);
  });

  it('credits an overlord for a valid direct vassal and an eliminated founding rival', () => {
    const bus = new EventBus();
    const pending = applyDiplomaticAction(
      makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
    );
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );
    const state = withoutOwnedAssets(accepted, 'third');

    expect(getDominationProgress(state, 'overlord')).toMatchObject({
      eligible: true,
      directVassalIds: ['vassal'],
      eliminatedRivalIds: ['third'],
      conditionMet: true,
    });
    expect(checkDominationVictory(state)).toBe('overlord');
  });

  it('does not award victory to a vassal or a one-founder secession sandbox', () => {
    const vassalState = makeVassalageFixture();
    const bus = new EventBus();
    const pending = applyDiplomaticAction(vassalState, 'vassal', 'overlord', 'offer_vassalage', bus);
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );
    expect(getDominationProgress(accepted, 'vassal')).toMatchObject({
      eligible: false,
      ineligibleReason: 'vassal',
      conditionMet: false,
    });

    const { state } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    expect(getDominationProgress(state, 'player')).toMatchObject({
      eligible: false,
      ineligibleReason: 'noncompetitive',
      conditionMet: false,
    });
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('defers only a live actionable independence petition from a credited vassal', () => {
    const bus = new EventBus();
    const pending = applyDiplomaticAction(
      makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
    );
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );
    const candidate = withoutOwnedAssets(accepted, 'third');
    candidate.civilizations.vassal.diplomacy.vassalage.protectionScore = 20;
    candidate.pendingDiplomacyRequests = [{
      id: 'independence:vassal:overlord',
      type: 'independence',
      fromCivId: 'vassal',
      toCivId: 'overlord',
      turnIssued: candidate.turn,
    }];

    expect(getDominationResolutionBlocker(candidate, 'overlord')).toEqual({
      kind: 'independence',
      requestIds: ['independence:vassal:overlord'],
    });
    expect(finalizeDominationVictory(candidate, bus)).toBe(candidate);

    candidate.pendingDiplomacyRequests = [{
      id: 'unrelated-peace',
      type: 'peace',
      fromCivId: 'vassal',
      toCivId: 'overlord',
      turnIssued: candidate.turn,
    }];
    expect(getDominationResolutionBlocker(candidate, 'overlord')).toBeNull();
    expect(finalizeDominationVictory(candidate, bus)).toMatchObject({
      gameOver: true,
      winner: 'overlord',
      gameOverReason: 'domination',
    });
  });
});
