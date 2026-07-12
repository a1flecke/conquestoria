import { describe, it, expect } from 'vitest';
import {
  acceptDiplomaticRequest,
  applyDiplomaticAction,
  createDiplomacyState,
  enqueuePeaceRequest,
  getRelationship,
  getPendingPeaceRequestForPair,
  modifyRelationship,
  declareWar,
  makePeace,
  signTreaty,
  breakTreaty,
  processRelationshipDrift,
  recordMilitaryAttack,
  decayEvents,
  getAvailableActions,
  isAtWar,
  rejectDiplomaticRequest,
  enqueueTreatyProposal,
  pruneExpiredDiplomaticRequests,
} from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

function makeWarState(): GameState {
  const state = createNewGame(undefined, 'peace-request-test', 'small');
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -25;
  state.civilizations['ai-1'].diplomacy.relationships.player = -25;
  state.pendingDiplomacyRequests = [];
  return state;
}

describe('diplomacy-system', () => {
  const civIds = ['player', 'ai-egypt', 'ai-rome'];

  describe('createDiplomacyState', () => {
    it('creates state with zero relationships', () => {
      const state = createDiplomacyState(civIds, 'player');
      expect(getRelationship(state, 'ai-egypt')).toBe(0);
      expect(getRelationship(state, 'ai-rome')).toBe(0);
    });

    it('applies diplomacy start bonus', () => {
      const state = createDiplomacyState(civIds, 'player', 20);
      expect(getRelationship(state, 'ai-egypt')).toBe(20);
      expect(getRelationship(state, 'ai-rome')).toBe(20);
    });
  });

  describe('modifyRelationship', () => {
    it('adds to relationship score', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 15);
      expect(getRelationship(state, 'ai-egypt')).toBe(15);
    });

    it('clamps to -100 / +100', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 200);
      expect(getRelationship(state, 'ai-egypt')).toBe(100);
      state = modifyRelationship(state, 'ai-egypt', -300);
      expect(getRelationship(state, 'ai-egypt')).toBe(-100);
    });
  });

  describe('declareWar', () => {
    it('sets atWarWith and reduces relationship by 50', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      expect(isAtWar(state, 'ai-egypt')).toBe(true);
      expect(getRelationship(state, 'ai-egypt')).toBe(-50);
    });

    it('records a diplomatic event', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      expect(state.events).toHaveLength(1);
      expect(state.events[0].type).toBe('war_declared');
    });
  });

  describe('recordMilitaryAttack', () => {
    it('coalesces attacks from the same civilization in one turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = recordMilitaryAttack(state, 'ai-egypt', 8);
      state = recordMilitaryAttack(state, 'ai-egypt', 8);

      expect(state.events.filter(event => event.type === 'military_attacked')).toEqual([{
        type: 'military_attacked',
        turn: 8,
        otherCiv: 'ai-egypt',
        weight: 1,
      }]);
    });

    it('retains the newest twelve attacks without rewriting unrelated history', () => {
      let state = createDiplomacyState(civIds, 'player');
      state.events.push({ type: 'peace_made', turn: 1, otherCiv: 'ai-rome', weight: 0.5 });
      for (let turn = 1; turn <= 14; turn++) {
        state = recordMilitaryAttack(state, `attacker-${turn}`, turn);
      }

      expect(state.events.find(event => event.type === 'peace_made')).toEqual({
        type: 'peace_made',
        turn: 1,
        otherCiv: 'ai-rome',
        weight: 0.5,
      });
      const attacks = state.events.filter(event => event.type === 'military_attacked');
      expect(attacks).toHaveLength(12);
      expect(attacks[0].turn).toBe(3);
      expect(attacks.at(-1)?.turn).toBe(14);
    });

    it('preserves the relative order of unrelated diplomatic history', () => {
      let state = createDiplomacyState(civIds, 'player');
      state.events = [
        { type: 'war_declared', turn: 1, otherCiv: 'ai-egypt', weight: 1 },
        { type: 'military_attacked', turn: 2, otherCiv: 'ai-egypt', weight: 1 },
        { type: 'peace_made', turn: 3, otherCiv: 'ai-egypt', weight: 1 },
      ];

      state = recordMilitaryAttack(state, 'ai-rome', 4);

      expect(state.events.map(event => event.type)).toEqual([
        'war_declared',
        'military_attacked',
        'peace_made',
        'military_attacked',
      ]);
    });
  });

  describe('makePeace', () => {
    it('removes from atWarWith and adds +10', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      state = makePeace(state, 'ai-egypt', 10);
      expect(isAtWar(state, 'ai-egypt')).toBe(false);
      expect(getRelationship(state, 'ai-egypt')).toBe(-40);
    });
  });

  describe('treaties', () => {
    it('signTreaty adds a treaty', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = signTreaty(state, 'player', 'ai-egypt', 'non_aggression_pact', 10, 15);
      expect(state.treaties).toHaveLength(1);
      expect(state.treaties[0].type).toBe('non_aggression_pact');
      expect(state.treaties[0].turnsRemaining).toBe(10);
      expect(state.treaties[0].civA).toBe('player');
    });

    it('trade_agreement adds gold per turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      state = signTreaty(state, 'player', 'ai-egypt', 'trade_agreement', -1, 20);
      expect(state.treaties[0].goldPerTurn).toBe(2);
    });

    it('breakTreaty removes treaty and penalizes -30', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = signTreaty(state, 'player', 'ai-egypt', 'non_aggression_pact', 10, 15);
      state = breakTreaty(state, 'ai-egypt', 'non_aggression_pact', 20);
      expect(state.treaties).toHaveLength(0);
      expect(getRelationship(state, 'ai-egypt')).toBe(-25); // +5 from propose, -30 from break
    });
  });

  describe('processRelationshipDrift', () => {
    it('peaceful neighbors gain +1 per turn (cap 30)', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 29);
      state = processRelationshipDrift(state, { 'ai-egypt': false, 'ai-rome': false });
      expect(getRelationship(state, 'ai-egypt')).toBe(30);
      expect(getRelationship(state, 'ai-rome')).toBe(1);
    });

    it('units near borders cause -2 per turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = processRelationshipDrift(state, { 'ai-egypt': true, 'ai-rome': false });
      expect(getRelationship(state, 'ai-egypt')).toBe(-2);
    });
  });

  describe('decayEvents', () => {
    it('reduces event weight after 20 turns', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 1);
      state = makePeace(state, 'ai-egypt', 5);
      state = decayEvents(state, 30);
      for (const e of state.events) {
        expect(e.weight).toBeLessThan(1);
      }
    });
  });

  describe('getAvailableActions', () => {
    it('always includes declare_war when not at war', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', [], 1);
      expect(actions).toContain('declare_war');
    });

    it('includes request_peace when at war', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 1);
      const actions = getAvailableActions(state, 'ai-egypt', [], 1);
      expect(actions).toContain('request_peace');
      expect(actions).not.toContain('declare_war');
    });

    it('includes non_aggression_pact with diplomacy-tech', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', ['diplomacy-tech'], 1);
      expect(actions).toContain('non_aggression_pact');
    });

    it('includes trade_agreement with trade-routes tech and positive relationship', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      const actions = getAvailableActions(state, 'ai-egypt', ['trade-routes'], 1);
      expect(actions).toContain('trade_agreement');
    });
  });

  describe('applyDiplomaticAction', () => {
    it('request_peace enqueues a proposal instead of clearing war state', () => {
      const state = makeWarState();

      const result = applyDiplomaticAction(state, 'ai-1', 'player', 'request_peace', new EventBus());

      expect(result.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
      expect(result.pendingDiplomacyRequests).toContainEqual(
        expect.objectContaining({ fromCivId: 'ai-1', toCivId: 'player', type: 'peace' }),
      );
    });

    it('deduplicates pending peace requests across both directions for the same civ pair', () => {
      const state = makeWarState();

      const first = enqueuePeaceRequest(state, 'ai-1', 'player');
      const second = enqueuePeaceRequest(first, 'player', 'ai-1');

      expect(second.pendingDiplomacyRequests).toHaveLength(1);
      expect(getPendingPeaceRequestForPair(second, 'player', 'ai-1')).toEqual(first.pendingDiplomacyRequests?.[0]);
    });

    it('accepts a peace request only for the addressed civ and clears pair requests', () => {
      const state = makeWarState();
      const bus = new EventBus();
      const first = enqueuePeaceRequest(state, 'ai-1', 'player');
      const pairRequestId = first.pendingDiplomacyRequests?.[0]?.id;
      if (!pairRequestId) {
        throw new Error('expected pending peace request');
      }

      const wrongActorResult = acceptDiplomaticRequest(first, 'ai-1', pairRequestId, bus);
      expect(wrongActorResult).toBe(first);

      const second = {
        ...first,
        pendingDiplomacyRequests: [
          ...(first.pendingDiplomacyRequests ?? []),
          {
            id: 'peace:player:ai-1:10',
            type: 'peace' as const,
            fromCivId: 'player',
            toCivId: 'ai-1',
            turnIssued: first.turn,
          },
        ],
      };

      const accepted = acceptDiplomaticRequest(second, 'player', pairRequestId, bus);
      expect(accepted.pendingDiplomacyRequests).toEqual([]);
      expect(accepted.civilizations.player.diplomacy.atWarWith).not.toContain('ai-1');
      expect(accepted.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');
    });

    it('rejects a peace request only for the addressed civ and keeps war active', () => {
      const state = makeWarState();
      const requested = enqueuePeaceRequest(state, 'ai-1', 'player');
      const requestId = requested.pendingDiplomacyRequests?.[0]?.id;
      if (!requestId) {
        throw new Error('expected pending peace request');
      }

      const wrongActorResult = rejectDiplomaticRequest(requested, 'ai-1', requestId);
      expect(wrongActorResult).toBe(requested);

      const rejected = rejectDiplomaticRequest(requested, 'player', requestId);
      expect(rejected.pendingDiplomacyRequests).toEqual([]);
      expect(rejected.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
      expect(rejected.civilizations['ai-1'].diplomacy.atWarWith).toContain('player');
    });

    // Issue #435: treaties between unmet civs become contact "evidence" and cascade
    // into mass discovery. applyDiplomaticAction is the shared treaty writer, so it
    // must refuse counterpart actions between civs that have never met.
    it('refuses to sign a treaty between civs that have never met', () => {
      const state = createNewGame({
        civType: 'egypt',
        mapSize: 'medium',
        opponentCount: 2,
        gameTitle: 'Unmet Treaty Guard',
        seed: 'unmet-treaty-guard',
      });
      state.era = 3;
      state.civilizations['ai-1'].knownCivilizations = [];
      state.civilizations.player.knownCivilizations = [];
      state.civilizations['ai-1'].diplomacy.relationships.player = 30;
      state.civilizations.player.diplomacy.relationships['ai-1'] = 30;

      const result = applyDiplomaticAction(state, 'ai-1', 'player', 'trade_agreement', new EventBus());

      expect(result.civilizations['ai-1'].diplomacy.treaties).toEqual([]);
      expect(result.civilizations.player.diplomacy.treaties).toEqual([]);
    });

    it('refuses to declare war on a civ that has never been met', () => {
      const state = createNewGame({
        civType: 'egypt',
        mapSize: 'medium',
        opponentCount: 2,
        gameTitle: 'Unmet War Guard',
        seed: 'unmet-war-guard',
      });
      state.civilizations['ai-1'].knownCivilizations = [];
      state.civilizations.player.knownCivilizations = [];

      const result = applyDiplomaticAction(state, 'ai-1', 'player', 'declare_war', new EventBus());

      expect(result.civilizations['ai-1'].diplomacy.atWarWith).toEqual([]);
      expect(result.civilizations.player.diplomacy.atWarWith).toEqual([]);
    });

    it('still signs treaties between civs that have met', () => {
      const state = createNewGame({
        civType: 'egypt',
        mapSize: 'medium',
        opponentCount: 2,
        gameTitle: 'Met Treaty Allowed',
        seed: 'met-treaty-allowed',
      });
      state.era = 3;
      state.civilizations['ai-1'].knownCivilizations = ['player'];
      state.civilizations.player.knownCivilizations = ['ai-1'];
      state.civilizations['ai-1'].diplomacy.relationships.player = 30;
      state.civilizations.player.diplomacy.relationships['ai-1'] = 30;

      const result = applyDiplomaticAction(state, 'ai-1', 'player', 'trade_agreement', new EventBus());

      expect(result.civilizations['ai-1'].diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'trade_agreement' }),
      );
      expect(result.civilizations.player.diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'trade_agreement' }),
      );
    });

    it('applies Narnias treaty relationship bonus symmetrically when a treaty is signed', () => {
      const bus = new EventBus();
      const state = {
        turn: 12,
        civilizations: {
          player: {
            id: 'player',
            civType: 'narnia',
            knownCivilizations: ['ai-egypt'],
            diplomacy: createDiplomacyState(['player', 'ai-egypt'], 'player'),
          },
          'ai-egypt': {
            id: 'ai-egypt',
            civType: 'egypt',
            knownCivilizations: ['player'],
            diplomacy: createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt'),
          },
        },
      } as any;

      const result = applyDiplomaticAction(state, 'player', 'ai-egypt', 'alliance', bus);

      expect(getRelationship(result.civilizations.player.diplomacy, 'ai-egypt')).toBe(15);
      expect(getRelationship(result.civilizations['ai-egypt'].diplomacy, 'player')).toBe(15);
    });

    it('reabsorbs an eligible breakaway state instead of leaving the action as a no-op', () => {
      const { state, breakawayId, cityId } = makeBreakawayFixture({
        breakawayStartedTurn: 12,
        relationship: 70,
        gold: 250,
      });
      const bus = new EventBus();

      const result = applyDiplomaticAction(state, 'player', breakawayId, 'reabsorb_breakaway', bus);

      expect(result.cities[cityId].owner).toBe('player');
      expect(result.civilizations[breakawayId]).toBeUndefined();
      expect(result.civilizations.player.gold).toBe(50);
    });

    it('rejects direct reabsorb actions from non-origin owners', () => {
      const { state, breakawayId } = makeBreakawayFixture({
        breakawayStartedTurn: 12,
        relationship: 70,
        gold: 250,
        includeThirdCiv: true,
      });
      const bus = new EventBus();

      expect(() => applyDiplomaticAction(state, 'outsider', breakawayId, 'reabsorb_breakaway', bus))
        .toThrow(/origin owner/i);
    });
  });

  describe('treaty proposals (#554)', () => {
    function makeTreatyState(): GameState {
      const state = createNewGame(undefined, 'treaty-proposal-test', 'small');
      state.civilizations.player.diplomacy.relationships['ai-1'] = 40;
      state.civilizations['ai-1'].diplomacy.relationships.player = 40;
      state.pendingDiplomacyRequests = [];
      return state;
    }

    it('enqueues a proposal without touching either civ\'s treaties', () => {
      const state = makeTreatyState();
      const bus = new EventBus();
      const next = enqueueTreatyProposal(state, 'ai-1', 'player', 'non_aggression_pact', 10, bus);
      expect(next.pendingDiplomacyRequests).toHaveLength(1);
      expect(next.pendingDiplomacyRequests![0]).toMatchObject({
        type: 'treaty', treatyType: 'non_aggression_pact', fromCivId: 'ai-1', toCivId: 'player', turnsRemaining: 10,
      });
      expect(next.civilizations.player.diplomacy.treaties).toHaveLength(0);
      expect(next.civilizations['ai-1'].diplomacy.treaties).toHaveLength(0);
    });

    it('dedupes: same pair+type proposal is not enqueued twice', () => {
      const state = makeTreatyState();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'open_borders', -1);
      next = enqueueTreatyProposal(next, 'ai-1', 'player', 'open_borders', -1);
      expect(next.pendingDiplomacyRequests).toHaveLength(1);
    });

    it('accept signs both sides and clears the request', () => {
      const state = makeTreatyState();
      const bus = new EventBus();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'trade_agreement', -1, bus);
      const requestId = next.pendingDiplomacyRequests![0].id;
      next = acceptDiplomaticRequest(next, 'player', requestId, bus);
      expect(next.civilizations.player.diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
      expect(next.civilizations['ai-1'].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
      expect(next.pendingDiplomacyRequests).toHaveLength(0);
    });

    it('only the recipient can accept', () => {
      const state = makeTreatyState();
      const bus = new EventBus();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'alliance', -1);
      const requestId = next.pendingDiplomacyRequests![0].id;
      const after = acceptDiplomaticRequest(next, 'ai-1', requestId, bus); // proposer cannot self-accept
      expect(after.civilizations.player.diplomacy.treaties).toHaveLength(0);
    });

    it('reject clears the request with no relationship penalty', () => {
      const state = makeTreatyState();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'alliance', -1);
      const before = next.civilizations.player.diplomacy.relationships['ai-1'] ?? 0;
      const requestId = next.pendingDiplomacyRequests![0].id;
      next = rejectDiplomaticRequest(next, 'player', requestId);
      expect(next.pendingDiplomacyRequests).toHaveLength(0);
      expect(next.civilizations.player.diplomacy.relationships['ai-1'] ?? 0).toBe(before);
    });

    it('proposals expire after 10 turns (pruned by the turn processor)', () => {
      const state = makeTreatyState();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'open_borders', -1);
      next = { ...next, turn: next.turn + 11 };
      next = pruneExpiredDiplomaticRequests(next);
      expect(next.pendingDiplomacyRequests).toHaveLength(0);
    });

    it('does not prune a peace request or treaty proposal before its 10-turn TTL', () => {
      const state = makeTreatyState();
      let next = enqueueTreatyProposal(state, 'ai-1', 'player', 'open_borders', -1);
      next = { ...next, turn: next.turn + 9 };
      next = pruneExpiredDiplomaticRequests(next);
      expect(next.pendingDiplomacyRequests).toHaveLength(1);
    });

    it('tolerates a legacy-shaped peace request (no treatyType/turnsRemaining) when pruning', () => {
      const state = makeTreatyState();
      // Shaped like a pre-#554 save: only the original peace-request fields.
      state.pendingDiplomacyRequests = [
        { id: 'peace:ai-1:player:1', type: 'peace', fromCivId: 'ai-1', toCivId: 'player', turnIssued: state.turn },
      ];
      const next = pruneExpiredDiplomaticRequests({ ...state, turn: state.turn + 5 });
      expect(next.pendingDiplomacyRequests).toHaveLength(1);
      const pruned = pruneExpiredDiplomaticRequests({ ...state, turn: state.turn + 11 });
      expect(pruned.pendingDiplomacyRequests).toHaveLength(0);
    });
  });
});
