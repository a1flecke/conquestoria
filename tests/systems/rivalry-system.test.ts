import { describe, it, expect } from 'vitest';
import {
  deriveRivalryFacts,
  classifyRivalry,
  getRivalryProfile,
  getRivalries,
  getRivalryForViewer,
  getRivalriesForViewer,
} from '@/systems/rivalry-system';
import { declareMajorWar, makeMajorPeace, signTreaty } from '@/systems/diplomacy-system';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { EventBus } from '@/core/event-bus';
import { makeWarHistoryFixture } from './helpers/war-history-fixture';
import type { GameState } from '@/core/types';

function occupyDefenderCapital(state: GameState): GameState {
  const capitalId = state.civilizations['defender'].cities[0]!;
  const bus = new EventBus();
  return resolveMajorCityCapture(state, capitalId, 'attacker', 'occupy', state.turn, bus).state;
}

describe('rivalry-system (#989)', () => {
  describe('deriveRivalryFacts', () => {
    it('produces no facts for a pair with no shared history', () => {
      const state = makeWarHistoryFixture();
      expect(deriveRivalryFacts(state, 'attacker', 'bystander')).toEqual([]);
    });

    it('records a capital-captured fact when the pair fought and the capital fell', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      const facts = deriveRivalryFacts(state, 'attacker', 'defender');
      expect(facts).toContainEqual(expect.objectContaining({ type: 'capital-captured' }));
      // and the mirror image from the other side's own perspective
      const defenderFacts = deriveRivalryFacts(state, 'defender', 'attacker');
      expect(defenderFacts).toContainEqual(expect.objectContaining({ type: 'capital-lost' }));
    });

    it('records repeated-wars only from the second war onward, with an incrementing warCount', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      const facts = deriveRivalryFacts(state, 'attacker', 'defender');
      const repeated = facts.filter(f => f.type === 'repeated-wars');
      expect(repeated).toHaveLength(1);
      expect(repeated[0]!.warCount).toBe(2);
    });

    it('records a decisive-victory / decisive-defeat pair when one side is eliminated mid-war', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      // Strip 'defender' of every owned asset so it qualifies for elimination.
      state = {
        ...state,
        cities: Object.fromEntries(Object.entries(state.cities).map(([id, c]) => [id, c.owner === 'defender' ? { ...c, owner: 'attacker' } : c])),
        civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], cities: [], units: [] } },
      };
      state = eliminateCivilization(state, 'defender', 'attacker').state;
      expect(deriveRivalryFacts(state, 'attacker', 'defender')).toContainEqual(expect.objectContaining({ type: 'decisive-victory' }));
      expect(deriveRivalryFacts(state, 'defender', 'attacker')).toContainEqual(expect.objectContaining({ type: 'decisive-defeat' }));
    });

    it('records a strategic-strike fact from strategicStrikesReceivedFrom', () => {
      let state = makeWarHistoryFixture();
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          attacker: {
            ...state.civilizations['attacker'],
            diplomacy: { ...state.civilizations['attacker'].diplomacy, strategicStrikesReceivedFrom: ['defender'] },
          },
        },
      };
      expect(deriveRivalryFacts(state, 'attacker', 'defender')).toContainEqual(expect.objectContaining({ type: 'strategic-strike' }));
    });

    it('is a pure function -- calling it twice on the same state yields byte-identical output', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      const a = deriveRivalryFacts(state, 'attacker', 'defender');
      const b = deriveRivalryFacts(state, 'attacker', 'defender');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('never fabricates a rivalry fact between co-belligerents dragged onto the SAME side of a war (a vassal fighting alongside its overlord is not the overlord\'s rival)', () => {
      let state = makeWarHistoryFixture();
      // 'vassal' is attacker's committed vassal in the fixture, so declaring
      // attacker's war against defender drags vassal onto ATTACKER'S side
      // (#1054) -- attacker and vassal fight the SAME war, never each other.
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      // Two real wars exist naming BOTH 'attacker' and 'vassal' as participants
      // (on the same side each time) -- a naive "both ids appear in this
      // record" filter would misread this as two wars fought AGAINST each
      // other.
      expect(deriveRivalryFacts(state, 'attacker', 'vassal')).toEqual([]);
      expect(getRivalryProfile(state, 'attacker', 'vassal').status).toBe('none');
    });
  });

  describe('classifyRivalry / getRivalryProfile', () => {
    it('a single mild fact (one capital capture) is not yet enough to be a rival', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      expect(getRivalryProfile(state, 'attacker', 'defender').status).toBe('none');
    });

    it('a capital capture plus a second war crosses the rival threshold', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      expect(getRivalryProfile(state, 'attacker', 'defender').status).toBe('rival');
      // and symmetric from the other side
      expect(getRivalryProfile(state, 'defender', 'attacker').status).toBe('rival');
    });

    it('a rival that becomes an ally transitions to reconciled-ally', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          attacker: { ...state.civilizations['attacker'], diplomacy: signTreaty(state.civilizations['attacker'].diplomacy, 'attacker', 'defender', 'alliance', -1, state.turn) },
          defender: { ...state.civilizations['defender'], diplomacy: signTreaty(state.civilizations['defender'].diplomacy, 'defender', 'attacker', 'alliance', -1, state.turn) },
        },
      };
      expect(getRivalryProfile(state, 'attacker', 'defender').status).toBe('reconciled-ally');
    });

    it('a rival eliminated mid-campaign resolves cleanly to respected-foe, not a dangling reference', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      state = {
        ...state,
        cities: Object.fromEntries(Object.entries(state.cities).map(([id, c]) => [id, c.owner === 'defender' ? { ...c, owner: 'attacker' } : c])),
        civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], cities: [], units: [] } },
      };
      state = eliminateCivilization(state, 'defender', 'attacker').state;
      const profile = getRivalryProfile(state, 'attacker', 'defender');
      expect(profile.status).toBe('respected-foe');
      expect(() => JSON.stringify(profile)).not.toThrow();
    });

    it('an old, undecayed-at-peak rivalry with no recent activity cools rather than staying an active rival forever', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      state = makeMajorPeace(state, 'attacker', 'defender');
      const longAfter = { ...state, turn: state.turn + 200 };
      expect(getRivalryProfile(longAfter, 'attacker', 'defender').status).toBe('cooling');
    });

    it('classifyRivalry never uses randomness -- identical facts always classify identically', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      const facts = deriveRivalryFacts(state, 'attacker', 'defender');
      const first = classifyRivalry(state, 'attacker', 'defender', facts);
      const second = classifyRivalry(state, 'attacker', 'defender', facts);
      expect(first).toBe(second);
    });
  });

  describe('getRivalries', () => {
    it('produces zero rivals when nobody qualifies', () => {
      const state = makeWarHistoryFixture();
      expect(getRivalries(state, 'attacker')).toEqual([]);
    });

    it('produces one rival per qualifying opponent, independently -- not capped to a single designated nemesis', () => {
      let state = makeWarHistoryFixture();
      // attacker vs defender: repeated wars + capital capture -> rival
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      // attacker vs bystander: also repeated wars + a strategic strike -> rival
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'bystander');
      state = makeMajorPeace(state, 'attacker', 'bystander');
      state = declareMajorWar(state, 'attacker', 'bystander');
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          attacker: {
            ...state.civilizations['attacker'],
            diplomacy: { ...state.civilizations['attacker'].diplomacy, strategicStrikesReceivedFrom: ['bystander'] },
          },
        },
      };
      const rivals = getRivalries(state, 'attacker').map(r => r.opponentCivId).sort();
      expect(rivals).toEqual(['bystander', 'defender']);
    });
  });

  describe('viewer safety (#989)', () => {
    it('returns null for an opponent the viewer has never met, even with real qualifying history', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      // bystander has never met defender: clear mutual knowledge
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          bystander: { ...state.civilizations['bystander'], knownCivilizations: (state.civilizations['bystander'].knownCivilizations ?? []).filter(id => id !== 'defender') },
        },
      };
      // bystander has NO history with defender at all in this scenario, so this
      // also proves the "no rivalry surface for someone you have no history
      // with" case; the unmet-viewer path is exercised directly below.
      expect(getRivalryForViewer(state, 'bystander', 'defender')).toBeNull();
    });

    it('never returns a rivalry against oneself', () => {
      const state = makeWarHistoryFixture();
      expect(getRivalryForViewer(state, 'attacker', 'attacker')).toBeNull();
    });

    it('returns a real rivalry once qualifying history exists and the viewer knows the opponent', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      const presentation = getRivalryForViewer(state, 'attacker', 'defender');
      expect(presentation).not.toBeNull();
      expect(presentation!.status).toBe('rival');
      expect(presentation!.facts.length).toBeGreaterThan(0);
      expect(presentation!.facts.every(f => typeof f.turn === 'number' && f.text.length > 0)).toBe(true);
    });

    it('hot seat: two seats derive independent rivalry views from the same world', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      // attacker has a real rivalry with defender; bystander has none at all.
      expect(getRivalriesForViewer(state, 'attacker').map(r => r.opponentCivId)).toEqual(['defender']);
      expect(getRivalriesForViewer(state, 'bystander')).toEqual([]);
    });
  });

  describe('save/reload determinism', () => {
    it('rivalry state is identical before and after a plain JSON round-trip of GameState', () => {
      let state = makeWarHistoryFixture();
      state = declareMajorWar(state, 'attacker', 'defender');
      state = occupyDefenderCapital(state);
      state = makeMajorPeace(state, 'attacker', 'defender');
      state = declareMajorWar(state, 'attacker', 'defender');
      const before = getRivalryProfile(state, 'attacker', 'defender');
      const reloaded = JSON.parse(JSON.stringify(state)) as GameState;
      const after = getRivalryProfile(reloaded, 'attacker', 'defender');
      expect(after).toEqual(before);
    });
  });
});
