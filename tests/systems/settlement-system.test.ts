import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  validateSettlementTerm,
  validateSettlementOffer,
  executeSettlement,
  proposeSettlement,
  enqueueSettlementOffer,
  acceptSettlementOffer,
  getPendingSettlementOfferForPair,
} from '@/systems/settlement-system';
import { isAtWar } from '@/systems/diplomacy-queries';
import { enqueuePeaceRequest } from '@/systems/diplomacy-requests';
import { makeWarGoalFixture } from './helpers/war-goal-fixture';
import type { SettlementTerm } from '@/core/types';

describe('settlement system (#988)', () => {
  describe('validateSettlementTerm', () => {
    it('accepts a city transfer between the two negotiating civs when the ceding side owns it', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const term: SettlementTerm = { kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term)).toEqual({ ok: true });
    });

    it('rejects a city transfer where the "ceding" civ does not own the city', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const term: SettlementTerm = { kind: 'transfer_city', cityId, fromCivId: 'attacker', toCivId: 'defender' };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term).ok).toBe(false);
    });

    it('rejects a city transfer naming a civ outside the negotiation', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const term: SettlementTerm = { kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'bystander' };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term).ok).toBe(false);
    });

    it('accepts reparations the payer can afford', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      state = { ...state, civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], gold: 100 } } };
      const term: SettlementTerm = { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 50 };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term)).toEqual({ ok: true });
    });

    it('rejects reparations the payer cannot afford', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      state = { ...state, civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], gold: 10 } } };
      const term: SettlementTerm = { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 50 };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term).ok).toBe(false);
    });

    it('rejects release_vassal when the named civ is not actually a vassal of the other party', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const term: SettlementTerm = { kind: 'release_vassal', vassalId: 'defender' };
      expect(validateSettlementTerm(state, 'attacker', 'defender', term).ok).toBe(false);
    });
  });

  describe('validateSettlementOffer', () => {
    it('requires the two civs to be at war', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const result = validateSettlementOffer(state, 'attacker', 'bystander', []);
      expect(result.ok).toBe(false);
    });

    it('accepts an empty-terms offer (a war-goal conference that ends in white peace)', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      expect(validateSettlementOffer(state, 'attacker', 'defender', [])).toEqual({ ok: true });
    });

    it('rejects the whole offer when any one term is illegal', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const terms: SettlementTerm[] = [
        { kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' },
        { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 999999 },
      ];
      expect(validateSettlementOffer(state, 'attacker', 'defender', terms).ok).toBe(false);
    });

    it('validates a vassalize term as legal even though the civs are currently at war (peace is bundled atomically)', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const terms: SettlementTerm[] = [{ kind: 'vassalize', vassalId: 'defender', overlordId: 'attacker' }];
      // This fixture's civs don't meet canOfferVassalage's decline thresholds,
      // so we only assert it fails for that *specific*, non-war-state reason,
      // not because "still at war" blocked it.
      const result = validateSettlementTerm(
        // Mirror what validateSettlementOffer does internally: check against a hypothetically-at-peace state.
        { ...state, civilizations: { ...state.civilizations, attacker: { ...state.civilizations['attacker'], diplomacy: { ...state.civilizations['attacker'].diplomacy, atWarWith: [] } }, defender: { ...state.civilizations['defender'], diplomacy: { ...state.civilizations['defender'].diplomacy, atWarWith: [] } } } },
        'attacker', 'defender', terms[0],
      );
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).not.toMatch(/war/i);
    });

    it('rejects an offer from or to a vassal (foreign policy belongs to the overlord, #1054)', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          attacker: {
            ...state.civilizations['attacker'],
            diplomacy: { ...state.civilizations['attacker'].diplomacy, vassalage: { ...state.civilizations['attacker'].diplomacy.vassalage, overlord: 'bystander' } },
          },
        },
      };
      expect(validateSettlementOffer(state, 'attacker', 'defender', []).ok).toBe(false);
    });
  });

  describe('executeSettlement', () => {
    it('applies every term and ends the war atomically', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      state = { ...state, civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], gold: 100 } } };
      const terms: SettlementTerm[] = [
        { kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' },
        { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 30 },
      ];
      const next = executeSettlement(state, 'attacker', 'defender', terms, state.turn, bus);
      expect(next.cities[cityId].owner).toBe('attacker');
      expect(next.civilizations['defender'].gold).toBe(70);
      expect(next.civilizations['attacker'].gold).toBe(state.civilizations['attacker'].gold + 30);
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(false);
      expect(isAtWar(next.civilizations['defender'].diplomacy, 'attacker')).toBe(false);
    });

    it('applies no term at all when the offer is illegal (no partial settlement)', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const terms: SettlementTerm[] = [
        { kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' },
        { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 999999 },
      ];
      const next = executeSettlement(state, 'attacker', 'defender', terms, state.turn, bus);
      expect(next).toBe(state);
      expect(next.cities[cityId].owner).toBe('defender');
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(true);
    });

    it('an empty-terms settlement is equivalent to white peace', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const next = executeSettlement(state, 'attacker', 'defender', [], state.turn, bus);
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(false);
    });
  });

  describe('proposeSettlement (human recipient)', () => {
    it('queues the offer instead of executing it immediately', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus, { defenderHuman: true });
      const next = proposeSettlement(state, 'attacker', 'defender', [], bus);
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(true);
      expect(getPendingSettlementOfferForPair(next, 'attacker', 'defender')).toBeDefined();
    });
  });

  describe('proposeSettlement (AI recipient)', () => {
    it('executes immediately when the AI values the terms acceptably', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus, { defenderHuman: false });
      state = { ...state, civilizations: { ...state.civilizations, attacker: { ...state.civilizations['attacker'], gold: 100 } } };
      // Reparations paid *to* the defender -- good for them.
      const terms: SettlementTerm[] = [{ kind: 'reparations', fromCivId: 'attacker', toCivId: 'defender', goldAmount: 50 }];
      const next = proposeSettlement(state, 'attacker', 'defender', terms, bus, { relationship: 10 });
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(false);
      expect(next.civilizations['defender'].gold).toBe(state.civilizations['defender'].gold + 50);
    });

    it('declines and leaves state unchanged when the AI finds the terms too costly', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus, { defenderHuman: false });
      const cityId = state.civilizations['defender'].cities[0];
      // Taking the defender's own city is a bad deal for them.
      const terms: SettlementTerm[] = [{ kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' }];
      const next = proposeSettlement(state, 'attacker', 'defender', terms, bus, { relationship: 10 });
      expect(next).toBe(state);
      expect(isAtWar(next.civilizations['attacker'].diplomacy, 'defender')).toBe(true);
    });

    it('an outmatched AI accepts even a costly city cession', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus, { defenderHuman: false });
      const cityId = state.civilizations['defender'].cities[0];
      const terms: SettlementTerm[] = [{ kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' }];
      const next = proposeSettlement(state, 'attacker', 'defender', terms, bus, {
        relationship: -30, targetVisibleStrength: 10, proposerVisibleStrength: 100,
      });
      expect(next.cities[cityId].owner).toBe('attacker');
    });
  });

  describe('enqueueSettlementOffer', () => {
    it('does not double-enqueue against an already-pending request for the same pair', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const withPeace = enqueuePeaceRequest(state, 'attacker', 'defender', bus);
      const next = enqueueSettlementOffer(withPeace, 'attacker', 'defender', [], bus);
      expect(next).toBe(withPeace);
    });
  });

  describe('acceptSettlementOffer', () => {
    it('executes the queued offer and removes it from the pending list', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      const cityId = state.civilizations['defender'].cities[0];
      const terms: SettlementTerm[] = [{ kind: 'transfer_city', cityId, fromCivId: 'defender', toCivId: 'attacker' }];
      state = enqueueSettlementOffer(state, 'attacker', 'defender', terms, bus);
      const request = getPendingSettlementOfferForPair(state, 'attacker', 'defender')!;
      const next = acceptSettlementOffer(state, 'defender', request.id, bus);
      expect(next.cities[cityId].owner).toBe('attacker');
      expect(getPendingSettlementOfferForPair(next, 'attacker', 'defender')).toBeUndefined();
    });

    it('is a no-op if a non-recipient tries to accept', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      state = enqueueSettlementOffer(state, 'attacker', 'defender', [], bus);
      const request = getPendingSettlementOfferForPair(state, 'attacker', 'defender')!;
      const next = acceptSettlementOffer(state, 'bystander', request.id, bus);
      expect(next).toBe(state);
    });
  });
});
