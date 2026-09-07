import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { MINOR_CIV_LEAGUE_RULES } from '@/systems/minor-civ-league-definitions';
import { assertNoRunaway, runMinorCivLongRun } from './helpers/minor-civ-scenario-fixtures';
import { addAuditCompact, makeMinorCivLeagueAuditFixture } from './helpers/minor-civ-league-audit-fixture';

const TURNS = 120;

function makeScenario(challenge: 'explorer' | 'standard' | 'veteran', concern: boolean) {
  const fixture = makeMinorCivLeagueAuditFixture(`mc-496-longrun-${challenge}-${concern ? 'concern' : 'peaceful'}`, challenge);
  const compacted = addAuditCompact(fixture.state, fixture.firstId, fixture.secondId);
  return {
    ...fixture,
    state: concern ? setMinorCivWarState(compacted, 'player', fixture.firstId, true).state : compacted,
  };
}

describe('#496 final arc — compact long-run envelope', () => {
  it.each([
    ['explorer', false], ['explorer', true],
    ['standard', false], ['standard', true],
    ['veteran', false], ['veteran', true],
  ] as const)('%s / %s: preserves compact and economy bounds for 120 canonical turns', (challenge, concern) => {
    const scenario = makeScenario(challenge, concern);
    const trace = runMinorCivLongRun(scenario.state, scenario.secondId, TURNS, new EventBus());

    expect(() => assertNoRunaway(trace)).not.toThrow();
    const leagues = Object.values(trace.finalState.minorCivLeagues!.leagues);
    expect(leagues.some(league => league.memberIds.includes(scenario.secondId))).toBe(true);
    expect(leagues.length).toBeLessThanOrEqual(MINOR_CIV_LEAGUE_RULES.maxLeagues);
    expect(leagues.every(league => (
      league.memberIds.length >= MINOR_CIV_LEAGUE_RULES.minMembers
      && league.memberIds.length <= MINOR_CIV_LEAGUE_RULES.maxMembers
    ))).toBe(true);
  }, 20000);

  it('replays the same peaceful compact trace from an identical seed', () => {
    const first = makeScenario('standard', false);
    const second = makeScenario('standard', false);

    const traceA = runMinorCivLongRun(first.state, first.secondId, TURNS, new EventBus());
    const traceB = runMinorCivLongRun(second.state, second.secondId, TURNS, new EventBus());

    expect(traceA.samples).toEqual(traceB.samples);
    expect(traceA.finalState.minorCivLeagues).toEqual(traceB.finalState.minorCivLeagues);
  }, 20000);
});
