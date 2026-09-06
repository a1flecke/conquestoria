import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, MinorCivLeagueState } from '@/core/types';
import { normalizeMinorCivLeagueState } from '@/storage/minor-civ-league-normalization';

function makeFixture() {
  const state = createNewGame(undefined, 'minor-civ-league-normalization', 'medium');
  state.turn = 40;
  const minorCivIds = Object.keys(state.minorCivs).sort();
  if (minorCivIds.length < 4) throw new Error('normalization fixture requires four city-states');
  for (const [index, minorCivId] of minorCivIds.entries()) {
    const city = state.cities[state.minorCivs[minorCivId].cityId];
    city.position = { q: 4 + index * 3, r: 4 };
    city.population = 3;
    if (city.buildings.length === 0) city.buildings.push('monument');
  }
  return { state, minorCivIds };
}

function withoutLeagueState(state: GameState) {
  const { minorCivLeagues: _minorCivLeagues, ...rest } = state;
  return rest;
}

describe('#496 minor-civ league save normalization', () => {
  it('adds empty defaults without changing any existing gameplay state', () => {
    const { state } = makeFixture();
    delete state.minorCivLeagues;
    const before = structuredClone(state);

    const once = normalizeMinorCivLeagueState(state);

    expect(once.minorCivLeagues).toEqual({
      leagues: {},
      nextId: 1,
      nextCheckTurn: 44,
      lastProcessedTurn: -1,
      eligibleAfterTurnByMinorCiv: Object.fromEntries(
        Object.keys(state.minorCivs).sort().map(minorCivId => [minorCivId, 50]),
      ),
    });
    expect(withoutLeagueState(once)).toEqual(before);
    expect(state).toEqual(before);
    expect(normalizeMinorCivLeagueState(once)).toEqual(once);
  });

  it('treats an array or malformed whole container like an absent container', () => {
    const { state } = makeFixture();
    const expected = normalizeMinorCivLeagueState({ ...state, minorCivLeagues: undefined });
    const malformed = {
      ...state,
      minorCivLeagues: [] as unknown as MinorCivLeagueState,
    };

    expect(normalizeMinorCivLeagueState(malformed).minorCivLeagues)
      .toEqual(expected.minorCivLeagues);
  });

  it('repairs identities, conflicts, duplicate names, readiness, timing and unknown fields deterministically', () => {
    const { state, minorCivIds } = makeFixture();
    const [a, b, c, d] = minorCivIds;
    const raw = {
      leagues: {
        'minor-compact-1': {
          id: 'minor-compact-1', nameKey: 'hearth', charter: 'security',
          memberIds: [a, 'missing'], formedTurn: 5, readiness: { kind: 'quiet' },
        },
        'minor-compact-2': {
          id: 'minor-compact-2', nameKey: 'amber', charter: 'commerce',
          memberIds: [b, a, a], formedTurn: 10, readiness: { kind: 'quiet' }, ignored: true,
        },
        'minor-compact-3': {
          id: 'minor-compact-3', nameKey: 'amber', charter: 'learning',
          memberIds: [d, c], formedTurn: 11,
          readiness: { kind: 'concern', sinceTurn: 41 },
        },
      },
      nextId: 2,
      nextCheckTurn: 39,
      lastProcessedTurn: 41,
      eligibleAfterTurnByMinorCiv: { [a]: 5, [b]: 99, [c]: -1, [d]: 50, missing: 2 },
      ignored: 'discard me',
    } as unknown as MinorCivLeagueState;
    const input = { ...state, minorCivLeagues: raw };
    const before = structuredClone(input);

    const normalized = normalizeMinorCivLeagueState(input);

    expect(normalized.minorCivLeagues).toEqual({
      leagues: {
        'minor-compact-2': {
          id: 'minor-compact-2', nameKey: 'amber', charter: 'commerce',
          memberIds: [a, b].sort(), formedTurn: 10, readiness: { kind: 'quiet' },
        },
        'minor-compact-3': {
          id: 'minor-compact-3', nameKey: 'willow', charter: 'learning',
          memberIds: [c, d].sort(), formedTurn: 11, readiness: { kind: 'quiet' },
        },
      },
      nextId: 4,
      nextCheckTurn: 39,
      lastProcessedTurn: -1,
      eligibleAfterTurnByMinorCiv: Object.fromEntries(
        minorCivIds.map(minorCivId => [minorCivId, minorCivId === a ? 5 : 50]),
      ),
    });
    expect(input).toEqual(before);
    expect(normalizeMinorCivLeagueState(normalized)).toEqual(normalized);
  });

  it('dissolves invalid geography with grace and reserves MAX_SAFE_INTEGER as an exhausted counter', () => {
    const { state, minorCivIds: [a, b] } = makeFixture();
    state.cities[state.minorCivs[a].cityId].position = { q: 0, r: 0 };
    state.cities[state.minorCivs[b].cityId].position = { q: 15, r: 0 };
    state.minorCivLeagues = {
      leagues: {
        [`minor-compact-${Number.MAX_SAFE_INTEGER}`]: {
          id: `minor-compact-${Number.MAX_SAFE_INTEGER}`,
          nameKey: 'amber', charter: 'commerce', memberIds: [a, b],
          formedTurn: 20, readiness: { kind: 'quiet' },
        },
      },
      nextId: Number.MAX_SAFE_INTEGER,
      nextCheckTurn: Number.POSITIVE_INFINITY,
      lastProcessedTurn: Number.NaN,
      eligibleAfterTurnByMinorCiv: {},
    };

    const normalized = normalizeMinorCivLeagueState(state);

    expect(normalized.minorCivLeagues?.leagues).toEqual({});
    expect(normalized.minorCivLeagues?.nextId).toBe(Number.MAX_SAFE_INTEGER);
    expect(normalized.minorCivLeagues?.nextCheckTurn).toBe(44);
    expect(normalized.minorCivLeagues?.lastProcessedTurn).toBe(-1);
    expect(normalized.minorCivLeagues?.eligibleAfterTurnByMinorCiv[a]).toBe(50);
    expect(normalized.minorCivLeagues?.eligibleAfterTurnByMinorCiv[b]).toBe(50);
    expect(normalizeMinorCivLeagueState(normalized)).toEqual(normalized);
  });
});
