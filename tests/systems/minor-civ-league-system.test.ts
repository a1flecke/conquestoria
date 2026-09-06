import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import {
  getMinorCivLeaguePreference,
  processMinorCivLeagueTurn,
  reconcileMinorCivLeagues,
} from '@/systems/minor-civ-league-system';
import { conquestMinorCiv, peacefullyAbsorbMinorCiv, processMinorCivTurn } from '@/systems/minor-civ-system';
import { chooseMinorCivQueueItem } from '@/systems/minor-civ-economy-system';
import { MINOR_CIV_LEAGUE_RULES } from '@/systems/minor-civ-league-definitions';

function makeEligiblePairState(seed: string) {
  const state = createNewGame(undefined, seed, 'medium');
  const [first, second, ...others] = Object.values(state.minorCivs);
  state.cities[first.cityId]!.position = { q: 8, r: 8 };
  state.cities[second.cityId]!.position = { q: 10, r: 8 };
  for (const minorCiv of others) minorCiv.isDestroyed = true;
  state.turn = 20;
  state.minorCivLeagues!.nextCheckTurn = 20;
  state.minorCivLeagues!.eligibleAfterTurnByMinorCiv = Object.fromEntries(
    Object.keys(state.minorCivs).map(minorCivId => [minorCivId, 0]),
  );
  return { state, first, second };
}

describe('minor-civ league lifecycle', () => {
  it('forms a compact for two eligible nearby independent minor civilizations at the first due check', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-formation');

    const result = processMinorCivLeagueTurn(state);

    expect(Object.values(result.minorCivLeagues!.leagues)).toEqual([
      expect.objectContaining({
        id: 'minor-compact-1',
        memberIds: [first.id, second.id].sort(),
        formedTurn: 20,
        readiness: { kind: 'quiet' },
      }),
    ]);
    expect(result.minorCivLeagues).toMatchObject({
      nextId: 2,
      nextCheckTurn: 24,
      lastProcessedTurn: 20,
    });
  });

  it('does not admit a new minor before its grace deadline, but records the due check once', () => {
    const { state } = makeEligiblePairState('minor-civ-league-grace');
    for (const minorCivId of Object.keys(state.minorCivs)) {
      state.minorCivLeagues!.eligibleAfterTurnByMinorCiv[minorCivId] = state.turn + 1;
    }

    const first = processMinorCivLeagueTurn(state);
    const second = processMinorCivLeagueTurn(first);

    expect(first.minorCivLeagues).toMatchObject({
      leagues: {},
      lastProcessedTurn: 20,
      nextCheckTurn: 24,
    });
    expect(second).toEqual(first);
  });

  it('runs the compact scheduler through the canonical minor-civilization turn', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-turn-integration');

    const result = processMinorCivTurn(state, new EventBus());

    expect(Object.values(result.minorCivLeagues!.leagues)).toEqual([
      expect.objectContaining({ memberIds: [first.id, second.id].sort() }),
    ]);
  });

  it('requires every member pair to be within the compact radius', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-clique');
    const third = Object.values(state.minorCivs).find(minorCiv => (
      minorCiv.id !== first.id && minorCiv.id !== second.id
    ))!;
    third.isDestroyed = false;
    state.cities[third.cityId]!.owner = third.id;
    state.cities[third.cityId]!.position = { q: 20, r: 8 };
    state.minorCivs[first.id].definitionId = 'carthage';
    state.minorCivs[second.id].definitionId = 'zanzibar';
    state.minorCivs[third.id].definitionId = 'sparta';
    state.minorCivLeagues!.eligibleAfterTurnByMinorCiv[third.id] = 0;

    const result = processMinorCivLeagueTurn(state);

    expect(Object.values(result.minorCivLeagues!.leagues)[0]!.memberIds).toEqual([first.id, second.id].sort());
  });

  it('dissolves an incompatible compact and gives each surviving member a fresh rejoin grace period', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-reconcile');
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1',
        nameKey: 'amber',
        charter: 'cooperation',
        memberIds: [first.id, second.id].sort(),
        formedTurn: 19,
        readiness: { kind: 'quiet' },
      },
    };
    state.minorCivs[first.id].diplomacy.atWarWith.push(second.id);

    const result = reconcileMinorCivLeagues(state);

    expect(result.minorCivLeagues!.leagues).toEqual({});
    expect(result.minorCivLeagues!.eligibleAfterTurnByMinorCiv).toMatchObject({
      [first.id]: state.turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns,
      [second.id]: state.turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns,
    });
  });

  it('reconciles immediately through both canonical conquest and peaceful absorption paths', () => {
    const makeCompactedState = (seed: string) => {
      const fixture = makeEligiblePairState(seed);
      fixture.state.minorCivLeagues!.leagues = {
        'minor-compact-1': {
          id: 'minor-compact-1', nameKey: 'amber', charter: 'cooperation',
          memberIds: [fixture.first.id, fixture.second.id].sort(), formedTurn: 19,
          readiness: { kind: 'quiet' },
        },
      };
      return fixture;
    };
    const conquered = makeCompactedState('minor-civ-league-conquest');
    const absorbed = makeCompactedState('minor-civ-league-absorption');

    const afterConquest = conquestMinorCiv(conquered.state, conquered.first.id, 'player').state;
    const afterAbsorption = peacefullyAbsorbMinorCiv(absorbed.state, absorbed.first.id, 'player').state;

    expect(afterConquest.minorCivLeagues!.leagues).toEqual({});
    expect(afterConquest.minorCivLeagues!.eligibleAfterTurnByMinorCiv[conquered.second.id])
      .toBe(afterConquest.turn + 10);
    expect(afterAbsorption.minorCivLeagues!.leagues).toEqual({});
    expect(afterAbsorption.minorCivLeagues!.eligibleAfterTurnByMinorCiv[absorbed.second.id])
      .toBe(afterAbsorption.turn + 10);
  });

  it('uses a strict majority for the founding charter and exposes only settled compact preferences', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-charter');
    state.minorCivs[first.id].definitionId = 'carthage';
    state.minorCivs[second.id].definitionId = 'zanzibar';

    const result = processMinorCivLeagueTurn(state);

    expect(Object.values(result.minorCivLeagues!.leagues)[0]).toMatchObject({ charter: 'commerce' });
    expect(getMinorCivLeaguePreference(result, first.id, 'settled')).toEqual({
      kind: 'commerce', reason: 'charter',
    });
    expect(getMinorCivLeaguePreference(result, first.id, 'fortifying')).toEqual({
      kind: 'none', reason: 'own-needs',
    });
  });

  it('raises a legal charter-matching building above the ordinary production choice without changing legality', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-learning-production');
    state.minorCivs[first.id].definitionId = 'sparta';
    state.minorCivs[second.id].definitionId = 'carthage';
    state.cities[first.cityId]!.buildings = ['walls', 'barracks'];
    const existingUnitId = state.minorCivs[first.id].units[0]!;
    state.units['compact-test-extra-unit'] = {
      ...state.units[existingUnitId]!,
      id: 'compact-test-extra-unit',
    };
    state.minorCivs[first.id].units.push('compact-test-extra-unit');
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1',
        nameKey: 'amber',
        charter: 'commerce',
        memberIds: [first.id, second.id].sort(),
        formedTurn: 20,
        readiness: { kind: 'quiet' },
      },
    };
    const baseline = structuredClone(state);
    baseline.minorCivLeagues!.leagues = {};

    expect(chooseMinorCivQueueItem(baseline, first.id)).toBe('workshop');
    expect(chooseMinorCivQueueItem(state, first.id)).toBe('monument');
  });
});
