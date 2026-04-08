import { describe, it, expect } from 'vitest';
import {
  applyDiplomaticAction,
  createDiplomacyState,
  getRelationship,
  modifyRelationship,
  declareWar,
  makePeace,
  proposeTreaty,
  breakTreaty,
  processRelationshipDrift,
  decayEvents,
  getAvailableActions,
  isAtWar,
} from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

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
    it('proposeTreaty adds a treaty', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = proposeTreaty(state, 'player', 'ai-egypt', 'non_aggression_pact', 10, 15);
      expect(state.treaties).toHaveLength(1);
      expect(state.treaties[0].type).toBe('non_aggression_pact');
      expect(state.treaties[0].turnsRemaining).toBe(10);
      expect(state.treaties[0].civA).toBe('player');
    });

    it('trade_agreement adds gold per turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      state = proposeTreaty(state, 'player', 'ai-egypt', 'trade_agreement', -1, 20);
      expect(state.treaties[0].goldPerTurn).toBe(2);
    });

    it('breakTreaty removes treaty and penalizes -30', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = proposeTreaty(state, 'player', 'ai-egypt', 'non_aggression_pact', 10, 15);
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

    it('includes non_aggression_pact with civics tech', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', ['code-of-laws'], 1);
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
    it('applies Narnias treaty relationship bonus symmetrically when a treaty is signed', () => {
      const bus = new EventBus();
      const state = {
        turn: 12,
        civilizations: {
          player: {
            id: 'player',
            civType: 'narnia',
            diplomacy: createDiplomacyState(['player', 'ai-egypt'], 'player'),
          },
          'ai-egypt': {
            id: 'ai-egypt',
            civType: 'egypt',
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
});
