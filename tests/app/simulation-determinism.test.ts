import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processTurn } from '@/core/turn-manager';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { createSimulationRng } from '@/systems/simulation-rng';
import {
  assertSimulationEquivalent,
  firstSimulationDivergence,
} from '../helpers/deterministic-state';
import type { GameState, HotSeatConfig, SoloSetupConfig } from '@/core/types';

/**
 * #1004 — whole-simulation determinism contracts.
 *
 * Turns determinism from a cultural convention into checked architecture.
 * Four contracts, all compared through the ONE canonical
 * `assertSimulationEquivalent` helper (tests/helpers/deterministic-state.ts)
 * so "equivalent" has a single documented meaning:
 *
 *   1. Same seed + same command sequence  → equivalent whole state
 *      (+ a negative: a different seed diverges meaningfully).
 *   2. Run N → save → load → continue M    → equivalent to an uninterrupted
 *      N+M run. This crosses the real serialize / parse / migrate /
 *      normalize load path, so it exercises `migrateSaveToCurrent`'s
 *      unconditional normalizer tail, AI-portfolio reconstruction, visibility
 *      rebuilds, territory recalculation, minor-civ + #496 league
 *      normalization, and the RNG streams that re-derive from persisted
 *      `gameId`/`turn`.
 *   3. AI: identical (seed, state) → identical decision trace and result
 *      state, in-process and across a save boundary.
 *   4. Domain-stream independence: an out-of-band consumer draining its own
 *      `createSimulationRng` stream between rounds cannot perturb the
 *      pipeline. `tests/systems/simulation-rng.test.ts` proves this
 *      structurally at the unit level (each factory call is an independent
 *      stream, not a shared cursor); this is the whole-simulation
 *      integration counterpart #1004 asks for.
 *
 * Heavy — registered in `SLOW_TEST_FILES` (asserted by
 * tests/app/determinism-contract-meta.test.ts), so the fast local push gate
 * skips it. CI's full `yarn test` runs it.
 *
 * Not re-tested here (already covered elsewhere, cited so the connection is
 * explicit):
 *  • byte-identical 20-round replay from a cloned start —
 *    tests/app/determinism-guard.test.ts.
 *  • per-subsystem "different seeds diverge / same seed reproduces / distinct
 *    actors draw independently" for every converted RNG stream —
 *    tests/systems/simulation-rng-migration-982.test.ts.
 *  • the RNG source-rule gate firing on a new hand-rolled LCG —
 *    tests/scripts/check-src-rule-violations.test.ts and
 *    tests/app/determinism-contract-meta.test.ts.
 */

const BASE_CONFIG: Omit<SoloSetupConfig, 'seed' | 'gameTitle'> = {
  civType: 'generic',
  mapSize: 'small',
  opponentCount: 3,
};

// Enough rounds to reach AI planning, minor-civ economy turns, diplomacy
// drift, territory growth, and visibility changes — the systems most likely
// to drift across a save boundary — without turning a single local slow-tier
// run into minutes. Split N/M so the save happens mid-trajectory.
const ROUNDS_BEFORE_SAVE = 10;
const ROUNDS_AFTER_SAVE = 6;

// Sized well above observed worst case, per .claude/rules/hooks-and-tooling.md:
// this file advances the full multi-civ pipeline several times per test and
// must never sit on vitest's 5s default under multi-worktree contention.
const CONTRACT_TIMEOUT_MS = 45_000;

function freshGame(seed: string): GameState {
  return createNewGame({ ...BASE_CONFIG, seed, gameTitle: `determinism ${seed}` });
}

const HOT_SEAT_CONFIG: HotSeatConfig = {
  playerCount: 2,
  mapSize: 'small',
  players: [
    { slotId: 'player-1', name: 'A', civType: 'generic', isHuman: true },
    { slotId: 'player-2', name: 'B', civType: 'generic', isHuman: true },
  ],
};

function freshHotSeatGame(seed: string): GameState {
  return createHotSeatGame(HOT_SEAT_CONFIG, seed, `hot seat determinism ${seed}`, 'standard');
}

function advanceRound(state: GameState): GameState {
  const bus = new EventBus();
  const result = runCompletedRound(state, bus, {
    improvements: (s, b) => processImprovementTurns(s, b),
    majors: (s, b) => processNonHumanMajorRound(s, b).state,
    world: (s, b) => processTurn(s, b),
    postprocess: (before, s, b) => applyStrategicWarningTransitions(before, s, b),
  });
  if (!result.ok) throw result.error;
  return result.state;
}

function advance(state: GameState, rounds: number): GameState {
  let current = state;
  for (let i = 0; i < rounds; i += 1) current = advanceRound(current);
  return current;
}

/**
 * The real load path a `.json` save file goes through: serialize to text,
 * parse it back, then run the same `normalizeLoadedState` every DB / autosave
 * / file import load calls. Deliberately NOT `structuredClone` — the JSON
 * boundary is part of what determinism must survive.
 */
function saveAndReload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') {
    throw new Error(`save file did not round-trip: ${parsed.message}`);
  }
  return normalizeLoadedState(parsed.state);
}

describe('#1004 Contract 1 — same seed + same commands => equivalent whole state', () => {
  it('two independently created games on the same seed reach equivalent state after a shared command sequence', () => {
    // The "command sequence" for a solo no-input playthrough is the empty
    // sequence applied identically to both runs (determinism-guard covers
    // the byte-identical clone case; this one also proves independent
    // createNewGame calls converge, and routes the comparison through the
    // canonical helper rather than a bespoke playthroughId carve-out).
    const a = advance(freshGame('contract-1-shared'), ROUNDS_BEFORE_SAVE);
    const b = advance(freshGame('contract-1-shared'), ROUNDS_BEFORE_SAVE);

    expect(a.gameId).toBe(b.gameId);
    expect(a.playthroughId).not.toBe(b.playthroughId);
    assertSimulationEquivalent(a, b, 'Contract 1: same seed, same commands');
  }, CONTRACT_TIMEOUT_MS);

  it('a different seed diverges meaningfully (the comparison is not vacuous)', () => {
    const a = advance(freshGame('contract-1-seed-a'), ROUNDS_BEFORE_SAVE);
    const b = advance(freshGame('contract-1-seed-b'), ROUNDS_BEFORE_SAVE);

    expect(a.gameId).not.toBe(b.gameId);
    const divergence = firstSimulationDivergence(a, b);
    expect(divergence).not.toBeNull();
    // "meaningfully" — not just a single incidental counter. Sample several
    // independent facets of the world and require most of them to differ.
    const facets = [
      JSON.stringify(a.units) === JSON.stringify(b.units),
      JSON.stringify(a.cities) === JSON.stringify(b.cities),
      JSON.stringify(a.map.tiles) === JSON.stringify(b.map.tiles),
      JSON.stringify(a.minorCivs) === JSON.stringify(b.minorCivs),
      JSON.stringify(a.civilizations) === JSON.stringify(b.civilizations),
    ];
    const differing = facets.filter(same => !same).length;
    expect(differing).toBeGreaterThanOrEqual(4);
  }, CONTRACT_TIMEOUT_MS);

  it.each(['explorer', 'veteran'] as const)(
    'determinism holds on the %s challenge tier, not just the default',
    challenge => {
      // opponentChallenge is persisted state that feeds AI behaviour, unrest
      // pressure and world-pressure scaling. Determinism must not be a
      // property of the default tier only — a challenge-scaled code path that
      // reached for wall-clock or an unkeyed stream would show up here and
      // nowhere else in this file.
      const config = { ...BASE_CONFIG, seed: `contract-1-${challenge}`, gameTitle: challenge, opponentChallenge: challenge };
      const a = advance(createNewGame(config), 6);
      const b = advance(createNewGame(config), 6);

      expect(a.opponentChallenge).toBe(challenge);
      assertSimulationEquivalent(a, b, `Contract 1: same seed on ${challenge}`);
    },
    CONTRACT_TIMEOUT_MS,
  );
});

describe('#1004 Contract 2 — whole-state save/reload continuity', () => {
  it('run N, save to a file, reload, continue M — reaches the SAME state as an uninterrupted N+M run', () => {
    // Both sides are compared through the real load path. The load path
    // applies one-time canonicalisation (optional containers default to `{}`,
    // minor-civ `lastNotifiedStatusByCiv` is backfilled to each civ's current
    // status) that live play does not — untangling that is #1023's job. What
    // #1004 pins is the thing a player actually cares about: loading a save
    // mid-game and playing on lands you exactly where playing straight
    // through would have.
    const uninterrupted = saveAndReload(
      advance(freshGame('contract-2-continuity'), ROUNDS_BEFORE_SAVE + ROUNDS_AFTER_SAVE),
    );

    const midpoint = advance(freshGame('contract-2-continuity'), ROUNDS_BEFORE_SAVE);
    const reloaded = saveAndReload(midpoint);
    expect(reloaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    const continued = saveAndReload(advance(reloaded, ROUNDS_AFTER_SAVE));

    assertSimulationEquivalent(continued, uninterrupted, 'Contract 2: save/reload continuity (file path)');
  }, CONTRACT_TIMEOUT_MS);

  it('the load path is a fixed point: reloading an already-loaded state changes nothing', () => {
    const once = saveAndReload(advance(freshGame('contract-2-idempotent'), ROUNDS_BEFORE_SAVE));
    const twice = saveAndReload(once);

    assertSimulationEquivalent(twice, once, 'Contract 2: normalizeLoadedState idempotence');
  }, CONTRACT_TIMEOUT_MS);

  it('the one-time load canonicalisation does not touch any gameplay-bearing state', () => {
    // Characterisation of the known #1023 delta: a mid-game reload differs
    // from a never-saved run ONLY in playthrough identity and
    // previously-absent optional bookkeeping containers — never a unit, city,
    // tile owner, tech, yield, diplomacy record or AI portfolio.
    const uninterrupted = advance(freshGame('contract-2-delta'), ROUNDS_BEFORE_SAVE + ROUNDS_AFTER_SAVE);
    const continued = advance(
      saveAndReload(advance(freshGame('contract-2-delta'), ROUNDS_BEFORE_SAVE)),
      ROUNDS_AFTER_SAVE,
    );

    // Every gameplay-bearing container is byte-identical. The known #1023
    // delta lives only in `minorCivs.*.lastNotifiedStatusByCiv` (a
    // notification-bookkeeping map, `?? 'neutral'` at every read) and in
    // previously-absent optional top-level containers — never here.
    assertSimulationEquivalent(continued.units, uninterrupted.units, 'Contract 2: reload must not alter units');
    assertSimulationEquivalent(continued.cities, uninterrupted.cities, 'Contract 2: reload must not alter cities');
    assertSimulationEquivalent(continued.civilizations, uninterrupted.civilizations, 'Contract 2: reload must not alter civilizations');
    assertSimulationEquivalent(continued.map, uninterrupted.map, 'Contract 2: reload must not alter the map');
    for (const civ of Object.keys(continued.civilizations)) {
      expect(continued.opponentAI?.majorCivs[civ]).toEqual(uninterrupted.opponentAI?.majorCivs[civ]);
    }
    // ...and once both are put through the load path, even the bookkeeping delta is gone.
    assertSimulationEquivalent(
      saveAndReload(continued),
      saveAndReload(uninterrupted),
      'Contract 2: canonicalised states are byte-identical',
    );
  }, CONTRACT_TIMEOUT_MS);

  it('hot seat: save/reload continuity holds, and per-viewer state survives the round trip', () => {
    // Hot seat carries the persisted state most at risk across a save
    // boundary: the `hotSeat` slot config itself, per-viewer `pendingEvents`
    // queues, and two living humans (so `opponentAI.pressureByCiv` has two
    // ledgers, not one). Solo coverage above would not catch a regression in
    // any of them. Fewer rounds than the solo case — the point here is
    // hot-seat-specific persistence, not trajectory depth.
    const HOT_SEAT_N = 6;
    const HOT_SEAT_M = 4;

    const uninterrupted = saveAndReload(advance(freshHotSeatGame('contract-2-hotseat'), HOT_SEAT_N + HOT_SEAT_M));
    const continued = saveAndReload(
      advance(saveAndReload(advance(freshHotSeatGame('contract-2-hotseat'), HOT_SEAT_N)), HOT_SEAT_M),
    );

    assertSimulationEquivalent(continued, uninterrupted, 'Contract 2: hot-seat save/reload continuity');

    // Pin the hot-seat-specific carriers explicitly rather than trusting the
    // whole-state compare to have reached them.
    expect(continued.hotSeat).toEqual(uninterrupted.hotSeat);
    expect(continued.hotSeat?.players).toHaveLength(2);
    const humanIds = Object.values(continued.civilizations)
      .filter(civ => civ.isHuman && !civ.isEliminated).map(civ => civ.id).sort();
    expect(humanIds).toHaveLength(2);
    expect(Object.keys(continued.opponentAI!.pressureByCiv).sort()).toEqual(humanIds);
    expect(continued.pendingEvents).toEqual(uninterrupted.pendingEvents);
  }, CONTRACT_TIMEOUT_MS);

  it('a freshly created game is stamped at the current schema, so its first save runs zero historical migrations', () => {
    // Root cause of the original Contract 2 failure: createNewGame left
    // saveSchemaVersion undefined, so readSchemaVersion() fell back to 0 and
    // the first load ran the entire 1..CURRENT historical migration chain
    // over a brand-new current-schema game (placeLateResources revealed
    // resources, the v24 research-cost retime moved research progress,
    // minor-civ territory shifted). A new game IS current; it must say so.
    // Asserted as a concrete integer first: `createNewGame` now imports the
    // constant from src/storage across the core→storage boundary, and an ESM
    // cycle there would surface as `undefined` on both sides, making a bare
    // `toBe(CURRENT_SAVE_SCHEMA_VERSION)` pass vacuously.
    expect(typeof CURRENT_SAVE_SCHEMA_VERSION).toBe('number');
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBeGreaterThan(0);

    const fresh = freshGame('contract-2-fresh-schema');
    expect(fresh.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);

    // The serialized fresh game already reports the current schema, so
    // migrateSaveToCurrent's `for (version = source+1..CURRENT)` loop body
    // never executes.
    const serialized = JSON.parse(serializeSaveFile(fresh)) as { saveSchemaVersion?: number };
    expect(serialized.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);

    // Direct behavioural pin on the two loudest symptoms the chain produced,
    // rather than inferring "no migration ran" from the version number alone:
    //   migration 2  (migrateLateResources) re-rolled late resources with
    //     `${gameId}-late-resources`, a DIFFERENT key from creation's
    //     `${seed}-late-resources`, so tiles gained/changed resources.
    //   migration 24 (migrateResearchCostsV24) retimed in-flight research,
    //     moving researchProgress and completing techs.
    const reloaded = saveAndReload(fresh);
    const resourcesOf = (state: GameState) => Object.fromEntries(
      Object.entries(state.map.tiles).map(([key, tile]) => [key, tile.resource ?? null]),
    );
    expect(resourcesOf(reloaded)).toEqual(resourcesOf(fresh));
    for (const [civId, civ] of Object.entries(reloaded.civilizations)) {
      expect(civ.techState, civId).toEqual(fresh.civilizations[civId].techState);
    }
  }, CONTRACT_TIMEOUT_MS);
});

describe('#1004 Contract 3 — deterministic AI', () => {
  it('identical seed + state => identical AI decision trace and identical resulting state', () => {
    // After a completed round the world turn has advanced past
    // opponentAI.lastProcessedRound, so this call really plans (it is not the
    // early-return path).
    const planningState = advance(freshGame('contract-3-ai'), 6);

    const a = processNonHumanMajorRound(structuredClone(planningState), new EventBus());
    const b = processNonHumanMajorRound(structuredClone(planningState), new EventBus());

    expect(a.planningErrors).toEqual([]);
    expect(a.traces).toEqual(b.traces);
    expect(a.planningErrors).toEqual(b.planningErrors);
    assertSimulationEquivalent(a.state, b.state, 'Contract 3: AI same input => same result');
  }, CONTRACT_TIMEOUT_MS);

  it('AI planning is deterministic across a save/reload boundary (persisted opponentAI reconstructs identically)', () => {
    const planningState = advance(freshGame('contract-3-ai-reload'), 6);

    // The AI's decision trace — what it actually chose — must not change just
    // because the game was saved and reloaded first.
    const inProcess = processNonHumanMajorRound(structuredClone(planningState), new EventBus());
    const afterReload = processNonHumanMajorRound(saveAndReload(planningState), new EventBus());
    expect(afterReload.traces).toEqual(inProcess.traces);
    expect(afterReload.planningErrors).toEqual(inProcess.planningErrors);

    // And running the whole AI round from a reloaded state is itself
    // reproducible, down to the resulting simulation state.
    const afterReloadAgain = processNonHumanMajorRound(saveAndReload(planningState), new EventBus());
    assertSimulationEquivalent(
      afterReloadAgain.state,
      afterReload.state,
      'Contract 3: AI round from a reloaded state is deterministic',
    );
  }, CONTRACT_TIMEOUT_MS);
});

describe('#1004 Contract 4 — domain-stream independence', () => {
  it('draining an unrelated simulation RNG stream between rounds does not perturb the pipeline', () => {
    const baseline = advance(freshGame('contract-4-streams'), ROUNDS_BEFORE_SAVE);

    let interfered = freshGame('contract-4-streams');
    for (let round = 0; round < ROUNDS_BEFORE_SAVE; round += 1) {
      // An out-of-band stochastic subsystem: its own domain, its own key,
      // fully drained every round. Because createSimulationRng returns an
      // independent stream per call (not a shared cursor — see
      // simulation-rng.test.ts "domain-stream stability"), nothing the real
      // pipeline draws afterwards may shift.
      const noise = createSimulationRng(interfered, {
        domain: 'test-out-of-band-interference',
        eventId: 'meta',
        ordinal: round,
      });
      for (let n = 0; n < 2_000; n += 1) noise();
      interfered = advanceRound(interfered);
    }

    assertSimulationEquivalent(interfered, baseline, 'Contract 4: domain-stream independence');
  }, CONTRACT_TIMEOUT_MS);
});
