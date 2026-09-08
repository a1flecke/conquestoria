import { describe, expect, it, vi } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState, DiplomacyState } from '@/core/types';
import {
  declareMajorWar,
  makeMajorPeace,
  acceptVassalage,
  applyVassalageWarConsequences,
  proposeTreatyAgreement,
  acceptDiplomaticRequest,
  enqueuePeaceRequest,
  releaseVassal,
  isAtWar,
} from '@/systems/diplomacy-system';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertBilateralWar } from '../helpers/save-state-invariants';

// #1054 — an overlord controls its vassal's war and peace (a vassal is blocked
// from both `declare_war` and `request_peace`). Under that model, a war a vassal
// is in must not outlive its overlord's participation: when an overlord makes
// peace with an enemy, every one of its vassals at war with that enemy makes
// peace too (bilaterally). Design decision: bloc-wide peace, no persisted
// provenance (Option A).

function newGame(seed: string): GameState {
  return createNewGame({
    civType: 'generic', seed, mapSize: 'large', opponentCount: 3, gameTitle: 'vassal-war-exit',
  });
}

function majorIds(state: GameState, n: number): string[] {
  const ids = Object.keys(state.civilizations);
  if (ids.length < n) throw new Error(`need >=${n} major civs, got ${ids.length}`);
  return ids.slice(0, n);
}

/** Splice a vassalage link in and run the war-consequence propagation, the way
 *  commitVassalageAgreement does, without the eligibility gate. */
function vassalize(state: GameState, vassalId: string, overlordId: string, bus = new EventBus()): GameState {
  const { vassalState, overlordState } = acceptVassalage(
    state.civilizations[vassalId].diplomacy,
    state.civilizations[overlordId].diplomacy,
    vassalId, overlordId, state.turn,
  );
  const after: GameState = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [vassalId]: { ...state.civilizations[vassalId], diplomacy: vassalState },
      [overlordId]: { ...state.civilizations[overlordId], diplomacy: overlordState },
    },
  };
  return applyVassalageWarConsequences(state, after, bus);
}

function atWar(state: GameState, a: string, b: string): boolean {
  return isAtWar(state.civilizations[a].diplomacy, b);
}

describe('#1054 vassal leaves a war when its overlord makes peace', () => {
  it('O declares on E, V vassalizes and is auto-joined, then O/E peace removes V from the war', () => {
    let state = newGame('1054-basic');
    const [O, V, E] = majorIds(state, 3);

    state = declareMajorWar(state, O, E, new EventBus());
    expect(atWar(state, O, E)).toBe(true);

    state = vassalize(state, V, O);
    expect(atWar(state, V, E)).toBe(true); // auto-joined
    expect(atWar(state, E, V)).toBe(true);

    state = makeMajorPeace(state, O, E);

    expect(atWar(state, O, E)).toBe(false);
    expect(atWar(state, V, E)).toBe(false); // #1054: vassal follows the overlord out
    expect(atWar(state, E, V)).toBe(false); // bilateral
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('works when the vassal belongs to the OTHER peace party', () => {
    let state = newGame('1054-other-side');
    const [O, V, E] = majorIds(state, 3);

    state = declareMajorWar(state, E, O, new EventBus()); // E at war with O
    state = vassalize(state, V, O);
    expect(atWar(state, V, E)).toBe(true);

    // peace initiated naming E first — reconciliation must still find O's vassal
    state = makeMajorPeace(state, E, O);

    expect(atWar(state, V, E)).toBe(false);
    expect(atWar(state, E, V)).toBe(false);
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('the AI-consent peace path (proposeTreatyAgreement) also frees the vassal', () => {
    let state = newGame('1054-ai-consent');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);

    // make E an AI that will consent to peace (relationship high enough)
    state.civilizations[E].isHuman = false;
    state.civilizations[E].diplomacy.relationships[O] = 60;
    state = proposeTreatyAgreement(state, O, E, 'peace', new EventBus());

    expect(atWar(state, O, E)).toBe(false); // consent granted
    expect(atWar(state, V, E)).toBe(false);
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('the human-accepted peace-request path (acceptDiplomaticRequest) also frees the vassal', () => {
    let state = newGame('1054-human-accept');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);

    state.civilizations[O].isHuman = true; // O queues the request, E's human accepts
    const bus = new EventBus();
    state = enqueuePeaceRequest(state, E, O, bus);
    const req = state.pendingDiplomacyRequests!.find(r => r.type === 'peace');
    expect(req).toBeDefined();
    state = acceptDiplomaticRequest(state, O, req!.id, bus);

    expect(atWar(state, O, E)).toBe(false);
    expect(atWar(state, V, E)).toBe(false);
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('emits diplomacy:vassal-auto-peace for each freed vassal', () => {
    let state = newGame('1054-event');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);

    const bus = new EventBus();
    const spy = vi.fn();
    bus.on('diplomacy:vassal-auto-peace', spy);
    state = makeMajorPeace(state, O, E, bus);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ vassalId: V, overlordId: O, targetCivId: E }));
  });

  describe('negative cases — reconciliation is scoped to the peace pair only', () => {
    it('a vassal war with a THIRD party the overlord is not making peace with is untouched', () => {
      let state = newGame('1054-third-party');
      const [O, V, E, F] = majorIds(state, 4);
      state = declareMajorWar(state, O, E, new EventBus());
      state = declareMajorWar(state, O, F, new EventBus());
      state = vassalize(state, V, O); // V auto-joins both O↔E and O↔F

      state = makeMajorPeace(state, O, E);

      expect(atWar(state, V, E)).toBe(false); // freed
      expect(atWar(state, V, F)).toBe(true);  // O still at war with F — untouched
      expect(atWar(state, O, F)).toBe(true);
      expect(() => assertBilateralWar(state)).not.toThrow();
    });

    it('an unrelated overlord war (no vassal involved) is untouched', () => {
      let state = newGame('1054-unrelated-overlord');
      const [O, V, E, F] = majorIds(state, 4);
      state = declareMajorWar(state, O, E, new EventBus());
      state = declareMajorWar(state, O, F, new EventBus());
      state = vassalize(state, V, O);

      state = makeMajorPeace(state, O, E);

      expect(atWar(state, O, F)).toBe(true);
      expect(atWar(state, V, F)).toBe(true);
    });

    it('a war between two civs where neither is an overlord of the other reconciles nothing extra', () => {
      let state = newGame('1054-plain');
      const [A, B] = majorIds(state, 2);
      state = declareMajorWar(state, A, B, new EventBus());
      const before = JSON.parse(JSON.stringify(state)) as GameState;
      state = makeMajorPeace(state, A, B);
      // only the A/B pair changed
      expect(atWar(state, A, B)).toBe(false);
      for (const id of Object.keys(state.civilizations)) {
        if (id === A || id === B) continue;
        expect(state.civilizations[id].diplomacy.atWarWith)
          .toEqual(before.civilizations[id].diplomacy.atWarWith);
      }
    });
  });

  it('repeated peace / reconciliation is idempotent', () => {
    let state = newGame('1054-idempotent');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);

    state = makeMajorPeace(state, O, E);
    const once = JSON.parse(JSON.stringify(state)) as GameState;
    state = makeMajorPeace(state, O, E); // no-op — already at peace
    expect(JSON.parse(JSON.stringify(state))).toEqual(once);
  });

  it('survives a real save/reload boundary', () => {
    let state = newGame('1054-save-load');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);
    state = makeMajorPeace(state, O, E);

    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as GameState);
    expect(atWar(reloaded, V, E)).toBe(false);
    expect(atWar(reloaded, E, V)).toBe(false);
    expect(() => assertBilateralWar(reloaded)).not.toThrow();
  });

  it('hot seat: reconciliation is simulation-authoritative and the notice reaches only the vassal seat', () => {
    let state = createHotSeatGame({
      playerCount: 3,
      mapSize: 'large',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
        { name: 'Carol', slotId: 'player-3', civType: 'greece', isHuman: true },
      ],
    }, '1054-hotseat');
    const O = 'player-1', V = 'player-2', enemyId = 'player-3';

    state = declareMajorWar(state, O, enemyId, new EventBus());
    state = vassalize(state, V, O);
    expect(atWar(state, V, enemyId)).toBe(true);

    const bus = new EventBus();
    const notices: Array<{ civId: string }> = [];
    bus.on('diplomacy:vassal-auto-peace', e => notices.push({ civId: e.vassalId }));

    // current viewer is player-1; reconciliation must not depend on that
    state.currentPlayer = 'player-1';
    state = makeMajorPeace(state, O, enemyId, bus);

    expect(atWar(state, V, enemyId)).toBe(false);
    expect(atWar(state, enemyId, V)).toBe(false);
    expect(notices).toEqual([{ civId: V }]); // only the vassal seat
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  // Sol review finding A: `applyVassalageWarConsequences` builds the full
  // bloc x bloc cross product on the way in (O-E, O-V2, V1-E, AND V1-V2).
  // Clearing only each principal's own vassals left the two sides' vassals
  // permanently at war with each other — neither can sue for peace and both
  // overlords are at peace. The exit must clear the same cross product.
  describe('both peace parties hold vassals (bloc x bloc)', () => {
    function twoBlocsAtWar(seed: string) {
      let state = createNewGame({
        civType: 'generic', seed, mapSize: 'large', opponentCount: 4, gameTitle: 'vassal-war-exit',
      });
      const [O, V1, E, V2] = majorIds(state, 4);
      state = vassalize(state, V1, O);
      state = vassalize(state, V2, E);
      state = declareMajorWar(state, O, E, new EventBus());
      return { state, O, V1, E, V2 };
    }

    it('the join really does create the vassal-vs-vassal war pair', () => {
      const { state, V1, V2 } = twoBlocsAtWar('1054-bloc-join');
      expect(atWar(state, V1, V2)).toBe(true);
      expect(atWar(state, V2, V1)).toBe(true);
    });

    it('peace between the overlords clears every cross-bloc pair, including vassal-vs-vassal', () => {
      let { state, O, V1, E, V2 } = twoBlocsAtWar('1054-bloc-peace');
      state = makeMajorPeace(state, O, E, new EventBus());

      for (const [x, y] of [[O, E], [O, V2], [V1, E], [V1, V2]] as const) {
        expect(atWar(state, x, y), `${x} should not be at war with ${y}`).toBe(false);
        expect(atWar(state, y, x), `${y} should not be at war with ${x}`).toBe(false);
      }
      expect(() => assertBilateralWar(state)).not.toThrow();
    });

    it('notifies each freed vassal naming its OWN overlord', () => {
      let { state, O, V1, E, V2 } = twoBlocsAtWar('1054-bloc-events');
      const bus = new EventBus();
      const seen: Array<{ vassalId: string; overlordId: string; targetCivId: string }> = [];
      bus.on('diplomacy:vassal-auto-peace', e => seen.push(e));
      state = makeMajorPeace(state, O, E, bus);

      // V1 hears about its overlord O; V2 hears about its overlord E — never swapped.
      expect(seen.filter(e => e.vassalId === V1).every(e => e.overlordId === O)).toBe(true);
      expect(seen.filter(e => e.vassalId === V2).every(e => e.overlordId === E)).toBe(true);
      // the vassal-vs-vassal pair notifies both sides
      expect(seen).toEqual(expect.arrayContaining([
        { vassalId: V1, overlordId: O, targetCivId: V2 },
        { vassalId: V2, overlordId: E, targetCivId: V1 },
      ]));
      // the principals are not reported as vassals of anyone
      expect(seen.some(e => e.vassalId === O || e.vassalId === E)).toBe(false);
    });
  });

  // Sol review finding B: the same stranding with a city-state counterparty.
  // setMinorCivWarState's war branch runs applyVassalageWarConsequences (so the
  // vassal is dragged in) but its peace branch did not undo it.
  describe('city-state wars inherited from the overlord', () => {
    function overlordAtWarWithCityState(seed: string) {
      let state = createNewGame({
        civType: 'generic', seed, mapSize: 'large', opponentCount: 3, gameTitle: 'vassal-war-exit',
      });
      const [O, V] = majorIds(state, 2);
      const mcId = Object.keys(state.minorCivs)[0]!;
      state = setMinorCivWarState(state, O, mcId, true).state;
      state = vassalize(state, V, O);
      return { state, O, V, mcId };
    }

    it('a vassal cannot sue a city-state for peace itself — which is what makes stranding possible', () => {
      const { state, V, mcId } = overlordAtWarWithCityState('1054-mc-blocked');
      const attempt = setMinorCivWarState(state, V, mcId, false);
      expect(attempt.ok).toBe(false);
      expect(attempt.reason).toMatch(/overlord controls war and peace/i);
    });

    it("the overlord's peace with a city-state frees its vassals from that war too", () => {
      let { state, O, V, mcId } = overlordAtWarWithCityState('1054-mc-peace');
      expect(state.civilizations[V].diplomacy.atWarWith).toContain(mcId); // dragged in

      const bus = new EventBus();
      const seen: string[] = [];
      bus.on('diplomacy:vassal-auto-peace', e => seen.push(e.vassalId));
      state = setMinorCivWarState(state, O, mcId, false, bus).state;

      expect(state.civilizations[O].diplomacy.atWarWith).not.toContain(mcId);
      expect(state.civilizations[V].diplomacy.atWarWith).not.toContain(mcId);
      // bilateral on the city-state's side as well
      expect(state.minorCivs[mcId].diplomacy.atWarWith).not.toContain(O);
      expect(state.minorCivs[mcId].diplomacy.atWarWith).not.toContain(V);
      expect(seen).toEqual([V]);
      expect(() => assertBilateralWar(state)).not.toThrow();
    });
  });

  // Sol review finding C (verified NOT a defect, pinned so it stays that way):
  // a released vassal keeps the inherited war, but regains the agency to end it.
  it('a released vassal keeps its inherited war but can immediately make its own peace', () => {
    let state = newGame('1054-release');
    const [O, V, E] = majorIds(state, 3);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V, O);
    expect(atWar(state, V, E)).toBe(true);

    state = releaseVassal(state, O, V, new EventBus());
    expect(state.civilizations[V].diplomacy.vassalage.overlord).toBeNull();
    expect(atWar(state, V, E)).toBe(true); // still its war — not stranded, just owned

    state = makeMajorPeace(state, V, E, new EventBus()); // agency restored
    expect(atWar(state, V, E)).toBe(false);
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('a two-vassal overlord frees both vassals', () => {
    let state = newGame('1054-two-vassals');
    const [O, V1, V2, E] = majorIds(state, 4);
    state = declareMajorWar(state, O, E, new EventBus());
    state = vassalize(state, V1, O);
    state = vassalize(state, V2, O);
    expect(atWar(state, V1, E)).toBe(true);
    expect(atWar(state, V2, E)).toBe(true);

    state = makeMajorPeace(state, O, E);

    expect(atWar(state, V1, E)).toBe(false);
    expect(atWar(state, V2, E)).toBe(false);
    expect(() => assertBilateralWar(state)).not.toThrow();
  });
});
