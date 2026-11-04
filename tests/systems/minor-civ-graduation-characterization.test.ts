import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import {
  evaluateMinorCivGraduationEligibility,
  planMinorCivGraduations,
} from '@/systems/minor-civ-graduation';
import {
  GRADUATION_CADENCE_TURNS,
  MINOR_CIV_GRADUATION_TUNING,
} from '@/systems/minor-civ-graduation-rules';
import { resolveCivilizationEra, resolveWorldAge } from '@/systems/tech-definitions';
import { simTimeout } from '../helpers/sim-timeout';
import {
  advancePlayerCivToEra,
  fixtureAtWarWithMajor,
  fixtureEarlyGameNearYoungPlayer,
  fixtureLateEra,
  fixtureProsperousMercantile,
  type MinorCivFixture,
} from './helpers/minor-civ-scenario-fixtures';

/**
 * #497 PR 1 -- how the graduation read side behaves over real campaigns.
 *
 * The unit tests pin each gate on a hand-built state. This drives city-states through the real
 * `processTurn` path for 220 rounds (four cadence turns past the standard minimum age) and checks
 * the properties that must hold however the economy evolves: the planner never throws, it only
 * ever evaluates on the cadence, nothing becomes eligible before it can possibly be old enough,
 * a city-state at war is never a candidate, and a save/reload at a cadence turn gives the same plan.
 *
 * The idle world never matures on its own (nothing here plays the civilizations), so at turn 60 the
 * run lifts both majors to a mature era, the way a real campaign's tech progress would. Set
 * GRADUATION_CHARACTERIZATION_REPORT=<file path> to write, per fixture, what each cadence turn decided
 * and why the tracked city-state was or was not a candidate -- the evidence for the tuning in
 * MINOR_CIV_GRADUATION_TUNING, which is provisional until the arc's campaign validation.
 */

const TURNS = 220;
const MATURE_AT_TURN = 60;
const MATURE_ERA = 5;
const TUNING = MINOR_CIV_GRADUATION_TUNING.standard;
// Solo: ~2-3 s per 220-turn fixture plus four reload round-trips each; simTimeout applies the shared loaded-host factor.
const LONGRUN_TIMEOUT_MS = simTimeout(6000);

const FIXTURES: Array<{ name: string; build: (seed: string) => MinorCivFixture }> = [
  { name: 'early-game city-state near a young player', build: fixtureEarlyGameNearYoungPlayer },
  { name: 'prosperous mercantile city-state', build: fixtureProsperousMercantile },
  { name: 'city-state at war with a major civ', build: fixtureAtWarWithMajor },
  { name: 'late-era city-state', build: fixtureLateEra },
];

/** Lift every major to a shared mature era, as a campaign's tech progress would over time. */
function matureWorld(state: GameState): void {
  const player = state.civilizations.player;
  if (resolveCivilizationEra(player.techState.completed) < MATURE_ERA) advancePlayerCivToEra(state, MATURE_ERA);
  for (const civ of Object.values(state.civilizations)) civ.techState.completed = [...player.techState.completed];
}

interface CadenceObservation {
  turn: number;
  plan: ReturnType<typeof planMinorCivGraduations>;
  trackedReason: string;
  worldAge: number;
}

function runCampaign(fixture: MinorCivFixture, minorCivId: string): CadenceObservation[] {
  const bus = new EventBus();
  const observations: CadenceObservation[] = [];
  let state = fixture.state;

  for (let round = 0; round < TURNS; round += 1) {
    state = processTurn(state, bus);
    if (state.turn === MATURE_AT_TURN) matureWorld(state);

    const plan = planMinorCivGraduations(state);
    expect(plan.turn).toBe(state.turn);

    // Nothing can be a candidate before it is old enough: every founding turn is >= 1.
    for (const id of Object.keys(state.minorCivs)) {
      const evaluation = evaluateMinorCivGraduationEligibility(state, id);
      if (state.turn <= TUNING.minAgeTurns) {
        expect(evaluation.eligible, `${id} eligible at turn ${state.turn}`).toBe(false);
      }
      if (state.minorCivs[id]!.diplomacy.atWarWith.length > 0) {
        expect(evaluation.eligible, `${id} eligible at war on turn ${state.turn}`).toBe(false);
      }
    }

    if (plan.status === 'evaluated') {
      expect(state.turn % GRADUATION_CADENCE_TURNS).toBe(0);
      const succeeded = plan.rolls.filter(roll => roll.succeeded).map(roll => roll.minorCivId);
      expect(plan.selectedMinorCivId === null || succeeded.includes(plan.selectedMinorCivId)).toBe(true);
    }

    if (state.turn % GRADUATION_CADENCE_TURNS === 0) {
      // Saving and reloading at a decision point must not change the decision.
      const reloaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)));
      expect(planMinorCivGraduations(reloaded), `plan diverged after reload at turn ${state.turn}`).toEqual(plan);

      const tracked = evaluateMinorCivGraduationEligibility(state, minorCivId);
      observations.push({
        turn: state.turn,
        plan,
        trackedReason: tracked.eligible ? 'eligible' : tracked.reason,
        worldAge: resolveWorldAge(state),
      });
    }
  }
  return observations;
}

describe('#497 PR 1 -- graduation planning over real campaigns', () => {
  const report: Record<string, Array<Record<string, unknown>>> = {};

  for (const { name, build } of FIXTURES) {
    it(`${name}: plans only on the cadence and never graduates before it can`, () => {
      const fixture = build(`mc-497-${name}`);
      const observations = runCampaign(fixture, fixture.minorCivId);

      expect(observations.map(entry => entry.turn)).toEqual([50, 100, 150, 200]);
      // Before the world matures at turn 60, the first decision is always "the world is too young".
      expect(observations[0]!.plan).toEqual({ status: 'skipped', turn: 50, reason: 'world-too-young' });
      // The standard tier cannot select anyone before a city-state is old enough (turn 150 is age 149).
      for (const entry of observations.filter(candidate => candidate.turn <= TUNING.minAgeTurns)) {
        expect(entry.plan.status === 'evaluated' ? entry.plan.selectedMinorCivId : null).toBeNull();
      }

      report[name] = observations.map(entry => ({
        turn: entry.turn,
        worldAge: entry.worldAge,
        plan: entry.plan.status === 'skipped' ? `skipped:${entry.plan.reason}` : `evaluated:${entry.plan.selectedMinorCivId ?? 'none'}`,
        trackedCityState: entry.trackedReason,
      }));
    }, LONGRUN_TIMEOUT_MS);
  }

  it('reports what each cadence turn decided (set GRADUATION_CHARACTERIZATION_REPORT=<file path> to write it)', () => {
    const reportPath = process.env.GRADUATION_CHARACTERIZATION_REPORT;
    if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 1)}\n`);
    expect(Object.keys(report).length).toBe(FIXTURES.length);
  });
});
