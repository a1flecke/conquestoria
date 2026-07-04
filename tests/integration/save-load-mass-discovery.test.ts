import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import type { GameState } from '@/core/types';

// Regression test for issue #435: loading a long-played save "encountered" every civ
// at once on the next round.
//
// Mechanism: relationship drift raises every non-war pair to +30 over time, met or
// not. AI treaty decisions used to skip the contact check, so on the first round
// where a dormant AI civ was processed (right after loading an old solo save), it
// signed instant bilateral trade agreements with every civ — and a treaty counts as
// contact evidence in hasMetCivilizationByCurrentEvidence, so the next visibility
// sync recorded contact with everyone and fired a "You have encountered X" burst.
function runRealRound(state: GameState, contactEvents: Array<{ civA: string; civB: string }>): GameState {
  const result = runCompletedRound(state, new EventBus(), {
    improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
    majors: (current, eventBus) => processNonHumanMajorRound(current, eventBus).state,
    world: (current, eventBus) => processTurn(current, eventBus),
  });
  if (!result.ok) throw result.state && result.error;
  const sink = new EventBus();
  sink.on('civilization:first-contact', contact => contactEvents.push(contact));
  result.events.commitTo(sink);
  return result.state;
}

function majorCivIds(state: GameState): string[] {
  return Object.keys(state.civilizations);
}

function knownPairs(state: GameState): Set<string> {
  const pairs = new Set<string>();
  for (const civ of Object.values(state.civilizations)) {
    for (const otherId of civ.knownCivilizations ?? []) {
      pairs.add([civ.id, otherId].sort().join('|'));
    }
  }
  return pairs;
}

function treatyPairs(state: GameState): Set<string> {
  const pairs = new Set<string>();
  for (const civ of Object.values(state.civilizations)) {
    for (const treaty of civ.diplomacy.treaties) {
      pairs.add([treaty.civA, treaty.civB].sort().join('|'));
    }
  }
  return pairs;
}

describe('issue #435 — loading an old save must not mass-discover civilizations', () => {
  it('does not sign treaties with or "encounter" unmet civs after a save/load round trip, even at drift-cap relationships', () => {
    const created = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 3,
      gameTitle: 'Issue 435 Regression',
      seed: 'issue-435-mass-discovery',
    });

    // Simulate a ~100-turn campaign where nobody has met: relationship drift has
    // capped every pair at +30 (processRelationshipDrift cap) and the world is in
    // era 3, where trade agreements need no tech. This is the exact precondition
    // from the issue screenshots (relationship 35 = 30 drift cap + 5 signing bonus).
    created.turn = 101;
    created.era = 3;
    for (const civ of Object.values(created.civilizations)) {
      for (const otherId of majorCivIds(created)) {
        if (otherId === civ.id) continue;
        civ.diplomacy.relationships[otherId] = 30;
      }
    }

    const baselineKnown = knownPairs(created);
    const baselineTreaties = treatyPairs(created);
    expect(baselineTreaties.size).toBe(0);

    // Real persistence round trip through the production load normalizer.
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(created)) as GameState);

    // Loading alone must not mint contacts or treaties.
    expect(knownPairs(loaded)).toEqual(baselineKnown);
    expect(treatyPairs(loaded)).toEqual(baselineTreaties);

    // Run two full production rounds (improvements → AI majors → world), matching
    // the hot-seat report of the burst appearing "on the second turn after load".
    const contactEvents: Array<{ civA: string; civB: string }> = [];
    let state = runRealRound(loaded, contactEvents);
    state = runRealRound(state, contactEvents);

    // The bug signed instant bilateral treaties with every drift-capped pair.
    // No treaty may appear between civs that had never met at load time.
    const newTreaties = [...treatyPairs(state)].filter(pair => !baselineKnown.has(pair));
    expect(newTreaties).toEqual([]);

    // Two rounds of AI movement from far-apart medium-map starts cannot plausibly
    // produce real contact with this seed; any new known pair means the treaty
    // (or another non-visibility) evidence path leaked again.
    const newKnown = [...knownPairs(state)].filter(pair => !baselineKnown.has(pair));
    expect(newKnown).toEqual([]);
    expect(contactEvents).toEqual([]);
  });
});
