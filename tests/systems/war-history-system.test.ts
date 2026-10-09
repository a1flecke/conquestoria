import { describe, it, expect, vi } from 'vitest';
import {
  declareWarRecord,
  recordParticipantLeft,
  recordParticipantEliminated,
  recordCityCaptured,
  recordGoalDeclared,
  withSettlementSigned,
  findActiveWarForCiv,
  findActiveWarBetween,
  getWarOrdinal,
  getWarPresentationForViewer,
  getWarsForViewer,
  isActiveParticipant,
  sideOf,
  MAX_WAR_HISTORY_EVENTS,
} from '@/systems/war-history-system';
import { declareMajorWar, makeMajorPeace } from '@/systems/diplomacy-system';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { declareWarGoal } from '@/systems/war-goal-system';
import { executeSettlement } from '@/systems/settlement-system';
import { EventBus } from '@/core/event-bus';
import { commitVassalageAgreement, releaseVassal, resolveIndependence } from '@/systems/diplomacy-vassalage';
import { makeSovereigntyFixture } from '../helpers/sovereignty-fixture';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import { enqueueSettlementOffer, acceptSettlementOffer } from '@/systems/settlement-system';
import { enqueuePeaceRequest } from '@/systems/diplomacy-requests';
import { TECH_TREE } from '@/systems/tech-definitions';
import { makeWarHistoryFixture } from './helpers/war-history-fixture';
import type { GameState } from '@/core/types';

// hasMetCivilization is reciprocal (viewer knows target OR target knows
// viewer) -- the fixture starts with everyone knowing everyone, so both
// directions must be cleared to simulate "never met."
function clearMutualContact(state: GameState, a: string, b: string): GameState {
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [a]: { ...state.civilizations[a], knownCivilizations: (state.civilizations[a].knownCivilizations ?? []).filter(id => id !== b) },
      [b]: { ...state.civilizations[b], knownCivilizations: (state.civilizations[b].knownCivilizations ?? []).filter(id => id !== a) },
    },
  };
}

describe('war history system (#991)', () => {
  describe('sovereignty transaction sequences', () => {
    it('intersecting wars retain independent facts and each conclude exactly once', () => {
      let state = makeSovereigntyFixture();
      state = declareMajorWar(state, 'player-1', 'player-2');
      state = declareMajorWar(state, 'player-3', 'player-4');
      state = declareMajorWar(state, 'player-1', 'player-3');
      const pairs = [['player-1', 'player-2'], ['player-3', 'player-4'], ['player-1', 'player-3']];
      const recordIds = pairs.map(([a, b]) => findActiveWarBetween(state, a, b)!.id);
      expect(new Set(recordIds).size).toBe(3);
      assertSaveStateInvariants(state, 'intersecting declarations');
      for (const [a, b] of pairs) {
        state = makeMajorPeace(state, a, b);
        expect(state.civilizations[a].diplomacy.atWarWith).not.toContain(b);
        assertSaveStateInvariants(state, 'intersecting peace');
      }
      for (const id of recordIds) {
        expect(state.wars![id].outcome).toBe('white-peace');
        expect(state.wars![id].events.filter(e => e.type === 'concluded')).toHaveLength(1);
      }
      state = declareMajorWar(state, 'player-1', 'player-2');
      expect(getWarOrdinal(state, findActiveWarBetween(state, 'player-1', 'player-2')!.id)).toBe(2);
    });

    it.each(['player-1', 'player-2'] as const)('eliminating %s conserves surviving wars and removes live obligations', deadId => {
      let state = makeSovereigntyFixture();
      const bus = new EventBus();
      // An earned past peak and era unlock the existing consent contract.
      state.civilizations['player-2'].techState.completed = TECH_TREE.filter(t => t.era <= 2).map(t => t.id);
      state.civilizations['player-2'].diplomacy.vassalage.peakCities = 3;
      state.currentPlayer = 'player-3';
      state = commitVassalageAgreement(state, 'player-2', 'player-1', bus);
      expect(state.civilizations['player-2'].diplomacy.vassalage.overlord).toBe('player-1');
      state = declareMajorWar(state, 'player-1', 'player-3');
      state = declareMajorWar(state, 'player-1', 'player-4');
      state = enqueueSettlementOffer(state, 'player-3', deadId, [], bus);
      expect(state.pendingDiplomacyRequests).toHaveLength(1);
      const before = structuredClone(state);
      const cityId = state.civilizations[deadId].cities[0];
      const after = resolveMajorCityCapture(state, cityId, 'player-3', 'raze', state.turn, bus).state;
      expect(after.civilizations[deadId].isEliminated).toBe(true);
      expect(after.civilizations['player-2'].diplomacy.vassalage.overlord).toBeNull();
      expect(after.civilizations['player-1'].diplomacy.vassalage.vassals).toEqual([]);
      expect(after.pendingDiplomacyRequests).toEqual([]);
      const survivor = deadId === 'player-1' ? 'player-2' : 'player-1';
      expect(after.civilizations[survivor].diplomacy.atWarWith).toEqual(expect.arrayContaining(['player-3', 'player-4']));
      assertSaveStateInvariants(after, 'multiparty elimination');
      assertSimulationEquivalent(normalizeLoadedState(JSON.parse(JSON.stringify(after))), after, 'elimination writer');
      expect(state).toEqual(before);
    });

    it.each(['peace-first', 'settlement-first'] as const)('competing resolution requests: %s', order => {
      let state = declareMajorWar(makeSovereigntyFixture(), 'player-1', 'player-2');
      const bus = new EventBus();
      if (order === 'peace-first') {
        state = enqueuePeaceRequest(state, 'player-1', 'player-2', bus);
        state = enqueueSettlementOffer(state, 'player-2', 'player-1', [], bus);
      } else {
        state = enqueueSettlementOffer(state, 'player-1', 'player-2', [], bus);
        state = enqueuePeaceRequest(state, 'player-2', 'player-1', bus);
      }
      expect(state.pendingDiplomacyRequests).toHaveLength(1);
      if (order === 'settlement-first') {
        const id = state.pendingDiplomacyRequests![0].id;
        state = acceptSettlementOffer(state, 'player-2', id, bus);
        expect(acceptSettlementOffer(state, 'player-2', id, bus)).toBe(state);
        const record = Object.values(state.wars!)[0];
        expect(record.outcome).toBe('settled');
        expect(record.events.filter(e => e.type === 'settlement-signed')).toHaveLength(1);
        expect(state.pendingDiplomacyRequests).toEqual([]);
      }
      assertSaveStateInvariants(state, order);
    });
  });
  describe('declareWarRecord', () => {
    it('creates a new record with both original participants', () => {
      const state = makeWarHistoryFixture();
      const next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const record = findActiveWarForCiv(next, 'attacker');
      expect(record).toBeDefined();
      expect(record!.originalAggressorId).toBe('attacker');
      expect(record!.originalDefenderId).toBe('defender');
      expect(sideOf(record!, 'attacker')).toBe('aggressor');
      expect(sideOf(record!, 'defender')).toBe('defender');
      expect(record!.events[0]).toMatchObject({ type: 'declared', aggressorId: 'attacker', defenderId: 'defender' });
    });

    it('is idempotent when the pair is already an active war', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const before = next;
      next = declareWarRecord(next, 'attacker', 'defender', next.turn);
      expect(next).toBe(before);
    });

    it('is deterministic: same state produces the same war id and name template every time', () => {
      const state = makeWarHistoryFixture();
      const a = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const b = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const recordA = findActiveWarForCiv(a, 'attacker')!;
      const recordB = findActiveWarForCiv(b, 'attacker')!;
      expect(recordA.id).toBe(recordB.id);
      expect(recordA.nameTemplateIndex).toBe(recordB.nameTemplateIndex);
    });

    it('assigns a stable, incrementing war id via idCounters.nextWarId', () => {
      const state = makeWarHistoryFixture();
      const next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.id).toMatch(/^war-\d+$/);
      expect(next.idCounters.nextWarId).toBe(Number(record.id.split('-')[1]) + 1);
    });
  });

  describe('drag-in: a new bilateral pair joins an existing active record', () => {
    it('a vassal dragged into its overlord\'s war joins the SAME record, on the overlord\'s side', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const warIdBefore = findActiveWarForCiv(next, 'attacker')!.id;
      // Simulate the drag-in `addWarPair` performs: the vassal becomes hostile to the same defender.
      next = declareWarRecord(next, 'vassal', 'defender', next.turn);
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.id).toBe(warIdBefore);
      expect(isActiveParticipant(record, 'vassal')).toBe(true);
      expect(sideOf(record, 'vassal')).toBe('aggressor');
      expect(Object.keys(next.wars ?? {})).toHaveLength(1);
    });

    it('records a participant-joined event for the drag-in', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = declareWarRecord(next, 'vassal', 'defender', next.turn + 1);
      const record = findActiveWarForCiv(next, 'vassal')!;
      expect(record.events.some(e => e.type === 'participant-joined' && e.civId === 'vassal')).toBe(true);
    });

    it('a genuinely separate pair (neither side already at war) starts its own new record', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = declareWarRecord(next, 'vassal', 'bystander', next.turn);
      expect(Object.keys(next.wars ?? {})).toHaveLength(2);
    });
  });

  describe('recordParticipantLeft / conclusion', () => {
    it('a two-party peace concludes the war with outcome white-peace', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = recordParticipantLeft(next, 'attacker', 'defender', next.turn + 5);
      next = recordParticipantLeft(next, 'defender', 'attacker', next.turn + 5);
      const record = next.wars![warId]!;
      expect(record.endTurn).toBe(next.turn + 5);
      expect(record.outcome).toBe('white-peace');
    });

    it('a war stays active while only ONE side has left (multi-party still fighting)', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = declareWarRecord(next, 'vassal', 'defender', next.turn);
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      // 'attacker' alone leaves; 'vassal' is still fighting on the same (aggressor) side.
      next = recordParticipantLeft(next, 'attacker', 'defender', next.turn + 2);
      expect(next.wars![warId]!.endTurn).toBeUndefined();
      expect(isActiveParticipant(next.wars![warId]!, 'vassal')).toBe(true);
    });

    it('is a no-op when there is no active war between the pair', () => {
      const state = makeWarHistoryFixture();
      const next = recordParticipantLeft(state, 'attacker', 'defender', state.turn);
      expect(next).toBe(state);
    });
  });

  describe('recordParticipantEliminated', () => {
    it('marks the civ left in every active war it holds and concludes a now-empty side', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = recordParticipantEliminated(next, 'defender', next.turn + 10);
      const record = next.wars![warId]!;
      expect(record.outcome).toBe('defender-eliminated');
      expect(record.endTurn).toBe(next.turn + 10);
      expect(record.events.some(e => e.type === 'participant-eliminated' && e.civId === 'defender')).toBe(true);
    });
  });

  describe('recordCityCaptured / recordGoalDeclared', () => {
    it('records a city capture event on the active war between the two civs', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const cityId = state.civilizations['defender'].cities[0];
      next = recordCityCaptured(next, cityId, 'Thebes', 'defender', 'attacker', next.turn + 3, false);
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.events).toContainEqual({ type: 'city-captured', turn: next.turn + 3, cityId, cityName: 'Thebes', fromCivId: 'defender', toCivId: 'attacker', wasCapital: false });
    });

    it('is a no-op when the two civs are not at war', () => {
      const state = makeWarHistoryFixture();
      const next = recordCityCaptured(state, 'city-x', 'X', 'defender', 'attacker', state.turn, false);
      expect(next).toBe(state);
    });

    it('records a goal-declared event', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = recordGoalDeclared(next, 'attacker', 'defender', 'conquer_city', next.turn);
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.events.some(e => e.type === 'goal-declared' && e.kind === 'conquer_city')).toBe(true);
    });
  });

  describe('withSettlementSigned owns the settlement-before-peace ordering (#1014)', () => {
    const endWar = (s: GameState) => {
      const left = recordParticipantLeft(s, 'attacker', 'defender', s.turn);
      return recordParticipantLeft(left, 'defender', 'attacker', left.turn);
    };

    it('produces outcome "settled" (not "white-peace") because the event exists before the transition runs', () => {
      const state = makeWarHistoryFixture();
      const declared = declareWarRecord(state, 'attacker', 'defender', state.turn);
      let seenBeforeTransition = false;

      const next = withSettlementSigned(declared, 'attacker', 'defender', 2, declared.turn, withEvent => {
        seenBeforeTransition = Object.values(withEvent.wars!).some(w => w.events.some(e => e.type === 'settlement-signed'));
        return endWar(withEvent);
      });

      expect(seenBeforeTransition).toBe(true);
      const record = Object.values(next.wars!).find(w => w.originalAggressorId === 'attacker')!;
      expect(record.outcome).toBe('settled');
    });

    it('a plain peace with no settlement still concludes "white-peace" (the contrast that makes the ordering matter)', () => {
      const state = makeWarHistoryFixture();
      const next = endWar(declareWarRecord(state, 'attacker', 'defender', state.turn));
      const record = Object.values(next.wars!).find(w => w.originalAggressorId === 'attacker')!;
      expect(record.outcome).toBe('white-peace');
    });

    it('still runs the peace transition when there is no active war record to annotate', () => {
      const state = makeWarHistoryFixture();
      const ran = vi.fn((s: GameState) => s);

      const next = withSettlementSigned(state, 'attacker', 'defender', 1, state.turn, ran);

      expect(ran).toHaveBeenCalledTimes(1);
      expect(next).toBe(state);
    });

    it('the wrong-order primitive is not exported: the event can only be written through the ordering-owning function', async () => {
      const mod = await import('@/systems/war-history-system');
      expect(mod).not.toHaveProperty('recordSettlementSigned');
    });
  });

  describe('event cap', () => {
    it('never exceeds MAX_WAR_HISTORY_EVENTS, keeping the declared event', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      for (let i = 0; i < MAX_WAR_HISTORY_EVENTS + 20; i++) {
        next = recordGoalDeclared(next, 'attacker', 'defender', 'conquer_city', next.turn + i);
      }
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.events.length).toBeLessThanOrEqual(MAX_WAR_HISTORY_EVENTS);
      expect(record.events[0]!.type).toBe('declared');
    });
  });

  describe('naming and ordinal', () => {
    it('a second war between the same pair gets a higher ordinal than the first', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const firstWarId = findActiveWarForCiv(next, 'attacker')!.id;
      next = recordParticipantLeft(next, 'attacker', 'defender', next.turn + 1);
      next = recordParticipantLeft(next, 'defender', 'attacker', next.turn + 1);
      next = declareWarRecord(next, 'attacker', 'defender', next.turn + 10);
      const secondWarId = findActiveWarForCiv(next, 'attacker')!.id;
      expect(getWarOrdinal(next, firstWarId)).toBe(1);
      expect(getWarOrdinal(next, secondWarId)).toBe(2);
    });
  });

  describe('getWarPresentationForViewer (#1002 viewer safety)', () => {
    it('returns null for a viewer who has met neither participant', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = clearMutualContact(next, 'bystander', 'attacker');
      next = clearMutualContact(next, 'bystander', 'defender');
      expect(getWarPresentationForViewer(next, 'bystander', findActiveWarForCiv(next, 'attacker')!.id)).toBeNull();
    });

    it('redacts an unmet participant\'s name but still shows the war to a viewer who knows the other side', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      // 'bystander' knows 'attacker' but has never met 'defender'.
      next = clearMutualContact(next, 'bystander', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      const presentation = getWarPresentationForViewer(next, 'bystander', warId);
      expect(presentation).not.toBeNull();
      const defenderRow = presentation!.participants.find(p => p.side === 'defender')!;
      expect(defenderRow.civId).toBeNull();
      expect(defenderRow.name).toBe('an unknown civilization');
      const aggressorRow = presentation!.participants.find(p => p.side === 'aggressor')!;
      expect(aggressorRow.civId).toBe('attacker');
    });

    it('a participant sees the full record, including its own war', () => {
      const state = makeWarHistoryFixture();
      const next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      const presentation = getWarPresentationForViewer(next, 'attacker', warId);
      expect(presentation).not.toBeNull();
      expect(presentation!.participants.every(p => p.civId !== null)).toBe(true);
    });
  });

  describe('getWarsForViewer', () => {
    it('lists only wars the viewer is entitled to know about, newest first', () => {
      const state = makeWarHistoryFixture();
      let next = declareWarRecord(state, 'attacker', 'defender', state.turn);
      next = recordParticipantLeft(next, 'attacker', 'defender', next.turn + 1);
      next = recordParticipantLeft(next, 'defender', 'attacker', next.turn + 1);
      next = declareWarRecord(next, 'attacker', 'defender', next.turn + 20);
      next = clearMutualContact(next, 'bystander', 'attacker');
      next = clearMutualContact(next, 'bystander', 'defender');
      expect(getWarsForViewer(next, 'bystander')).toEqual([]);
      const forAttacker = getWarsForViewer(next, 'attacker');
      expect(forAttacker).toHaveLength(2);
      expect(forAttacker[0]!.startTurn).toBeGreaterThan(forAttacker[1]!.startTurn);
    });
  });

  describe('end-to-end wiring through the real diplomacy transitions', () => {
    it('a combatant making one peace stays active against its other opponent', () => {
      let next = declareMajorWar(makeWarHistoryFixture(), 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = declareMajorWar(next, 'bystander', 'attacker');
      next = makeMajorPeace(next, 'attacker', 'defender');
      expect(next.civilizations.attacker.diplomacy.atWarWith).toContain('bystander');
      expect(isActiveParticipant(next.wars![warId]!, 'attacker')).toBe(true);
      expect(next.wars![warId]!.endTurn).toBeUndefined();
      next = makeMajorPeace(next, 'attacker', 'bystander');
      expect(next.wars![warId]!.endTurn).toBeDefined();
    });

    it('partial peace preserves the enemy participant while a released vassal still fights', () => {
      let next = declareMajorWar(makeWarHistoryFixture(), 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = releaseVassal(next, 'attacker', 'vassal', new EventBus());
      next = makeMajorPeace(next, 'attacker', 'defender');
      expect(next.civilizations.defender.diplomacy.atWarWith).toContain('vassal');
      expect(next.wars![warId]!.endTurn).toBeUndefined();
      expect(isActiveParticipant(next.wars![warId]!, 'defender')).toBe(true);
      const beforeRepeat = next;
      expect(makeMajorPeace(next, 'attacker', 'defender')).toBe(beforeRepeat);
      next = makeMajorPeace(next, 'vassal', 'defender');
      expect(next.wars![warId]!.outcome).toBe('white-peace');
      expect(next.wars![warId]!.events.filter(e => e.type === 'concluded')).toHaveLength(1);
    });

    it('refused independence records a new opposing war without erasing the inherited war', () => {
      let next = declareMajorWar(makeWarHistoryFixture(), 'attacker', 'defender');
      next = {
        ...next,
        civilizations: { ...next.civilizations, vassal: {
          ...next.civilizations.vassal,
          diplomacy: { ...next.civilizations.vassal.diplomacy, vassalage: {
            ...next.civilizations.vassal.diplomacy.vassalage, protectionScore: 0,
          } },
        } },
      };
      next = resolveIndependence(next, 'vassal', 'attacker', false, new EventBus());
      expect(next.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
      expect(next.civilizations.vassal.diplomacy.atWarWith).toEqual(expect.arrayContaining(['attacker', 'defender']));
      const independenceWar = findActiveWarBetween(next, 'vassal', 'attacker');
      expect(independenceWar).toBeDefined();
      expect(sideOf(independenceWar!, 'vassal')).not.toBe(sideOf(independenceWar!, 'attacker'));
      expect(findActiveWarBetween(next, 'vassal', 'defender')).toBeDefined();
      expect(resolveIndependence(next, 'vassal', 'attacker', false, new EventBus())).toBe(next);
    });

    it.each(['occupy', 'raze'] as const)('retains the final %s capture before elimination closes the war', mode => {
      const initial = makeWarHistoryFixture();
      const original = structuredClone(initial);
      const run = () => {
        let next = declareMajorWar(initial, 'attacker', 'defender');
        const warId = findActiveWarForCiv(next, 'attacker')!.id;
        const cityIds = [...next.civilizations.defender.cities];
        for (const cityId of cityIds) {
          next = resolveMajorCityCapture(next, cityId, 'attacker', mode, next.turn, new EventBus()).state;
        }
        const record = next.wars![warId]!;
        expect(next.civilizations.defender.isEliminated).toBe(true);
        expect(record.events.filter(e => e.type === 'city-captured').map(e => e.cityId)).toEqual(cityIds);
        expect(record.events.slice(-3).map(e => e.type)).toEqual(['city-captured', 'participant-eliminated', 'concluded']);
        expect(record.events.filter(e => e.type === 'concluded')).toHaveLength(1);
        expect(record.outcome).toBe('defender-eliminated');
        return next;
      };
      expect(run()).toEqual(run());
      expect(initial).toEqual(original);
    });

    it('declareMajorWar creates a war record via addWarPair', () => {
      const state = makeWarHistoryFixture();
      const next = declareMajorWar(state, 'attacker', 'defender');
      const record = findActiveWarForCiv(next, 'attacker');
      expect(record).toBeDefined();
      expect(record!.originalAggressorId).toBe('attacker');
      expect(record!.originalDefenderId).toBe('defender');
    });

    it('a vassal declaring war alongside its overlord drags the vassal into the SAME record (via applyVassalageWarConsequences)', () => {
      const state = makeWarHistoryFixture();
      const next = declareMajorWar(state, 'attacker', 'defender');
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(isActiveParticipant(record, 'vassal')).toBe(true);
      expect(sideOf(record, 'vassal')).toBe('aggressor');
      expect(Object.keys(next.wars ?? {})).toHaveLength(1);
    });

    it('makeMajorPeace concludes the record with outcome white-peace', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = makeMajorPeace(next, 'attacker', 'defender');
      expect(next.wars![warId]!.endTurn).toBeDefined();
      expect(next.wars![warId]!.outcome).toBe('white-peace');
    });

    it('makeMajorPeace between the overlord and the enemy also frees the vassal from the same record (#1054)', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      next = makeMajorPeace(next, 'attacker', 'defender');
      const record = next.wars![warId]!;
      expect(isActiveParticipant(record, 'vassal')).toBe(false);
      expect(record.participants.find(p => p.civId === 'vassal')?.leaveReason).toBe('peace');
    });

    it('resolveMajorCityCapture records a city-captured event, correctly flagging a capital capture', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const capitalId = next.civilizations['defender'].cities[0]!;
      const capitalName = next.cities[capitalId]!.name;
      const bus = new EventBus();
      next = resolveMajorCityCapture(next, capitalId, 'attacker', 'occupy', next.turn, bus).state;
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.events).toContainEqual(expect.objectContaining({
        type: 'city-captured', cityId: capitalId, cityName: capitalName, fromCivId: 'defender', toCivId: 'attacker', wasCapital: true,
      }));
    });

    it('eliminateCivilization concludes the war with outcome defender-eliminated', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      // Strip 'defender' of every owned asset so it qualifies for elimination.
      next = {
        ...next,
        cities: Object.fromEntries(Object.entries(next.cities).map(([id, c]) => [id, c.owner === 'defender' ? { ...c, owner: 'attacker' } : c])),
        civilizations: { ...next.civilizations, defender: { ...next.civilizations['defender'], cities: [], units: [] } },
      };
      const result = eliminateCivilization(next, 'defender', 'attacker');
      expect(result.eliminated).toBe(true);
      if (!result.eliminated) return;
      const record = result.state.wars![warId]!;
      expect(record.outcome).toBe('defender-eliminated');
      expect(record.events.some(e => e.type === 'participant-eliminated' && e.civId === 'defender')).toBe(true);
    });

    it('declareWarGoal records a goal-declared event on the active war', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const targetCityId = next.civilizations['defender'].cities[0]!;
      next = declareWarGoal(next, 'attacker', 'defender', 'conquer_city', targetCityId, next.turn);
      const record = findActiveWarForCiv(next, 'attacker')!;
      expect(record.events.some(e => e.type === 'goal-declared' && e.civId === 'attacker' && e.kind === 'conquer_city')).toBe(true);
    });

    it('executeSettlement records a settlement-signed event and concludes the war with outcome settled', () => {
      const state = makeWarHistoryFixture();
      let next = declareMajorWar(state, 'attacker', 'defender');
      const warId = findActiveWarForCiv(next, 'attacker')!.id;
      const bus = new EventBus();
      next = executeSettlement(next, 'attacker', 'defender', [], next.turn, bus);
      const record = next.wars![warId]!;
      expect(record.events.some(e => e.type === 'settlement-signed')).toBe(true);
      expect(record.outcome).toBe('settled');
      expect(record.endTurn).toBeDefined();
    });
  });
});
