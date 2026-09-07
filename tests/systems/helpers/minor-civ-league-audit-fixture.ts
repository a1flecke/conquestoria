import { createNewGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import type { GameState, OpponentChallenge } from '@/core/types';

export interface MinorCivLeagueAuditFixture {
  state: GameState;
  firstId: string;
  secondId: string;
}

/** A complete game-state fixture with exactly two valid, nearby compact members. */
export function makeMinorCivLeagueAuditFixture(
  seed: string,
  challenge: OpponentChallenge = 'standard',
): MinorCivLeagueAuditFixture {
  const state = createNewGame(undefined, seed, 'medium');
  const [first, second, ...others] = Object.values(state.minorCivs);
  if (!first || !second) throw new Error('The medium-map fixture requires two city-states.');

  state.turn = 40;
  state.opponentChallenge = challenge;
  state.cities[first.cityId]!.position = { q: 8, r: 8 };
  state.cities[second.cityId]!.position = { q: 10, r: 8 };
  for (const minorCiv of others) minorCiv.isDestroyed = true;
  state.civilizations.player.techState.completed = TECH_TREE
    .filter(technology => technology.era === 2)
    .map(technology => technology.id);
  state.minorCivLeagues!.nextCheckTurn = state.turn;
  state.minorCivLeagues!.eligibleAfterTurnByMinorCiv = Object.fromEntries(
    Object.keys(state.minorCivs).map(minorCivId => [minorCivId, 0]),
  );

  return { state, firstId: first.id, secondId: second.id };
}

export function addAuditCompact(state: GameState, firstId: string, secondId: string): GameState {
  const next = structuredClone(state);
  next.minorCivLeagues!.leagues = {
    'minor-compact-1': {
      id: 'minor-compact-1',
      nameKey: 'amber',
      charter: 'commerce',
      memberIds: [firstId, secondId].sort(),
      formedTurn: next.turn,
      readiness: { kind: 'quiet' },
    },
  };
  return next;
}
