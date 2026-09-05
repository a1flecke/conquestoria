import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { conquestMinorCiv } from '@/systems/minor-civ-system';
import {
  assertNoRunaway,
  fixtureAlliedWithMajor,
  fixtureAtWarWithMajor,
  fixtureBlockedSpawn,
  fixtureCoalitionMember,
  fixtureCoastal,
  fixtureEarlyGameNearYoungPlayer,
  fixtureLateEra,
  fixtureMilitaristic,
  fixturePeacefulIsolated,
  fixturePoorStruggling,
  fixtureProsperousMercantile,
  fixtureRecentlyAttacked,
  fixtureThreatenedNoWar,
  longestConsecutiveRun,
  MAX_RECOVERY_TURNS,
  runMinorCivLongRun,
  type MinorCivFixture,
} from './helpers/minor-civ-scenario-fixtures';

// #949 (H4, #490 audit): this repo had ~40 per-function minor-civ economy unit tests and a
// 5-turn integration smoke, but zero long-run/balance-scenario coverage — which is exactly why
// the #948 (unbounded population growth, magic era upgrade) and #951 (dead mobilization state)
// bugs shipped unnoticed. This file drives every scenario fixture through the real `processTurn`
// (turn-manager) path, not the narrower `processMinorCivEconomyTurn` unit-test entry point, so
// cross-system interactions of that same bug class are actually reachable here. Deliberately kept
// out of minor-civ-economy-system.test.ts per #949's own note — a separate file for long-run
// coverage. A narrower, #951-scoped 120-turn conflict test already lives in
// minor-civ-economy-system.test.ts; this file's "#16 — 100+ turn conflict" case below is broader
// (tracks the full envelope list, not just levy-specific fields) and does not replace it.
//
// Turn count: 90 for the per-fixture sweep (14 fixtures), 120 for the two flagship 100+-turn
// simulations. Measured solo-run durations: ~0.7-1.5s per 90-turn single-city fixture, ~2.5s for
// the two-minor-civ coalition fixture, ~1.3-1.4s per 120-turn flagship simulation (full
// processTurn does far more work per turn than the narrower processMinorCivEconomyTurn-only test
// in minor-civ-economy-system.test.ts). Per-test timeouts below are set well above 2x those
// observed solo durations to hold up under this machine's routine multi-worktree-agent
// contention — see #608's heavy-simulation-test guidance for why this file also carries an entry
// in SLOW_TEST_FILES.
const FIXTURE_SWEEP_TURNS = 90;
const FLAGSHIP_TURNS = 120;

const FIXTURES: Array<{ name: string; build: (seed: string) => MinorCivFixture }> = [
  { name: 'peaceful isolated city-state', build: fixturePeacefulIsolated },
  { name: 'prosperous mercantile city-state', build: fixtureProsperousMercantile },
  { name: 'militaristic city-state', build: fixtureMilitaristic },
  { name: 'poor / struggling city-state', build: fixturePoorStruggling },
  { name: 'threatened city-state (hostile nearby, no war)', build: fixtureThreatenedNoWar },
  { name: 'city-state at war with a major civ', build: fixtureAtWarWithMajor },
  { name: 'allied city-state (major-civ ally)', build: fixtureAlliedWithMajor },
  { name: 'recently attacked city-state', build: fixtureRecentlyAttacked },
  { name: 'early-game city-state near a young player', build: fixtureEarlyGameNearYoungPlayer },
  { name: 'late-era city-state', build: fixtureLateEra },
  { name: 'coastal city-state', build: fixtureCoastal },
  { name: 'blocked unit spawn (city + neighbours occupied)', build: fixtureBlockedSpawn },
];

describe('#949 — long-run scenario fixtures stay bounded', () => {
  for (const { name, build } of FIXTURES) {
    it(`${name}: population/units/pending-spawn stay within bounds over ${FIXTURE_SWEEP_TURNS} turns`, () => {
      const { state, minorCivId } = build(`mc-949-${name}`);
      const bus = new EventBus();

      const trace = runMinorCivLongRun(state, minorCivId, FIXTURE_SWEEP_TURNS, bus);

      expect(() => assertNoRunaway(trace)).not.toThrow();
    }, 15000);
  }

  it('coalition member: coalition state stays coherent and bounded over 90 turns', () => {
    const { state, minorCivId } = fixtureCoalitionMember('mc-949-coalition');
    const bus = new EventBus();

    const trace = runMinorCivLongRun(state, minorCivId, FIXTURE_SWEEP_TURNS, bus);

    expect(() => assertNoRunaway(trace)).not.toThrow();
    // A coalition's own countdown is only 4-6 turns (coalitionTalksCountdown), so 90 turns is way
    // more than enough for it to resolve out of 'forming' — a coalition genuinely stuck there the
    // whole run (never activating) would be a real bug. Verified this fixture does form a
    // coalition and it reaches 'active' well before turn 90.
    const finalCoalitions = Object.values(trace.finalState.minorCivCoalitions ?? {});
    expect(finalCoalitions.length).toBeGreaterThan(0);
    expect(finalCoalitions.every(coalition => coalition.status === 'active')).toBe(true);
  }, 15000);

  it('early-game near a young player: never levies or grants free population/units in the first 20 turns', () => {
    const { state, minorCivId } = fixtureEarlyGameNearYoungPlayer('mc-949-early-safety');
    const bus = new EventBus();
    const before = {
      population: state.cities[state.minorCivs[minorCivId].cityId].population,
      unitCount: state.minorCivs[minorCivId].units.length,
    };

    const trace = runMinorCivLongRun(state, minorCivId, 20, bus);

    expect(trace.levyCount).toBe(0);
    const last = trace.samples[trace.samples.length - 1];
    expect(last.population).toBeGreaterThanOrEqual(before.population);
    expect(last.liveUnitCount).toBeLessThanOrEqual(before.unitCount + 1); // at most one production-backed defender
  }, 10000);

  it('blocked spawn: pending-spawn attempts never exceed the tuned max and the civ never errors', () => {
    const { state, minorCivId } = fixtureBlockedSpawn('mc-949-blocked-spawn');
    const bus = new EventBus();

    const trace = runMinorCivLongRun(state, minorCivId, FIXTURE_SWEEP_TURNS, bus);

    expect(() => assertNoRunaway(trace)).not.toThrow();
    expect(trace.finalState.minorCivs[minorCivId]).toBeDefined();
  }, 15000);
});

describe('#949 — city-state conquered mid-run', () => {
  it('does not error before or after being conquered, and stops accumulating envelope state once destroyed', () => {
    const { state, minorCivId } = fixturePeacefulIsolated('mc-949-conquered-mid-run');
    const bus = new EventBus();

    const trace = runMinorCivLongRun(state, minorCivId, 40, bus, (turnState, turn) => {
      if (turn !== 20) return turnState;
      return conquestMinorCiv(turnState, minorCivId, 'player').state;
    });

    // onSample fires when nextState.turn === 20, before that turn's sample is captured, so the
    // turn-20 sample itself already reflects the conquest. Filter by turn number rather than
    // array index — processTurn's first call already advances state.turn past its starting value,
    // so "turn 20" is not necessarily samples[19].
    const preConquest = trace.samples.filter(sample => sample.turn < 20);
    const postConquest = trace.samples.filter(sample => sample.turn >= 20);
    expect(preConquest.every(sample => !sample.destroyed)).toBe(true);
    expect(postConquest.every(sample => sample.destroyed)).toBe(true);
    expect(trace.finalState.minorCivs[minorCivId].isDestroyed).toBe(true);
    expect(trace.finalState.cities[trace.finalState.minorCivs[minorCivId].cityId].owner).toBe('player');
  }, 10000);
});

describe('#949 — flagship 100+ turn simulations', () => {
  it('#15 — 100+ turn peaceful simulation stays bounded with no permanent mobilization', () => {
    const { state, minorCivId } = fixturePeacefulIsolated('mc-949-flagship-peaceful');
    const bus = new EventBus();

    const trace = runMinorCivLongRun(state, minorCivId, FLAGSHIP_TURNS, bus);

    expect(() => assertNoRunaway(trace)).not.toThrow();
    expect(trace.levyCount).toBe(0);
    // No sustained threat exists in this fixture, so posture must not get permanently stuck in
    // 'mobilizing' — a handful of turns is fine (garrison loss / transient), but not the whole run.
    const mobilizingTurns = trace.samples.filter(sample => sample.posture === 'mobilizing').length;
    expect(mobilizingTurns).toBeLessThan(FLAGSHIP_TURNS / 2);
  }, 20000);

  it('#16 — 100+ turn conflict simulation keeps levies rare, recovery bounded, and eventually exits recovery', () => {
    const { state, minorCivId } = fixtureAtWarWithMajor('mc-949-flagship-conflict');
    const bus = new EventBus();

    const trace = runMinorCivLongRun(state, minorCivId, FLAGSHIP_TURNS, bus);

    expect(() => assertNoRunaway(trace)).not.toThrow();
    // Rare and bounded: gated by a 10-turn cooldown plus a real population cost (see
    // .claude/rules/game-balance.md "City-State Emergency Levy (#951)").
    expect(trace.levyCount).toBeGreaterThan(0);
    expect(trace.levyCount).toBeLessThanOrEqual(FLAGSHIP_TURNS / 10);
    const recoveringTurns = trace.samples.filter(sample => sample.recovering).length;
    expect(recoveringTurns).toBeGreaterThan(0);
    // Recovery must eventually exit — checked directly by bounding the longest unbroken streak of
    // recovering=true samples, rather than inferring it from cooldown-timing arithmetic (which is
    // sensitive to exactly when the last levy happens to land relative to the run's end). This
    // holds regardless of where in the run recovery windows fall.
    expect(longestConsecutiveRun(trace.samples, sample => sample.recovering)).toBeLessThanOrEqual(MAX_RECOVERY_TURNS);
  }, 20000);
});

describe('#949 — determinism', () => {
  it('same seed and starting state produce an identical multi-turn trace', () => {
    const seed = 'mc-949-determinism-replay';
    const first = fixtureAtWarWithMajor(seed);
    const second = fixtureAtWarWithMajor(seed);
    const bus = new EventBus();

    const traceA = runMinorCivLongRun(first.state, first.minorCivId, 60, bus);
    const traceB = runMinorCivLongRun(second.state, second.minorCivId, 60, bus);

    expect(traceA.samples).toEqual(traceB.samples);
    expect(traceA.levyCount).toBe(traceB.levyCount);
  }, 15000);

  it('save -> reload -> process one turn matches the uninterrupted path', () => {
    const { state, minorCivId } = fixtureAtWarWithMajor('mc-949-determinism-reload');
    const bus = new EventBus();

    // Run partway, then fork: one branch continues uninterrupted, the other goes through a
    // normalize pass (the same one save-manager's real load path applies) before continuing.
    let midState = state;
    for (let turn = 0; turn < 15; turn++) {
      midState = processTurn(midState, bus);
    }

    const uninterrupted = processTurn(midState, bus);
    const reloaded = normalizeLoadedStateForTest(structuredClone(midState));
    const afterReload = processTurn(reloaded, bus);

    expect(afterReload.cities[afterReload.minorCivs[minorCivId].cityId].population)
      .toBe(uninterrupted.cities[uninterrupted.minorCivs[minorCivId].cityId].population);
    expect(afterReload.minorCivs[minorCivId].units.length).toBe(uninterrupted.minorCivs[minorCivId].units.length);
    expect(afterReload.minorCivs[minorCivId].economy).toEqual(uninterrupted.minorCivs[minorCivId].economy);
  }, 10000);
});
