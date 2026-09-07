import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { MINOR_CIV_LEAGUE_RULES } from '@/systems/minor-civ-league-definitions';
import { getMinorCivLeaguePreference, processMinorCivLeagueTurn } from '@/systems/minor-civ-league-system';
import { addAuditCompact, makeMinorCivLeagueAuditFixture } from './helpers/minor-civ-league-audit-fixture';

describe('#496 final arc — canonical compact integration', () => {
  it('forms through the canonical scheduler and keeps the compact across a normal world turn', () => {
    const { state, firstId, secondId } = makeMinorCivLeagueAuditFixture('mc-496-integration-formation');

    const scheduled = processMinorCivLeagueTurn(state);
    const league = Object.values(scheduled.minorCivLeagues!.leagues)[0];

    expect(league?.memberIds).toEqual([firstId, secondId].sort());
    expect(processTurn(scheduled, new EventBus()).minorCivLeagues?.leagues[league!.id]).toBeDefined();
  });

  it('preserves a warning-boundary result through JSON save/reload and makes peace cool immediately', () => {
    const fixture = makeMinorCivLeagueAuditFixture('mc-496-integration-save-fork');
    const compacted = addAuditCompact(fixture.state, fixture.firstId, fixture.secondId);
    const warned = setMinorCivWarState(compacted, 'player', fixture.firstId, true).state;
    const atBoundary = { ...warned, turn: warned.turn + 2 };
    const reloaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(atBoundary)));

    expect(getMinorCivLeaguePreference(atBoundary, fixture.secondId, 'settled'))
      .toEqual({ kind: 'defense', reason: 'preparation' });
    expect(getMinorCivLeaguePreference(reloaded, fixture.secondId, 'settled'))
      .toEqual({ kind: 'defense', reason: 'preparation' });

    const peaceful = setMinorCivWarState(reloaded, 'player', fixture.firstId, false).state;
    expect(peaceful.minorCivLeagues!.leagues['minor-compact-1']!.readiness)
      .toEqual({ kind: 'cooling', sinceTurn: reloaded.turn });
    expect(getMinorCivLeaguePreference(peaceful, fixture.secondId, 'settled'))
      .toEqual({ kind: 'commerce', reason: 'charter' });
  });

  it('bounds 64-minor admission and performs no additional formation on same-turn or nondue calls', () => {
    const fixture = makeMinorCivLeagueAuditFixture('mc-496-integration-stress');
    const templateMinor = fixture.state.minorCivs[fixture.firstId]!;
    const templateCity = fixture.state.cities[templateMinor.cityId]!;
    const minorCivs: typeof fixture.state.minorCivs = {};
    const cities: typeof fixture.state.cities = {};
    for (let index = 0; index < 64; index++) {
      const minorCivId = `mc-audit-${index}`;
      const cityId = `city-audit-${index}`;
      minorCivs[minorCivId] = {
        ...structuredClone(templateMinor),
        id: minorCivId,
        cityId,
        units: [],
        diplomacy: { ...structuredClone(templateMinor.diplomacy), atWarWith: [] },
      };
      cities[cityId] = {
        ...structuredClone(templateCity),
        id: cityId,
        owner: minorCivId,
        position: { q: (index % 8) * 5, r: Math.floor(index / 8) * 5 },
      };
    }
    const state = {
      ...fixture.state,
      minorCivs,
      cities: { ...fixture.state.cities, ...cities },
      minorCivLeagues: {
        leagues: {}, nextId: 1, nextCheckTurn: fixture.state.turn, lastProcessedTurn: -1,
        eligibleAfterTurnByMinorCiv: Object.fromEntries(Object.keys(minorCivs).map(minorCivId => [minorCivId, 0])),
      },
    };

    const due = processMinorCivLeagueTurn(state);
    const sameTurn = processMinorCivLeagueTurn(due);
    const nondue = processMinorCivLeagueTurn({ ...due, turn: due.turn + 1 });

    expect(Object.values(due.minorCivLeagues!.leagues)).toHaveLength(MINOR_CIV_LEAGUE_RULES.maxLeagues);
    expect(Object.values(due.minorCivLeagues!.leagues).every(league => league.memberIds.length <= MINOR_CIV_LEAGUE_RULES.maxMembers)).toBe(true);
    expect(sameTurn).toEqual(due);
    expect(nondue.minorCivLeagues).toEqual(due.minorCivLeagues);
  });
});
