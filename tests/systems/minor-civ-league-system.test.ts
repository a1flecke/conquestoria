import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import {
  getMinorCivLeaguePreference,
  processMinorCivLeagueTurn,
  reconcileMinorCivLeagues,
} from '@/systems/minor-civ-league-system';
import { conquestMinorCiv, peacefullyAbsorbMinorCiv, processMinorCivTurn } from '@/systems/minor-civ-system';
import { chooseMinorCivQueueItem, evaluateMinorCivEconomyPosture } from '@/systems/minor-civ-economy-system';
import { MINOR_CIV_LEAGUE_RULES } from '@/systems/minor-civ-league-definitions';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { TECH_TREE } from '@/systems/tech-definitions';

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
  it.each([
    ['explorer', 3],
    ['standard', 2],
    ['veteran', 1],
  ] as const)('keeps the full %s preparation warning delay', (challenge, delay) => {
    const { state, first, second } = makeEligiblePairState(`minor-civ-league-delay-${challenge}`);
    state.turn = 40;
    state.opponentChallenge = challenge;
    state.civilizations.player.techState.completed = TECH_TREE.filter(tech => tech.era === 2).map(tech => tech.id);
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first.id, second.id].sort(), formedTurn: 30, readiness: { kind: 'quiet' },
      },
    };
    const concerned = setMinorCivWarState(state, 'player', first.id, true).state;

    expect(getMinorCivLeaguePreference({ ...concerned, turn: concerned.turn + delay - 1 }, second.id, 'settled'))
      .toEqual({ kind: 'none', reason: 'warning' });
    expect(getMinorCivLeaguePreference({ ...concerned, turn: concerned.turn + delay }, second.id, 'settled'))
      .toEqual({ kind: 'defense', reason: 'preparation' });
  });

  it('records concern from a member war with a mature major and withholds preparation through the warning delay', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-concern');
    state.turn = 40;
    state.civilizations.player.techState.completed = TECH_TREE.filter(tech => tech.era === 2).map(tech => tech.id);
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first.id, second.id].sort(), formedTurn: 30, readiness: { kind: 'quiet' },
      },
    };

    const result = setMinorCivWarState(state, 'player', first.id, true).state;

    expect(result.minorCivLeagues!.leagues['minor-compact-1']!.readiness)
      .toEqual({ kind: 'concern', sinceTurn: 40 });
    expect(getMinorCivLeaguePreference(result, second.id, 'settled'))
      .toEqual({ kind: 'none', reason: 'warning' });
    const preparationReady = { ...result, turn: 42 };
    expect(getMinorCivLeaguePreference(preparationReady, second.id, 'settled'))
      .toEqual({ kind: 'defense', reason: 'preparation' });
  });

  it('moves to cooling immediately when the last mature concern source makes peace', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-cooling');
    state.turn = 40;
    state.civilizations.player.techState.completed = TECH_TREE.filter(tech => tech.era === 2).map(tech => tech.id);
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first.id, second.id].sort(), formedTurn: 30, readiness: { kind: 'quiet' },
      },
    };
    const concerned = setMinorCivWarState(state, 'player', first.id, true).state;

    const result = setMinorCivWarState(concerned, 'player', first.id, false).state;

    expect(result.minorCivLeagues!.leagues['minor-compact-1']!.readiness)
      .toEqual({ kind: 'cooling', sinceTurn: 40 });
    expect(getMinorCivLeaguePreference(result, second.id, 'settled'))
      .toEqual({ kind: 'commerce', reason: 'charter' });
  });

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

  it('changes a settled peer to a legal defensive production choice only after the full warning', () => {
    const { state, first, second } = makeEligiblePairState('minor-civ-league-defense-production');
    state.turn = 42;
    state.civilizations.player.techState.completed = TECH_TREE.filter(tech => tech.era === 2).map(tech => tech.id);
    state.minorCivLeagues!.leagues = {
      'minor-compact-1': {
        id: 'minor-compact-1', nameKey: 'amber', charter: 'commerce',
        memberIds: [first.id, second.id].sort(), formedTurn: 30, readiness: { kind: 'concern', sinceTurn: 40 },
      },
    };
    state.minorCivs[first.id].diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = [first.id];
    state.cities[second.cityId]!.buildings = ['dock', 'monument', 'temple', 'library'];
    const firstUnit = state.units[state.minorCivs[first.id].units[0]!];
    state.units['compact-peer-unit'] = {
      ...firstUnit,
      id: 'compact-peer-unit',
      owner: second.id,
      position: { ...state.cities[second.cityId]!.position },
    };
    state.minorCivs[second.id].units = ['compact-peer-unit'];
    const baseline = structuredClone(state);
    baseline.minorCivLeagues!.leagues['minor-compact-1']!.readiness = { kind: 'quiet' };

    const preparedChoice = chooseMinorCivQueueItem(state, second.id);

    expect(evaluateMinorCivEconomyPosture(state, second.id)).toBe('settled');
    expect(getMinorCivLeaguePreference(state, second.id, 'settled')).toEqual({ kind: 'defense', reason: 'preparation' });
    expect(preparedChoice).not.toBe(chooseMinorCivQueueItem(baseline, second.id));
    expect(['walls', 'barracks', 'warrior', 'archer', 'spearman']).toContain(preparedChoice);
  });
});
