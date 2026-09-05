import type { EventBus } from '@/core/event-bus';
import type { GameState, MinorCivPolicy, MinorCivPosture } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { createUnit } from '@/systems/unit-system';
import { resolveNeutralPressureEra } from '@/systems/era-resolution';
import {
  getMinorCivPopulationCeiling,
  getMinorCivUnitCap,
  MINOR_CIV_ECONOMY_TUNING,
} from '@/systems/minor-civ-economy-system';

/**
 * Deterministic scenario fixtures for the #949 (H4, #490 audit) long-run coverage gap: this repo
 * had ~40 per-function unit tests for the minor-civ economy but zero long-run/balance-scenario
 * coverage, which is exactly why the #948 (unbounded growth, magic era upgrade) and #951 (dead
 * mobilization state) bugs went unnoticed for as long as they did. Every fixture here builds a
 * real `GameState` via `createNewGame` (never a hand-rolled partial state) and is driven through
 * the full `processTurn` (turn-manager) path in the long-run test file — not the narrower
 * `processMinorCivEconomyTurn` unit-test entry point — so cross-system interaction bugs of the
 * #948/#951 class are actually reachable by this coverage.
 *
 * Every builder takes an explicit `seed` (used for `createNewGame`'s own seed and nothing else —
 * no `Math.random()` anywhere in this file) so a caller can re-run the exact same fixture twice
 * for a determinism check.
 */

// Mirrors setTargetCivEra / setPlayerCivEra in the sibling minor-civ test files: reaching
// personal era N requires partial completion of every era from 2 through N, because
// resolveNeutralPressureEra reads the nearby major civ's own resolved era.
export function advancePlayerCivToEra(state: GameState, era: number): void {
  state.civilizations.player.techState.completed = Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
    .flatMap(candidate => getEraAdvancementTechs(candidate)
      .slice(0, Math.ceil(getEraAdvancementTechs(candidate).length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55)))
      .map(tech => tech.id));
}

export interface MinorCivFixture {
  state: GameState;
  minorCivId: string;
}

function firstMinorCiv(state: GameState): MinorCivFixture {
  const [minorCivId] = Object.keys(state.minorCivs);
  if (!minorCivId) {
    throw new Error('createNewGame produced no minor civs — fixture precondition violated');
  }
  return { state, minorCivId };
}

export function fixturePeacefulIsolated(seed: string): MinorCivFixture {
  return firstMinorCiv(createNewGame(undefined, seed, 'small'));
}

export function fixtureProsperousMercantile(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  fixture.state.minorCivs[fixture.minorCivId].definitionId = 'carthage'; // mercantile archetype
  return fixture;
}

export function fixtureMilitaristic(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  fixture.state.minorCivs[fixture.minorCivId].definitionId = 'sparta'; // militaristic archetype
  return fixture;
}

export function fixturePoorStruggling(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const city = fixture.state.cities[fixture.state.minorCivs[fixture.minorCivId].cityId];
  city.population = 1;
  city.food = 0;
  return fixture;
}

export function fixtureThreatenedNoWar(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const city = fixture.state.cities[fixture.state.minorCivs[fixture.minorCivId].cityId];
  // A barbarian counts as an immediate threat regardless of formal war state
  // (hasImmediateCityThreat), which is exactly "hostile nearby, no war declared".
  const raider = createUnit('warrior', 'barbarian', { q: city.position.q + 1, r: city.position.r }, fixture.state.idCounters);
  raider.id = 'scenario-threat-raider';
  fixture.state.units[raider.id] = raider;
  return fixture;
}

export function fixtureAtWarWithMajor(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const minorCiv = fixture.state.minorCivs[fixture.minorCivId];
  minorCiv.diplomacy.atWarWith = ['player'];
  fixture.state.civilizations.player.diplomacy.atWarWith = [fixture.minorCivId];
  advancePlayerCivToEra(fixture.state, 4);
  fixture.state.era = 4;
  return fixture;
}

export function fixtureCoalitionMember(seed: string): MinorCivFixture {
  const state = createNewGame({
    civType: 'rome', mapSize: 'medium', opponentCount: 1, gameTitle: 'Coalition Fixture', seed,
  });
  const [aId, bId] = Object.keys(state.minorCivs);
  if (!aId || !bId) {
    throw new Error('coalition fixture requires at least two minor civs on a medium map');
  }
  for (const id of [aId, bId]) {
    state.cities[state.minorCivs[id].cityId].population = 4;
    state.minorCivs[id].regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player', pressure: 75, status: 'coalition-talks', lastUpdatedTurn: state.turn, causes: [],
      },
    };
  }
  advancePlayerCivToEra(state, 2);
  state.era = 2;
  return { state, minorCivId: aId };
}

export function fixtureAlliedWithMajor(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const minorCiv = fixture.state.minorCivs[fixture.minorCivId];
  minorCiv.definitionId = 'carthage';
  minorCiv.diplomacy.relationships.player = 65;
  minorCiv.chainStatusByCiv.player = {
    chainId: 'trade-partnership', status: 'allied', statusTurn: fixture.state.turn, earnedTurn: fixture.state.turn,
  };
  return fixture;
}

export function fixtureRecentlyAttacked(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const minorCiv = fixture.state.minorCivs[fixture.minorCivId];
  advancePlayerCivToEra(fixture.state, 3);
  fixture.state.era = 3;
  minorCiv.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 60,
      status: 'mobilizing',
      lastUpdatedTurn: fixture.state.turn,
      lastConquestTurn: fixture.state.turn,
      decayBlockedUntilTurn: fixture.state.turn + 4,
      // No `causes` entry: normalizeGrievance requires a minor-civ-conquest cause's minorCivId to
      // resolve to a real minor civ in state.minorCivs, and fabricating a second one here just to
      // populate this array would be more fragile than useful — decayBlockedUntilTurn and
      // lastConquestTurn alone already express "recently attacked" for this fixture's purpose.
      causes: [],
    },
  };
  return fixture;
}

export function fixtureEarlyGameNearYoungPlayer(seed: string): MinorCivFixture {
  // Deliberately identical to peacefulIsolated: era 1, no tech advancement, no grievance. Kept as
  // its own named fixture because the assertions the long-run test applies to it are about
  // early-game safety specifically (no levy, no free army) rather than general boundedness.
  return firstMinorCiv(createNewGame(undefined, seed, 'small'));
}

export function fixtureLateEra(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  advancePlayerCivToEra(fixture.state, 9);
  fixture.state.era = 9;
  return fixture;
}

export function fixtureCoastal(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const city = fixture.state.cities[fixture.state.minorCivs[fixture.minorCivId].cityId];
  const neighbor = hexNeighbors(city.position).find(coord => fixture.state.map.tiles[hexKey(coord)]);
  if (!neighbor) {
    throw new Error('coastal fixture requires at least one in-bounds neighbor tile');
  }
  const key = hexKey(neighbor);
  fixture.state.map.tiles[key] = { ...fixture.state.map.tiles[key], terrain: 'coast' };
  return fixture;
}

export function fixtureBlockedSpawn(seed: string): MinorCivFixture {
  const fixture = firstMinorCiv(createNewGame(undefined, seed, 'small'));
  const city = fixture.state.cities[fixture.state.minorCivs[fixture.minorCivId].cityId];
  const blockPositions = [city.position, ...hexNeighbors(city.position)];
  for (const [index, coord] of blockPositions.entries()) {
    if (!fixture.state.map.tiles[hexKey(coord)]) continue;
    const blocker = createUnit('warrior', 'barbarian', coord, fixture.state.idCounters);
    blocker.id = `scenario-spawn-blocker-${index}`;
    fixture.state.units[blocker.id] = blocker;
  }
  return fixture;
}

export interface MinorCivEnvelopeSample {
  turn: number;
  destroyed: boolean;
  population: number;
  liveUnitCount: number;
  buildingCount: number;
  productionProgress: number;
  posture: MinorCivPosture;
  policy: MinorCivPolicy;
  pressureEra: number;
  pendingSpawnAttempts: number;
  levyCooldownUntilTurn: number | undefined;
  recovering: boolean;
}

export interface MinorCivScenarioTrace {
  minorCivId: string;
  samples: MinorCivEnvelopeSample[];
  finalState: GameState;
  levyCount: number;
  postureChangeCount: number;
}

function sampleEnvelope(state: GameState, minorCivId: string): MinorCivEnvelopeSample {
  const minorCiv = state.minorCivs[minorCivId];
  const city = state.cities[minorCiv.cityId];
  const economy = minorCiv.economy;
  return {
    turn: state.turn,
    destroyed: minorCiv.isDestroyed,
    population: city?.population ?? 0,
    liveUnitCount: minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length,
    buildingCount: city?.buildings.length ?? 0,
    productionProgress: city?.productionProgress ?? 0,
    posture: economy?.posture ?? 'settled',
    policy: economy?.policy ?? 'balanced',
    pressureEra: city ? (resolveNeutralPressureEra(state, city.position) ?? 1) : 1,
    pendingSpawnAttempts: economy?.pendingUnitSpawn?.attempts ?? 0,
    levyCooldownUntilTurn: economy?.levyCooldownUntilTurn,
    recovering: (economy?.localRecoveryUntilTurn ?? 0) > state.turn,
  };
}

/**
 * Drives `state` through `turns` full turns via the real `processTurn` (turn-manager) path —
 * deliberately not the narrower `processMinorCivEconomyTurn` unit-test entry point — recording an
 * envelope sample after every turn. `onSample` lets a caller inject a mid-run event (e.g. a
 * conquest) keyed off turn number without forking this function.
 */
export function runMinorCivLongRun(
  state: GameState,
  minorCivId: string,
  turns: number,
  bus: EventBus,
  onSample?: (state: GameState, turn: number) => GameState,
): MinorCivScenarioTrace {
  let nextState = state;
  const samples: MinorCivEnvelopeSample[] = [];
  let levyCount = 0;
  let postureChangeCount = 0;
  let lastLevyCooldown: number | undefined;
  let lastPosture: MinorCivPosture | undefined;

  for (let turn = 0; turn < turns; turn++) {
    nextState = processTurn(nextState, bus);
    if (onSample) {
      nextState = onSample(nextState, nextState.turn);
    }
    const sample = sampleEnvelope(nextState, minorCivId);
    if (sample.levyCooldownUntilTurn !== undefined && sample.levyCooldownUntilTurn !== lastLevyCooldown) {
      levyCount++;
    }
    lastLevyCooldown = sample.levyCooldownUntilTurn;
    if (lastPosture !== undefined && sample.posture !== lastPosture) {
      postureChangeCount++;
    }
    lastPosture = sample.posture;
    samples.push(sample);
  }

  return { minorCivId, samples, finalState: nextState, levyCount, postureChangeCount };
}

/** Universal invariants every fixture's trace must satisfy, regardless of scenario. */
export function assertNoRunaway(trace: MinorCivScenarioTrace): void {
  const tuning = MINOR_CIV_ECONOMY_TUNING[resolveOpponentChallenge(trace.finalState)];
  for (const sample of trace.samples) {
    if (sample.destroyed) continue;
    const ceiling = getMinorCivPopulationCeiling(trace.finalState, trace.minorCivId);
    if (sample.population > ceiling) {
      throw new Error(`turn ${sample.turn}: population ${sample.population} exceeded ceiling ${ceiling}`);
    }
    if (sample.population < 0) {
      throw new Error(`turn ${sample.turn}: population went negative (${sample.population})`);
    }
    const cap = getMinorCivUnitCap(trace.finalState, trace.minorCivId, sample.posture);
    if (sample.liveUnitCount > cap) {
      throw new Error(`turn ${sample.turn}: unit count ${sample.liveUnitCount} exceeded live cap ${cap} for posture ${sample.posture}`);
    }
    if (sample.pendingSpawnAttempts > tuning.pendingSpawnMaxAttempts) {
      throw new Error(`turn ${sample.turn}: pending spawn attempts ${sample.pendingSpawnAttempts} exceeded max ${tuning.pendingSpawnMaxAttempts}`);
    }
  }
}
