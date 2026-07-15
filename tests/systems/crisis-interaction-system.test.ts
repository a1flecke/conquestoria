import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  CRISIS_INTERACTION_DEFINITIONS,
  getCrisisInteractionDefinition,
  getWitnessCivIds,
  applyInteractionReputation,
} from '@/systems/crisis-interaction-system';

// actor=civA, target=civB, witness=civC (met both), non-witness=civD (met only actor).
function threeCivState(overrides: Partial<GameState> = {}): GameState {
  const ids = ['civA', 'civB', 'civC', 'civD'];
  return {
    turn: 10,
    cities: {},
    units: {},
    map: { width: 1, height: 1, wrapsHorizontally: false, rivers: [], tiles: {} },
    civilizations: {
      civA: { id: 'civA', name: 'A', isHuman: true, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civA'), knownCivilizations: ['civB', 'civC', 'civD'] },
      civB: { id: 'civB', name: 'B', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civB'), knownCivilizations: ['civA', 'civC'] },
      civC: { id: 'civC', name: 'C', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civC'), knownCivilizations: ['civA', 'civB'] },
      civD: { id: 'civD', name: 'D', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civD'), knownCivilizations: ['civA'] },
    },
    ...overrides,
  } as unknown as GameState;
}

describe('CRISIS_INTERACTION_DEFINITIONS', () => {
  it('ships hunt_their_foe and send_aid as the MR6 rows', () => {
    const ids = CRISIS_INTERACTION_DEFINITIONS.map(def => def.id);
    expect(ids).toEqual(['hunt_their_foe', 'send_aid']);
  });

  it('hunt_their_foe requires no tech; send_aid requires medicine', () => {
    expect(getCrisisInteractionDefinition('hunt_their_foe')?.techRequired).toBeNull();
    expect(getCrisisInteractionDefinition('send_aid')?.techRequired).toBe('medicine');
  });
});

describe('getWitnessCivIds', () => {
  it('includes only civs that have met BOTH actor and target, excluding actor/target themselves', () => {
    const state = threeCivState();
    const witnesses = getWitnessCivIds(state, 'civA', 'civB');
    expect(witnesses).toEqual(['civC']);
    expect(witnesses).not.toContain('civA');
    expect(witnesses).not.toContain('civB');
    expect(witnesses).not.toContain('civD'); // met actor only, not target
  });

  it('returns an empty list when no third civ has met both parties (negative)', () => {
    const state = threeCivState();
    // hasMetCivilization is bidirectional -- clear the link from BOTH sides so civC
    // and civB genuinely have no mutual-contact evidence.
    state.civilizations.civC.knownCivilizations = ['civA'];
    state.civilizations.civB.knownCivilizations = ['civA'];
    expect(getWitnessCivIds(state, 'civA', 'civB')).toEqual([]);
  });
});

describe('applyInteractionReputation', () => {
  it('moves both sides of the actor<->target relationship', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(15);
  });

  it('moves both sides of the actor<->witness relationship for every witness', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civC).toBe(4);
    expect(next.civilizations.civC.diplomacy.relationships.civA).toBe(4);
  });

  it('never touches a non-witness civ (civD, which only met the actor)', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civD.diplomacy.relationships.civA).toBe(0);
    expect(next.civilizations.civA.diplomacy.relationships.civD).toBe(0);
  });

  it('clamps deltas at the +100 ceiling via modifyRelationship', () => {
    const state = threeCivState();
    state.civilizations.civA.diplomacy.relationships.civB = 90;
    state.civilizations.civB.diplomacy.relationships.civA = 90;
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(100);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(100);
  });
});
