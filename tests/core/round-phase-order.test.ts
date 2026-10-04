/**
 * #1239 — pin `processTurn`'s phase order and output BEFORE it is decomposed (#1240).
 *
 * `processTurn` is one ~1350-line function whose phases depend on each other in ways nothing states (territory is
 * recalculated after cities produce, espionage consumes the visibility the per-civ loop just refreshed, the economy
 * settles last because every earlier phase credits gold to it...). #1240 will move those phases into modules. A pure
 * refactor must not change what runs, in what order, or what comes out — so this file pins all three:
 *
 *   1. ORDER   — the temporal sequence in which `processTurn` enters each existing system seam (a `vi.spyOn`
 *                call-through on functions it already imports; no production API was widened), including the order
 *                it visits civilizations and the order of the steps inside one civ's turn.
 *   2. EVENTS  — the sequence of `EventBus` event types it emits, and a digest of their payloads.
 *   3. OUTPUT  — per-top-level-key digests of the resulting `GameState` after each of three consecutive turns.
 *
 * Call order alone cannot see a reorder between two inline blocks that call no seam, and a state digest alone can miss
 * an ordering dependency the fixture does not exercise. Together they cover both.
 *
 * Regenerate the digests ONLY for an intentional behaviour change to the turn pipeline, never to make a refactor pass:
 *
 *   UPDATE_1239_REFERENCE=1 ./scripts/run-with-mise.sh yarn vitest run tests/core/round-phase-order.test.ts
 *
 * The ORDER literals below are never regenerated: they are the contract. If one has to change, say why in the PR.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { startInterrogation } from '@/systems/espionage-system';
import { digestMigratedState, describeDigestDrift, type MigrationDigest } from '../storage/fixtures/save-compat/migration-digest';
import { buildCrowdedGame } from '../perf/fixtures/crowded-state';
import { SIMULATION_EQUIVALENCE_EXCLUSIONS } from '../helpers/deterministic-state';

import * as legendary from '@/systems/legendary-wonder-system';
import * as elimination from '@/systems/civilization-elimination-system';
import * as opponentAiState from '@/core/opponent-ai-state';
import * as faction from '@/systems/faction-system';
import * as breakaway from '@/systems/breakaway-system';
import * as crisis from '@/systems/crisis-system';
import * as eventChainLifecycle from '@/systems/event-chain-lifecycle';
import * as eventChainScheduling from '@/systems/event-chain-scheduling';
import * as worldRaces from '@/systems/world-race-system';
import * as religion from '@/systems/religion-system';
import * as loyalty from '@/systems/religion-loyalty-system';
import * as crisisResponse from '@/ai/ai-crisis-response';
import * as occupation from '@/systems/city-occupation-system';
import * as supply from '@/systems/supply-system';
import * as naval from '@/systems/naval-operations';
import * as airReadiness from '@/systems/air-readiness';
import * as stampede from '@/systems/stampede-system';
import * as rogueElephant from '@/systems/rogue-elephant-host-system';
import * as autonomy from '@/systems/autonomy-postures';
import * as networkPlans from '@/systems/network-plan-system';
import * as cityBarrel from '@/systems/city-system';
import * as cyber from '@/systems/cyber-warfare-system';
import * as tech from '@/systems/tech-system';
import * as healing from '@/systems/unit-healing';
import * as geneTherapy from '@/systems/gene-therapy-system';
import * as greatGeneral from '@/systems/great-general-system';
import * as unitLifecycle from '@/systems/unit-lifecycle';
import * as diplomacyState from '@/systems/diplomacy-state';
import * as fogOfWar from '@/systems/fog-of-war';
import * as discovery from '@/systems/discovery-system';
import * as lastSeen from '@/systems/last-seen-presentation';
import * as economy from '@/systems/economy-system';
import * as diplomacyRequests from '@/systems/diplomacy-requests';
import * as territory from '@/systems/city-territory-system';
import * as marketplace from '@/systems/marketplace-system';
import * as tradeEconomy from '@/systems/trade-route-economy';
import * as tradeLifecycle from '@/systems/trade-route-lifecycle';
import * as wonder from '@/systems/wonder-system';
import * as barbarians from '@/systems/barbarian-system';
import * as citySiege from '@/systems/city-siege-system';
import * as minorCiv from '@/systems/minor-civ-system';
import * as beasts from '@/systems/beast-system';
import * as threatPressure from '@/systems/threat-pressure-system';
import * as espionage from '@/systems/espionage-system';
import * as detection from '@/systems/detection-system';
import * as vassalage from '@/systems/diplomacy-vassalage';
import * as movement from '@/systems/unit-movement-system';
import * as pirates from '@/systems/pirate-system';
import * as leagues from '@/systems/diplomacy-leagues';
import * as nationalProjects from '@/systems/national-project-system';
import * as victory from '@/systems/victory-system';
import * as autoExplore from '@/systems/auto-explore-system';
import * as pathfinding from '@/systems/unit-pathfinding';

const REGEN = process.env.UPDATE_1239_REFERENCE === '1';
const GOLDEN_PATH = resolve(process.cwd(), 'tests/core/fixtures/round-phase-golden.json');
const TURNS = 3;

// ---------------------------------------------------------------------------------------------------------------
// The seams. Every one is a function `turn-manager.ts` already imports from the module named here (the barrel it
// imports from, where it uses one), so spying the module's export intercepts exactly `processTurn`'s call.
// ---------------------------------------------------------------------------------------------------------------
type Seam = readonly [namespace: Record<string, unknown>, name: string];
const SEAMS: readonly Seam[] = [
  [legendary, 'initializeLegendaryWonderProjectsForAllCities'], [legendary, 'reconcileLegendaryWonderAvailability'],
  [legendary, 'tickLegendaryWonderProjects'], [elimination, 'reconcileCivilizationLiveness'],
  [opponentAiState, 'normalizeOpponentAIState'], [faction, 'processFactionTurn'], [breakaway, 'processBreakawayTurn'],
  [crisis, 'processCrisisTurn'], [crisis, 'processCrisisScheduler'], [eventChainLifecycle, 'processEventChainTurn'],
  [eventChainScheduling, 'processEventChainScheduler'], [worldRaces, 'processWorldRacesTurn'],
  [religion, 'processReligionTurn'], [loyalty, 'processLoyaltyTurn'], [crisisResponse, 'applyCrisisResponses'],
  [occupation, 'tickOccupiedCities'], [supply, 'resolveLandSupplyForCiv'], [naval, 'resolveNavalOperationsForCiv'],
  [airReadiness, 'resolveAirReadinessForCiv'], [stampede, 'processStampedeTurn'], [stampede, 'processStampedeScheduling'],
  [rogueElephant, 'processRogueElephantHostTurn'], [rogueElephant, 'processRogueElephantHostScheduling'],
  [autonomy, 'applyPendingAutonomyPosture'], [autonomy, 'advanceAutonomySurge'],
  [networkPlans, 'resolveStableNetworkPlansForOwnerTurn'], [networkPlans, 'beginNetworkPlansForVictimTurn'],
  [networkPlans, 'resolveNetworkPlansForVictimTurnEnd'], [cityBarrel, 'processCity'], [cyber, 'processCyberDrain'],
  [tech, 'processResearch'], [healing, 'healUnit'], [geneTherapy, 'applyGeneTherapyRecharge'],
  [greatGeneral, 'retireGeneralsAtTurnEnd'], [greatGeneral, 'checkAndQueueGeneralCandidateChoice'],
  [unitLifecycle, 'resetUnitTurn'], [diplomacyState, 'processRelationshipDrift'], [fogOfWar, 'updateVisibility'],
  [discovery, 'syncCivilizationContactsFromVisibility'], [lastSeen, 'refreshLastSeenPresentationsForCiv'],
  [economy, 'applyEconomyTurn'], [diplomacyRequests, 'pruneExpiredDiplomaticRequests'],
  [territory, 'recalculateTerritory'], [territory, 'applyTerritoryFrontierProgressWithEvents'],
  [marketplace, 'processFashionCycle'], [marketplace, 'updatePrices'], [tradeLifecycle, 'scrubStaleForeignRoutes'],
  [tradeLifecycle, 'scrubEmbargoedRoutes'], [tradeEconomy, 'processTradeRouteIncome'], [wonder, 'processWonderEffects'],
  [barbarians, 'processPurposefulBarbarians'], [citySiege, 'applyCityHpRegeneration'],
  [minorCiv, 'processMinorCivTurn'], [minorCiv, 'checkCampEvolution'], [minorCiv, 'checkEraAdvancement'],
  [minorCiv, 'processMinorCivEraUpgrade'], [beasts, 'processBeasts'], [beasts, 'applyHoardChoice'],
  [threatPressure, 'processIndependentThreatPressure'], [espionage, 'processEspionageTurn'],
  [espionage, 'processInterrogation'], [espionage, 'applyBuildingCI'], [detection, 'processDetection'],
  [vassalage, 'processVassalageTurn'], [movement, 'advanceRouteRunners'], [pirates, 'processPiratesForCompletedRound'],
  [leagues, 'checkLeagueDissolution'], [nationalProjects, 'expireNationalProjects'],
  [victory, 'finalizeDominationVictory'], [victory, 'finalizeScienceVictory'],
  [autoExplore, 'applyAutoExploreOrder'], [pathfinding, 'findPath'], [movement, 'executeUnitMove'],
];

interface SeamCall { name: string; civId?: string }
interface RecordedTurn { calls: SeamCall[]; events: Array<{ type: string; payload: unknown }>; state: GameState }

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue;
    out[key] = canonicalize(record[key]);
  }
  return out;
}
const shortHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonicalize(value) ?? null)).digest('hex').slice(0, 12);

/**
 * Some event payloads carry a whole `GameState` (`minor-civ:quest-issued` does), and a state holds the one field that is
 * non-reproducible BY DESIGN: `playthroughId`, salted with `Date.now()`. Remove exactly the fields the project's
 * canonical simulation comparator excludes (`SIMULATION_EQUIVALENCE_EXCLUSIONS`), at any depth, and nothing else.
 */
function withoutNonReproducibleFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNonReproducibleFields);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((SIMULATION_EQUIVALENCE_EXCLUSIONS as readonly string[]).includes(key)) continue;
    out[key] = withoutNonReproducibleFields(child);
  }
  return out;
}

/** Run `turns` consecutive `processTurn`s, spying every seam (call-through) only while the pipeline runs. */
function recordTurns(initial: GameState, turns: number): RecordedTurn[] {
  const recorded: RecordedTurn[] = [];
  let state = initial;
  for (let turn = 0; turn < turns; turn += 1) {
    const calls: SeamCall[] = [];
    const events: RecordedTurn['events'] = [];
    const restore: Array<() => void> = [];
    // Only `processTurn`'s OWN entries are phase entries. A seam entered while another seam is still running (a
    // minor civ's economy calling `processCity`, `applyEconomyTurn` pricing trade routes...) belongs to that seam's
    // internals, and pinning it would fail this test on unrelated changes inside those systems.
    let depth = 0;
    try {
      for (const [namespace, name] of SEAMS) {
        const target = namespace as Record<string, (...args: unknown[]) => unknown>;
        const original = target[name]!;
        const spy = vi.spyOn(target, name);
        spy.mockImplementation(function (this: unknown, ...args: unknown[]) {
          if (depth === 0) calls.push(typeof args[1] === 'string' ? { name, civId: args[1] } : { name });
          depth += 1;
          try {
            return original.apply(this, args);
          } finally {
            depth -= 1;
          }
        });
        restore.push(() => spy.mockRestore());
      }
      const emit = EventBus.prototype.emit;
      const emitSpy = vi.spyOn(EventBus.prototype, 'emit');
      emitSpy.mockImplementation(function (this: EventBus, type: never, payload: never) {
        events.push({ type: String(type), payload });
        return (emit as (t: unknown, p: unknown) => void).call(this, type, payload);
      } as never);
      restore.push(() => emitSpy.mockRestore());
      state = processTurn(state, new EventBus());
    } finally {
      for (const undo of restore) undo();
    }
    recorded.push({ calls, events, state });
  }
  return recorded;
}

// ---------------------------------------------------------------------------------------------------------------
// The fixture: the #1007 crowded game (8 civs, 4 human + 4 AI, 24 cities, 160 units, 6 camps, three wars), plus the
// three situations it does not create by itself, so that every seam above is entered at least once.
// ---------------------------------------------------------------------------------------------------------------
function buildRoundPhaseFixture(): GameState {
  const state = buildCrowdedGame({ entityScale: 1 });

  // Wounded units, so the per-civ healing step runs (every fifth unit in roster order).
  for (const civ of Object.values(state.civilizations)) {
    civ.units.forEach((unitId, index) => {
      const unit = state.units[unitId];
      if (unit && index % 5 === 0) unit.health = 60;
    });
  }

  // Standing unit orders, so the per-civ automation step runs and its place relative to the movement reset matters:
  // each human civ's first warrior auto-explores; each AI civ's first warrior walks to its own first city (a journey).
  for (const civ of Object.values(state.civilizations)) {
    const warrior = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'warrior');
    if (!warrior) continue;
    if (civ.isHuman) {
      warrior.automation = { mode: 'auto-explore', lastTargets: [], startedTurn: state.turn };
    } else {
      const home = civ.cities.map(id => state.cities[id]).find(Boolean);
      if (home) warrior.automation = { mode: 'journey', destination: { ...home.position } };
    }
  }

  // A hoard choice waiting on a civ that is not the current player (AI civs resolve theirs at round end).
  const lairId = Object.keys(state.beasts?.lairs ?? {}).sort()[0];
  if (state.beasts && lairId) {
    state.beasts.pendingHoardChoices = [{ lairId, civId: 'player-6' }];
  }

  // An interrogation in progress, so the interrogation step runs.
  if (state.espionage?.['player-1']) {
    state.espionage['player-1'] = startInterrogation(state.espionage['player-1'], 'spy-captive', 'player-2');
  }
  return state;
}

afterEach(() => vi.restoreAllMocks());

/** Consecutive identical names collapse to `name*` (one or many), so counts that depend on roster size are not pinned. */
function collapse(names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i += 1) {
    let end = i;
    while (end + 1 < names.length && names[end + 1] === names[i]) end += 1;
    out.push(end > i ? `${names[i]}*` : names[i]!);
    i = end;
  }
  return out;
}

interface RoundTrace {
  /** Everything before the first civ's turn. */
  before: string[];
  /** One entry per civ iteration, in visiting order. */
  perCiv: Array<{ civId: string; steps: string[] }>;
  /** Everything after the last civ's turn. */
  after: string[];
}

function traceOf(calls: readonly SeamCall[]): RoundTrace {
  const firstIndex = calls.findIndex(call => call.name === 'resolveLandSupplyForCiv');
  const endIndex = calls.findIndex(call => call.name === 'pruneExpiredDiplomaticRequests');
  if (firstIndex < 0 || endIndex < firstIndex) throw new Error('round trace: per-civ block not found');
  const perCiv: RoundTrace['perCiv'] = [];
  let current: { civId: string; names: string[] } | undefined;
  for (const call of calls.slice(firstIndex, endIndex)) {
    if (call.name === 'resolveLandSupplyForCiv') {
      if (current) perCiv.push({ civId: current.civId, steps: collapse(current.names) });
      current = { civId: call.civId!, names: [] };
    }
    current!.names.push(call.name);
  }
  perCiv.push({ civId: current!.civId, steps: collapse(current!.names) });
  return {
    before: collapse(calls.slice(0, firstIndex).map(call => call.name)),
    perCiv,
    after: collapse(calls.slice(endIndex).map(call => call.name)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// ORDER — the contract. Phase ids name the blocks; the entries are the seams `processTurn` enters, in order.
// ---------------------------------------------------------------------------------------------------------------
const EXPECTED_BEFORE: ReadonlyArray<readonly [phase: string, calls: readonly string[]]> = [
  // Clone, seed legendary-wonder projects, reconcile liveness, normalise the AI container, announce `turn:end`.
  ['prelude', ['initializeLegendaryWonderProjectsForAllCities', 'reconcileCivilizationLiveness', 'normalizeOpponentAIState']],
  // Unrest, revolts and world-scale lifecycles resolve BEFORE any city yield so instability affects this turn.
  ['instability', [
    'processFactionTurn', 'processBreakawayTurn', 'processCrisisTurn', 'processEventChainTurn',
    'processWorldRacesTurn', 'processReligionTurn', 'processLoyaltyTurn',
  ]],
  // Liveness again (revolts can end a civ), crisis responses (shape the AI round), occupation, wonder availability.
  ['pre-civ-reconciliation', [
    'reconcileCivilizationLiveness', 'applyCrisisResponses', 'tickOccupiedCities', 'reconcileLegendaryWonderAvailability',
  ]],
];

/** `Object.entries(state.civilizations)` order: civilizations are visited in roster order, never sorted. */
const EXPECTED_CIV_ORDER: readonly string[] = [
  'player-1', 'player-2', 'player-3', 'player-4', 'player-5', 'player-6', 'player-7', 'player-8',
];

// One civ's own turn. `*` = one or many consecutive calls. The human and AI shapes differ in exactly the steps that
// belong to who the civ is: an AI civ is warned of network plans against it and walks its journey orders; a human
// civ's auto-explore orders run through the explorer.
const CIV_START = [
  // supply, naval and air state, world-pressure turns, autonomy, owner-side network plans
  'resolveLandSupplyForCiv', 'resolveNavalOperationsForCiv', 'resolveAirReadinessForCiv', 'processStampedeTurn',
  'processRogueElephantHostTurn', 'applyPendingAutonomyPosture', 'advanceAutonomySurge',
  'resolveStableNetworkPlansForOwnerTurn',
] as const;
const CIV_ECONOMY_AND_UPKEEP = [
  // cities produce, then the civ's gold and science settle
  'processCity*', 'processCyberDrain', 'resolveNetworkPlansForVictimTurnEnd', 'processResearch',
  // units heal BEFORE their movement resets (healing reads hasMoved/hasActed), then generals retire
  'healUnit', 'applyGeneTherapyRecharge', 'retireGeneralsAtTurnEnd', 'resetUnitTurn*',
] as const;
const CIV_VISION_AND_CANDIDATES = [
  // diplomacy drift, then vision, contact discovery AFTER every vision source, last-seen snapshot, general candidates
  'processRelationshipDrift', 'updateVisibility', 'syncCivilizationContactsFromVisibility',
  'refreshLastSeenPresentationsForCiv', 'checkAndQueueGeneralCandidateChoice',
] as const;
// Standing orders run AFTER the movement reset (a unit's movement is restored first, then automation spends it).
const EXPECTED_HUMAN_CIV_STEPS: readonly string[] = [
  ...CIV_START, ...CIV_ECONOMY_AND_UPKEEP, 'applyAutoExploreOrder', ...CIV_VISION_AND_CANDIDATES,
];
const EXPECTED_AI_CIV_STEPS: readonly string[] = [
  ...CIV_START, 'beginNetworkPlansForVictimTurn', ...CIV_ECONOMY_AND_UPKEEP, 'findPath', 'executeUnitMove',
  ...CIV_VISION_AND_CANDIDATES,
];

const EXPECTED_AFTER: ReadonlyArray<readonly [phase: string, calls: readonly string[]]> = [
  ['post-civ-housekeeping', ['pruneExpiredDiplomaticRequests']],
  ['territory-frontier', ['recalculateTerritory', 'applyTerritoryFrontierProgressWithEvents']],
  ['wonders-market', [
    'tickLegendaryWonderProjects', 'reconcileLegendaryWonderAvailability', 'processFashionCycle', 'updatePrices',
    'processWonderEffects',
  ]],
  ['barbarians', ['processPurposefulBarbarians', 'applyCityHpRegeneration']],
  ['minor-civs', ['processMinorCivTurn', 'checkCampEvolution']],
  ['beasts', ['processBeasts']],
  ['threat-scheduling', [
    'processIndependentThreatPressure', 'processCrisisScheduler', 'processEventChainScheduler',
    'processStampedeScheduling', 'processRogueElephantHostScheduling',
  ]],
  // Espionage reads the visibility the per-civ loop refreshed; the last-seen re-snapshot must follow every
  // visibility write above it.
  ['espionage', [
    'processEspionageTurn', 'processDetection', 'processInterrogation', 'applyBuildingCI*',
    'refreshLastSeenPresentationsForCiv*',
  ]],
  ['diplomacy-trade', ['processVassalageTurn', 'scrubStaleForeignRoutes', 'scrubEmbargoedRoutes', 'advanceRouteRunners']],
  ['pirates', ['processPiratesForCompletedRound']],
  ['trade-income', ['processTradeRouteIncome*']],
  ['leagues', ['checkLeagueDissolution']],
  ['era-progression', ['checkEraAdvancement', 'expireNationalProjects', 'processMinorCivEraUpgrade*']],
  ['beast-rewards', ['applyHoardChoice']],
  // The economy settles LAST: every phase above credits gold to it.
  ['economy', ['applyEconomyTurn*']],
  ['finalization', [
    'reconcileCivilizationLiveness', 'normalizeOpponentAIState', 'finalizeDominationVictory', 'finalizeScienceVictory',
  ]],
];

const EXPECTED_EVENT_TYPES_TURN_1: readonly string[] = [
  'turn:end', 'unit:move', 'fog:revealed', 'wonder:discovered', 'unit:move', 'fog:revealed', 'wonder:discovered',
  'unit:move', 'fog:revealed', 'wonder:discovered*', 'unit:move', 'civilization:first-contact', 'fog:revealed',
  'wonder:discovered*', 'unit:move', 'fog:revealed', 'wonder:discovered*', 'unit:move', 'fog:revealed',
  'wonder:discovered', 'unit:move', 'fog:revealed', 'wonder:discovered*', 'unit:move', 'fog:revealed',
  'wonder:discovered', 'territory:tile-flipped*', 'minor-civ:quest-issued*', 'minor-civ:evolved',
  'threat:barbarian-resurgence*', 'eventchain:started*', 'eventchain:choice-made', 'eventchain:started',
  'eventchain:choice-made', 'eventchain:started', 'eventchain:choice-made', 'espionage:intel-extracted',
  'era:advanced', 'economy:treasury-strain*', 'turn:start',
];

function flatten(blocks: ReadonlyArray<readonly [string, readonly string[]]>): string[] {
  return blocks.flatMap(([, calls]) => [...calls]);
}

interface TurnDigest {
  /** Per-top-level-key digest of the state `processTurn` returned. */
  state: MigrationDigest;
  /** Digest of every emitted event, type AND payload, in emission order. */
  events: string;
  /** Digest of the collapsed trace (phase entries, civ visiting order and each civ's own steps). */
  trace: string;
}
type GoldenFile = { turns: TurnDigest[] };

function digestTurns(turns: readonly RecordedTurn[]): GoldenFile {
  return {
    turns: turns.map(turn => {
      const trace = traceOf(turn.calls);
      return {
        state: digestMigratedState(turn.state),
        events: shortHash(turn.events.map(event => [event.type, withoutNonReproducibleFields(event.payload)])),
        trace: shortHash(trace),
      };
    }),
  };
}

function collapsedEventTypes(turn: RecordedTurn): string[] {
  return collapse(turn.events.map(event => event.type));
}

// Three real `processTurn`s over the 8-civ crowded fixture, recorded twice (once for the pins, once for repeatability).
// Observed ~5s solo; sized ~10x for a loaded CI shard per .claude/rules/hooks-and-tooling.md (#608). Do not lower it.
const PIPELINE_TIMEOUT_MS = 60_000;

describe('processTurn phase order and output are pinned before decomposition (#1239)', () => {
  let run: RecordedTurn[];
  beforeAll(() => {
    run = recordTurns(buildRoundPhaseFixture(), TURNS);
  }, PIPELINE_TIMEOUT_MS);

  it('the rich fixture enters every seam at least once across the three turns', () => {
    const seen = new Set(run.flatMap(turn => turn.calls.map(call => call.name)));
    const never = SEAMS.map(([, name]) => name).filter(name => !seen.has(name));
    expect(never).toEqual([]);
  });

  it('every pinned phase block is non-empty and names only seams that exist', () => {
    const known = new Set(SEAMS.map(([, name]) => name));
    for (const [phase, calls] of [...EXPECTED_BEFORE, ...EXPECTED_AFTER]) {
      expect(calls.length, phase).toBeGreaterThan(0);
      for (const call of calls) expect(known.has(call.replace(/\*$/, '')), `${phase}: ${call}`).toBe(true);
    }
  });

  it('enters the phases in the pinned order', () => {
    const trace = traceOf(run[0]!.calls);
    expect(trace.before).toEqual(flatten(EXPECTED_BEFORE));
    expect(trace.after).toEqual(flatten(EXPECTED_AFTER));
  });

  it('visits civilizations in the pinned order, and runs each civ\'s own steps in the pinned order', () => {
    const trace = traceOf(run[0]!.calls);
    expect(trace.perCiv.map(entry => entry.civId)).toEqual(EXPECTED_CIV_ORDER);
    for (const entry of trace.perCiv) {
      const human = ['player-1', 'player-2', 'player-3', 'player-4'].includes(entry.civId);
      expect(entry.steps, entry.civId).toEqual(human ? EXPECTED_HUMAN_CIV_STEPS : EXPECTED_AI_CIV_STEPS);
    }
  });

  it('emits the pinned event sequence on the first turn', () => {
    expect(collapsedEventTypes(run[0]!)).toEqual(EXPECTED_EVENT_TYPES_TURN_1);
  });

  it('produces the pinned events, trace and state digests for each of three consecutive turns', () => {
    const actual = digestTurns(run);
    if (REGEN) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenFile;
    expect(golden.turns.length).toBe(TURNS);
    actual.turns.forEach((turn, index) => {
      const pinned = golden.turns[index]!;
      expect(describeDigestDrift(pinned.state, turn.state), `turn ${index + 1} state drifted`).toEqual([]);
      expect(turn.state.__whole, `turn ${index + 1} whole-state digest`).toBe(pinned.state.__whole);
      expect(turn.events, `turn ${index + 1} event stream`).toBe(pinned.events);
      expect(turn.trace, `turn ${index + 1} phase trace`).toBe(pinned.trace);
    });
  }, PIPELINE_TIMEOUT_MS);

  it('is repeatable: a second run from a fresh fixture produces identical order, events and state', () => {
    const again = recordTurns(buildRoundPhaseFixture(), TURNS);
    expect(digestTurns(again)).toEqual(digestTurns(run));
    again.forEach((turn, index) => expect(turn.calls).toEqual(run[index]!.calls));
  }, PIPELINE_TIMEOUT_MS);
});
