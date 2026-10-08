/**
 * Diplomacy state primitives: build a civ's `DiplomacyState`, and the small
 * single-state writes every other diplomacy domain builds on (relationship
 * drift, event decay, spy-catch record, the `withDiplomacy` GameState setter).
 *
 * Dependency-free leaf (types only). Read-only questions live in
 * `diplomacy-queries.ts`.
 */
import type { GameState } from '@/core/types';
import type { DiplomacyState } from '@/core/types/diplomacy';

export function createDiplomacyState(
  allCivIds: string[],
  selfId: string,
  startBonus: number = 0,
): DiplomacyState {
  const relationships: Record<string, number> = {};
  for (const id of allCivIds) {
    if (id !== selfId) {
      relationships[id] = startBonus;
    }
  }
  return {
    relationships,
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    strategicStrikesReceivedFrom: [],
    vassalage: {
      overlord: null,
      vassals: [],
      protectionScore: 100,
      protectionTimers: [],
      peakCities: 0,
      peakMilitary: 0,
    },
  };
}

export function modifyRelationship(
  state: DiplomacyState,
  civId: string,
  delta: number,
): DiplomacyState {
  const newState = { ...state, relationships: { ...state.relationships } };
  const current = newState.relationships[civId] ?? 0;
  newState.relationships[civId] = Math.max(-100, Math.min(100, current + delta));
  return newState;
}

/**
 * #989: logs a spy-catch incident into the existing (unversioned, open-string)
 * `DiplomaticEvent.type` -- reuses the same array every other event type
 * already lives in, so this needs no new persisted field and no migration.
 * Call this alongside the existing bilateral `modifyRelationship` at every
 * spy-capture-verdict site (expel/execute; interrogate carries no relationship
 * penalty today and is deliberately not recorded here either). Symmetric: the
 * caller applies this to BOTH the capturing civ's and the spy owner's own
 * diplomacy state, each naming the other as `otherCiv`.
 */
export function recordSpyCaught(state: DiplomacyState, otherCivId: string, turn: number): DiplomacyState {
  return { ...state, events: [...state.events, { type: 'spy_caught', turn, otherCiv: otherCivId, weight: 1 }] };
}

export function processRelationshipDrift(
  state: DiplomacyState,
  unitsNearBorder: Record<string, boolean>,
): DiplomacyState {
  let newState = { ...state, relationships: { ...state.relationships } };
  for (const civId of Object.keys(newState.relationships)) {
    if (newState.atWarWith.includes(civId)) continue;

    if (unitsNearBorder[civId]) {
      newState = modifyRelationship(newState, civId, -2);
    } else {
      const current = newState.relationships[civId] ?? 0;
      if (current < 30) {
        newState.relationships[civId] = Math.min(30, current + 1);
      }
    }
  }
  return newState;
}

export function decayEvents(state: DiplomacyState, currentTurn: number): DiplomacyState {
  return {
    ...state,
    events: state.events.map(e => {
      const age = currentTurn - e.turn;
      if (age > 20) {
        const decayFactor = Math.max(0.1, 1 - (age - 20) * 0.05);
        return { ...e, weight: e.weight * decayFactor };
      }
      return e;
    }),
  };
}

// #910 GameState-level setter shared by the war and vassalage transitions.
export function withDiplomacy(state: GameState, civId: string, diplomacy: DiplomacyState): GameState {
  const civ = state.civilizations[civId];
  return { ...state, civilizations: { ...state.civilizations, [civId]: { ...civ, diplomacy } } };
}
