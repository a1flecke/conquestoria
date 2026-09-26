import { createHotSeatGame } from '@/core/game-state';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import type { GameState, HexCoord, NationalIntent, TreatyType, VisibilityState } from '@/core/types';
import { recordCivilizationContact } from '@/systems/discovery-system';
import { hexKey } from '@/systems/hex-utils';
import { shouldListMajorCivForViewer } from '@/systems/viewer-intel';

/**
 * #1002 — composable fixtures with sharp knowledge boundaries.
 *
 * `createTwoViewerWorld` is ONE authoritative hot-seat world: two human viewers and two AI
 * empires, with every contact cleared so each test states exactly who knows whom. Every helper
 * below changes the *authoritative* world through the same fields the game uses; none of them
 * computes visibility or contact itself — entitlement is always answered by the production
 * predicates (`shouldListMajorCivForViewer`, `getVisibility`, `isUnitConcealedFrom`).
 */

export const HUMAN_A = 'player-1';
export const HUMAN_B = 'player-2';
export const AI_A = 'ai-1';
export const AI_B = 'ai-2';

export function createTwoViewerWorld(seed = 'viewer-safety-two-viewers'): GameState {
  const state = createHotSeatGame({
    playerCount: 4,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: HUMAN_A, civType: 'egypt', isHuman: true },
      { name: 'Bob', slotId: HUMAN_B, civType: 'rome', isHuman: true },
      { name: 'Carthage', slotId: AI_A, civType: 'greece', isHuman: false },
      { name: 'Delhi', slotId: AI_B, civType: 'china', isHuman: false },
    ],
  }, seed);
  state.currentPlayer = HUMAN_A;
  state.pendingEvents = {};
  state.opponentAI = createEmptyOpponentAIState();
  for (const civ of Object.values(state.civilizations)) {
    civ.knownCivilizations = [];
    civ.diplomacy.treaties = [];
    civ.diplomacy.atWarWith = [];
  }
  return state;
}

/** Bilateral contact through the production recorder. */
export function makeMet(state: GameState, civA: string, civB: string): void {
  recordCivilizationContact(state, civA, civB);
}

/** A pair with no contact memory; fails loudly if current visible evidence still links them. */
export function expectUnmet(state: GameState, viewerId: string, targetId: string): void {
  if (shouldListMajorCivForViewer(state, viewerId, targetId)) {
    throw new Error(`fixture: ${viewerId} can already list ${targetId} — the "unmet" case would be vacuous`);
  }
}

export function setTileVisibility(state: GameState, viewerId: string, coord: HexCoord, value: VisibilityState): void {
  state.civilizations[viewerId]!.visibility.tiles[hexKey(coord)] = value;
}

export function setNationalIntent(state: GameState, civId: string, current: NationalIntent): void {
  state.opponentAI ??= createEmptyOpponentAIState();
  state.opponentAI.nationalIntentByCiv[civId] = {
    current,
    previous: 'expand',
    selectedTurn: state.turn,
    reconsiderAfterTurn: state.turn + 15,
    shockActive: false,
    shockFreeStreak: 0,
    reasonCodes: [],
  };
}

/**
 * A bilateral treaty written straight into authoritative state — the #435 shape: relationship
 * facts that exist between OTHER civs (or that a poisoned save carries) without any contact
 * involving the viewer. Deliberately bypasses the diplomacy writers' contact gate.
 */
export function signTreatyForTest(state: GameState, civA: string, civB: string, type: TreatyType = 'trade_agreement'): void {
  const treaty = { type, civA, civB, turnsRemaining: -1 };
  state.civilizations[civA]!.diplomacy.treaties.push({ ...treaty });
  state.civilizations[civB]!.diplomacy.treaties.push({ ...treaty });
}

/**
 * Relationship drift toward everyone, met or not (the #435 precondition: drift cap +30).
 * `sparePairsWith` keeps the pairs a viewer has legitimately met untouched, so the mutation stays
 * strictly about facts that viewer has not earned.
 */
export function driftAllRelationships(
  state: GameState,
  value = 30,
  sparePairsWith: { viewerId: string; known: readonly string[] } | null = null,
): void {
  const ids = Object.keys(state.civilizations);
  const spared = (a: string, b: string) => sparePairsWith !== null
    && ((a === sparePairsWith.viewerId && sparePairsWith.known.includes(b))
      || (b === sparePairsWith.viewerId && sparePairsWith.known.includes(a)));
  for (const civ of Object.values(state.civilizations)) {
    for (const other of ids) {
      if (other !== civ.id && !spared(civ.id, other)) civ.diplomacy.relationships[other] = value;
    }
  }
}
