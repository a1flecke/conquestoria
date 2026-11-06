import { describe, expect, it } from 'vitest';
import type { GameState, MinorCivLeagueReadiness, OpponentChallenge } from '@/core/types';
import { createUnit } from '@/systems/unit-lifecycle';
import { createDefaultMinorCivEconomyState, getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { MINOR_CIV_GRADUATION_TUNING } from '@/systems/minor-civ-graduation-rules';
import {
  evaluateMinorCivGraduationEligibility,
  getGraduationProbability,
  planMinorCivGraduations,
  scoreGraduationSignals,
  selectGraduationCandidate,
  type MinorCivGraduationRoll,
} from '@/systems/minor-civ-graduation';
import {
  GRADUATION_CADENCE_TURNS,
  GRADUATION_MAX_LIVING_MAJORS,
  type MinorCivGraduationSignals,
} from '@/systems/minor-civ-graduation-rules';
import { createSimulationRng } from '@/systems/simulation-rng';
import { resolveWorldAge } from '@/systems/tech-definitions';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { advancePlayerCivToEra, fixturePeacefulIsolated } from './helpers/minor-civ-scenario-fixtures';

const BUILDING_IDS = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'];

interface FixtureOptions {
  /** Raise every starting major to this personal era before the city-state is sized. */
  era?: number;
  /** Living majors to add beyond the two every new game starts with. */
  extraMajors?: number;
}

/** Give each of `count` new majors the tech of `ai-1` and a city far from every city-state. */
function addLivingMajors(state: GameState, count: number): void {
  const template = state.civilizations['ai-1']!;
  const cityTemplate = Object.values(state.cities)[0]!;
  for (let index = 0; index < count; index += 1) {
    const id = `ai-${index + 2}`;
    const cityId = `city-${id}`;
    state.cities[cityId] = {
      ...structuredClone(cityTemplate), id: cityId, owner: id, buildings: [],
      position: { q: 200 + index, r: 200 },
    };
    state.civilizations[id] = { ...structuredClone(template), id, name: id, cities: [cityId], units: [] };
  }
}

/** A peaceful city-state that clears every gate at exactly the difficulty's minimum. */
function eligibleFixture(challenge: OpponentChallenge = 'standard', options: FixtureOptions = {}) {
  const { state, minorCivId } = fixturePeacefulIsolated('graduation-eligible');
  state.opponentChallenge = challenge;
  state.turn = 400;
  if (options.era !== undefined) {
    advancePlayerCivToEra(state, options.era);
    state.civilizations['ai-1']!.techState.completed = [...state.civilizations.player.techState.completed];
  }
  addLivingMajors(state, options.extraMajors ?? 0);
  const tuning = MINOR_CIV_GRADUATION_TUNING[challenge];
  const minorCiv = state.minorCivs[minorCivId]!;
  minorCiv.foundedTurn = state.turn - tuning.minAgeTurns;
  const city = state.cities[minorCiv.cityId]!;
  city.population = getMinorCivPopulationCeiling(state, minorCivId) - tuning.populationHeadroom;
  city.buildings = BUILDING_IDS.slice(0, tuning.minBuildings);
  return { state, minorCivId, minorCiv, city, tuning };
}

/** A world a graduation can happen in: old enough, three living majors, one ripe city-state. */
function plannerFixture(challenge: OpponentChallenge = 'standard') {
  const era = MINOR_CIV_GRADUATION_TUNING[challenge].minWorldAge;
  return eligibleFixture(challenge, { era, extraMajors: 1 });
}

function reasonOf(state: GameState, minorCivId: string): string | null {
  const result = evaluateMinorCivGraduationEligibility(state, minorCivId);
  return result.eligible ? null : result.reason;
}

describe('evaluateMinorCivGraduationEligibility (#497)', () => {
  it('accepts a strong candidate and reports the recorded signals it was judged on', () => {
    const { state, minorCivId, city, tuning } = eligibleFixture();

    const result = evaluateMinorCivGraduationEligibility(state, minorCivId);

    expect(result).toEqual({
      eligible: true,
      minorCivId,
      signals: {
        ageTurns: tuning.minAgeTurns,
        population: city.population,
        populationCeiling: getMinorCivPopulationCeiling(state, minorCivId),
        buildingCount: tuning.minBuildings,
        tradePartnerCount: 0,
        alliedPatronCount: 0,
        leagueMember: false,
      },
    });
  });

  describe('maturity', () => {
    it('is too young one turn short of the minimum age and eligible at exactly the minimum', () => {
      const { state, minorCivId, minorCiv, tuning } = eligibleFixture();
      expect(reasonOf(state, minorCivId)).toBeNull();

      minorCiv.foundedTurn = state.turn - (tuning.minAgeTurns - 1);

      expect(reasonOf(state, minorCivId)).toBe('too-young');
    });

    it('is below the population threshold one short of ceiling minus headroom', () => {
      const { state, minorCivId, city } = eligibleFixture();
      city.population -= 1;

      expect(reasonOf(state, minorCivId)).toBe('population-below-threshold');
    });

    it('needs the difficulty’s minimum number of buildings', () => {
      const { state, minorCivId, city } = eligibleFixture();
      city.buildings = city.buildings.slice(0, -1);

      expect(reasonOf(state, minorCivId)).toBe('too-few-buildings');
    });
  });

  describe('difficulty', () => {
    it('delays the same city-state on Explorer that Veteran already accepts', () => {
      const { state, minorCivId, minorCiv, city } = eligibleFixture('veteran');
      // Strong enough for any tier on every axis except age.
      city.population = getMinorCivPopulationCeiling(state, minorCivId);
      city.buildings = BUILDING_IDS.slice(0, MINOR_CIV_GRADUATION_TUNING.explorer.minBuildings);
      // Exactly Veteran's minimum age, one short of Explorer's.
      minorCiv.foundedTurn = state.turn - MINOR_CIV_GRADUATION_TUNING.veteran.minAgeTurns;
      expect(MINOR_CIV_GRADUATION_TUNING.veteran.minAgeTurns).toBeLessThan(MINOR_CIV_GRADUATION_TUNING.explorer.minAgeTurns);

      state.opponentChallenge = 'veteran';
      expect(reasonOf(state, minorCivId)).toBeNull();
      state.opponentChallenge = 'explorer';
      expect(reasonOf(state, minorCivId)).toBe('too-young');
    });

    it('never makes a gate looser than its tier’s own minimums', () => {
      for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
        const { state, minorCivId, minorCiv, tuning } = eligibleFixture(challenge);
        expect(reasonOf(state, minorCivId)).toBeNull();
        minorCiv.foundedTurn = state.turn - (tuning.minAgeTurns - 1);
        expect(reasonOf(state, minorCivId)).toBe('too-young');
      }
    });

    it('treats an unrecognised difficulty as Standard', () => {
      const { state, minorCivId } = eligibleFixture('standard');
      (state as { opponentChallenge?: unknown }).opponentChallenge = 'impossible';

      expect(reasonOf(state, minorCivId)).toBeNull();
    });
  });

  describe('security', () => {
    it('is not a candidate while at war', () => {
      const { state, minorCivId, minorCiv } = eligibleFixture();
      minorCiv.diplomacy.atWarWith = ['player'];

      expect(reasonOf(state, minorCivId)).toBe('at-war');
    });

    it('is not a candidate with a hostile unit at its gates', () => {
      const { state, minorCivId, city } = eligibleFixture();
      const raider = createUnit('warrior', 'barbarian', { q: city.position.q + 1, r: city.position.r }, state.idCounters);
      state.units[raider.id] = raider;

      expect(reasonOf(state, minorCivId)).toBe('under-threat');
    });

    it('is not a candidate while recovering from an emergency levy', () => {
      const { state, minorCivId, minorCiv } = eligibleFixture();
      minorCiv.economy = { ...createDefaultMinorCivEconomyState(state), localRecoveryUntilTurn: state.turn + 3 };

      expect(reasonOf(state, minorCivId)).toBe('under-threat');
    });

    it('names a forming or active coalition before the generic threat it causes', () => {
      for (const status of ['forming', 'active'] as const) {
        const { state, minorCivId } = eligibleFixture();
        state.minorCivCoalitions = {
          c1: {
            id: 'c1', targetCivId: 'player', memberIds: [minorCivId, 'mc-other'], status,
            createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0,
          },
        };
        expect(reasonOf(state, minorCivId)).toBe('coalition-member');
      }
    });

    it('ignores a coalition that is only cooling, and one it does not belong to', () => {
      const { state, minorCivId } = eligibleFixture();
      state.minorCivCoalitions = {
        cooling: {
          id: 'cooling', targetCivId: 'player', memberIds: [minorCivId, 'mc-other'], status: 'cooling',
          createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0,
        },
        elsewhere: {
          id: 'elsewhere', targetCivId: 'player', memberIds: ['mc-a', 'mc-b'], status: 'active',
          createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0,
        },
      };

      expect(reasonOf(state, minorCivId)).toBeNull();
    });
  });

  describe('regional league', () => {
    function withLeague(state: GameState, minorCivId: string, readiness: MinorCivLeagueReadiness): void {
      state.minorCivLeagues = {
        leagues: {
          l1: {
            id: 'l1', nameKey: 'league', charter: 'commerce', memberIds: [minorCivId, 'mc-other'],
            formedTurn: 1, readiness,
          },
        },
        nextId: 2, nextCheckTurn: 0, lastProcessedTurn: 0, eligibleAfterTurnByMinorCiv: {},
      };
    }

    it('counts a quiet compact as a signal without blocking', () => {
      const { state, minorCivId } = eligibleFixture();
      withLeague(state, minorCivId, { kind: 'quiet' });

      const result = evaluateMinorCivGraduationEligibility(state, minorCivId);

      expect(result.eligible && result.signals.leagueMember).toBe(true);
    });

    it('is not a candidate while its compact is preparing for a threat', () => {
      const { state, minorCivId } = eligibleFixture();
      withLeague(state, minorCivId, { kind: 'concern', sinceTurn: state.turn - 2 });

      expect(reasonOf(state, minorCivId)).toBe('league-mobilized');
    });
  });

  describe('recorded relationships', () => {
    it('reports allied patrons and distinct trade partners as raw counts', () => {
      const { state, minorCivId, minorCiv } = eligibleFixture();
      minorCiv.chainStatusByCiv.player = { chainId: 'trade-partnership', status: 'allied', statusTurn: 1, earnedTurn: 1 };
      // Major civilizations start with settlers, not cities, so give each a city to trade from.
      const addMajorCity = (owner: string, id: string): string => {
        state.cities[id] = { ...structuredClone(minorCivCity), id, owner };
        state.civilizations[owner]!.cities.push(id);
        return id;
      };
      const minorCivCity = state.cities[minorCiv.cityId]!;
      const playerCityId = addMajorCity('player', 'city-player-1');
      const aiCityId = addMajorCity('ai-1', 'city-ai-1');
      const route = (id: string, fromCityId: string, toCityId: string) => ({
        id, fromCityId, toCityId, goldPerTrip: 1, turnsPerTrip: 1,
      });
      state.marketplace!.tradeRoutes = [
        route('r1', playerCityId, minorCiv.cityId),
        route('r2', minorCiv.cityId, playerCityId), // same partner again: counted once
        route('r3', minorCiv.cityId, aiCityId),
        route('r4', playerCityId, aiCityId), // does not touch the city-state
      ];

      const result = evaluateMinorCivGraduationEligibility(state, minorCivId);

      expect(result.eligible && result.signals.alliedPatronCount).toBe(1);
      expect(result.eligible && result.signals.tradePartnerCount).toBe(2);
    });
  });

  describe('malformed or missing source state', () => {
    it('reports an unknown id, a destroyed city-state, and an unknown definition', () => {
      const { state, minorCivId, minorCiv } = eligibleFixture();
      expect(reasonOf(state, 'mc-nowhere')).toBe('missing-minor-civ');

      minorCiv.definitionId = 'not-a-definition';
      expect(reasonOf(state, minorCivId)).toBe('unknown-definition');

      const destroyed = eligibleFixture();
      destroyed.minorCiv.isDestroyed = true;
      expect(reasonOf(destroyed.state, destroyed.minorCivId)).toBe('destroyed');
    });

    it('reports a missing city and a city owned by someone else', () => {
      const missing = eligibleFixture();
      delete missing.state.cities[missing.minorCiv.cityId];
      expect(reasonOf(missing.state, missing.minorCivId)).toBe('city-missing');

      const taken = eligibleFixture();
      taken.city.owner = 'player';
      expect(reasonOf(taken.state, taken.minorCivId)).toBe('city-not-owned');
    });

    it('never treats an absent or corrupt founding turn as old enough', () => {
      for (const corrupt of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 'old', null, 405]) {
        const { state, minorCivId, minorCiv } = eligibleFixture();
        (minorCiv as { foundedTurn?: unknown }).foundedTurn = corrupt;

        expect(reasonOf(state, minorCivId)).toBe('age-unknown');
      }
    });

    it('does not throw on a state with no league, coalition or marketplace records', () => {
      const { state, minorCivId } = eligibleFixture();
      delete state.minorCivLeagues;
      delete state.minorCivCoalitions;
      state.marketplace!.tradeRoutes = [];

      expect(() => evaluateMinorCivGraduationEligibility(state, minorCivId)).not.toThrow();
      expect(reasonOf(state, minorCivId)).toBeNull();
    });
  });

  it('is pure: it neither mutates the state nor changes its answer on a repeat call', () => {
    const { state, minorCivId } = eligibleFixture();
    const before = structuredClone(state);

    const first = evaluateMinorCivGraduationEligibility(state, minorCivId);
    const second = evaluateMinorCivGraduationEligibility(state, minorCivId);

    expect(state).toEqual(before);
    expect(second).toEqual(first);
  });
});

const NO_SIGNALS: MinorCivGraduationSignals = {
  ageTurns: 200, population: 6, populationCeiling: 6, buildingCount: 6,
  tradePartnerCount: 0, alliedPatronCount: 0, leagueMember: false,
};

describe('scoreGraduationSignals (#497)', () => {
  it('scores 0 with no relationships and 1 with every one at its cap', () => {
    expect(scoreGraduationSignals(NO_SIGNALS)).toBe(0);
    expect(scoreGraduationSignals({ ...NO_SIGNALS, tradePartnerCount: 3, alliedPatronCount: 2, leagueMember: true }))
      .toBeCloseTo(1, 10);
  });

  it('weights each recorded fact independently', () => {
    expect(scoreGraduationSignals({ ...NO_SIGNALS, tradePartnerCount: 1 })).toBeCloseTo(0.4 / 3, 10);
    expect(scoreGraduationSignals({ ...NO_SIGNALS, alliedPatronCount: 1 })).toBeCloseTo(0.3 / 2, 10);
    expect(scoreGraduationSignals({ ...NO_SIGNALS, leagueMember: true })).toBeCloseTo(0.3, 10);
  });

  it('counts nothing beyond a fact’s cap', () => {
    expect(scoreGraduationSignals({ ...NO_SIGNALS, tradePartnerCount: 5 }))
      .toBe(scoreGraduationSignals({ ...NO_SIGNALS, tradePartnerCount: 3 }));
    expect(scoreGraduationSignals({ ...NO_SIGNALS, alliedPatronCount: 9 }))
      .toBe(scoreGraduationSignals({ ...NO_SIGNALS, alliedPatronCount: 2 }));
  });

  it('stays inside 0..1 even for impossible counts', () => {
    const score = scoreGraduationSignals({ ...NO_SIGNALS, tradePartnerCount: -4, alliedPatronCount: Number.NaN });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('getGraduationProbability (#497)', () => {
  it('runs from the difficulty’s base probability at score 0 to its maximum at score 1', () => {
    for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
      const { baseProbability, maxProbability } = MINOR_CIV_GRADUATION_TUNING[challenge];
      const { state } = eligibleFixture(challenge);
      expect(getGraduationProbability(state, 0)).toBeCloseTo(baseProbability, 10);
      expect(getGraduationProbability(state, 1)).toBeCloseTo(maxProbability, 10);
      expect(getGraduationProbability(state, 0.5)).toBeCloseTo((baseProbability + maxProbability) / 2, 10);
    }
  });

  it('never leaves its tier’s range, whatever score it is given', () => {
    const { state } = eligibleFixture('standard');
    const { baseProbability, maxProbability } = MINOR_CIV_GRADUATION_TUNING.standard;
    for (const score of [-5, Number.NaN, 2, Number.POSITIVE_INFINITY]) {
      const probability = getGraduationProbability(state, score);
      expect(probability).toBeGreaterThanOrEqual(baseProbability);
      expect(probability).toBeLessThanOrEqual(maxProbability);
    }
  });

  it('is rarer on Explorer than on Standard than on Veteran at every score', () => {
    const at = (challenge: OpponentChallenge, score: number) =>
      getGraduationProbability(eligibleFixture(challenge).state, score);
    for (const score of [0, 0.5, 1]) {
      expect(at('explorer', score)).toBeLessThan(at('standard', score));
      expect(at('standard', score)).toBeLessThan(at('veteran', score));
    }
  });
});

describe('selectGraduationCandidate (#497)', () => {
  const roll = (minorCivId: string, score: number, succeeded: boolean): MinorCivGraduationRoll =>
    ({ minorCivId, score, probability: 0.1, roll: succeeded ? 0.01 : 0.99, succeeded });

  it('chooses nobody when no roll succeeded', () => {
    expect(selectGraduationCandidate([])).toBeNull();
    expect(selectGraduationCandidate([roll('mc-a', 1, false), roll('mc-b', 0, false)])).toBeNull();
  });

  it('chooses the highest score among the successes, ignoring a stronger failure', () => {
    expect(selectGraduationCandidate([roll('mc-a', 0.2, true), roll('mc-b', 0.9, true), roll('mc-c', 1, false)]))
      .toBe('mc-b');
  });

  it('breaks a tie on score by the lowest id, whatever order the rolls arrive in', () => {
    const rolls = [roll('mc-z', 0.5, true), roll('mc-a', 0.5, true), roll('mc-m', 0.5, true)];
    expect(selectGraduationCandidate(rolls)).toBe('mc-a');
    expect(selectGraduationCandidate([...rolls].reverse())).toBe('mc-a');
  });
});

describe('planMinorCivGraduations (#497)', () => {
  it('has a ripe city-state and a world that allows it, so the cases below isolate one gate each', () => {
    const { state, minorCivId, tuning } = plannerFixture();
    expect(resolveWorldAge(state)).toBeGreaterThanOrEqual(tuning.minWorldAge);
    expect(state.turn % GRADUATION_CADENCE_TURNS).toBe(0);
    expect(reasonOf(state, minorCivId)).toBeNull();
  });

  describe('cadence', () => {
    it('only evaluates on an exact multiple of the cadence', () => {
      const { state } = plannerFixture();
      const statusAt = (turn: number) => {
        state.turn = turn;
        return planMinorCivGraduations(state);
      };

      expect(statusAt(GRADUATION_CADENCE_TURNS - 1)).toEqual({ status: 'skipped', turn: 49, reason: 'off-cadence' });
      expect(statusAt(GRADUATION_CADENCE_TURNS).status).toBe('evaluated');
      expect(statusAt(GRADUATION_CADENCE_TURNS + 1)).toEqual({ status: 'skipped', turn: 51, reason: 'off-cadence' });
      expect(statusAt(0)).toEqual({ status: 'skipped', turn: 0, reason: 'off-cadence' });
    });
  });

  describe('global gates', () => {
    it('does nothing once the game is over', () => {
      const { state } = plannerFixture();
      state.gameOver = true;

      expect(planMinorCivGraduations(state)).toEqual({ status: 'skipped', turn: 400, reason: 'game-over' });
    });

    it('waits until the world has reached the difficulty’s minimum age', () => {
      const { state, tuning } = plannerFixture();
      const tooYoung = eligibleFixture('standard', { era: tuning.minWorldAge - 1, extraMajors: 1 }).state;

      expect(resolveWorldAge(tooYoung)).toBeLessThan(tuning.minWorldAge);
      expect(planMinorCivGraduations(tooYoung)).toEqual({ status: 'skipped', turn: 400, reason: 'world-too-young' });
      expect(planMinorCivGraduations(state).status).toBe('evaluated');
    });

    it('stops at the living-major cap for the map size and not one civilization sooner', () => {
      for (const mapSize of ['small', 'medium', 'large'] as const) {
        const cap = GRADUATION_MAX_LIVING_MAJORS[mapSize];
        const atCap = eligibleFixture('standard', { era: 4, extraMajors: cap - 2 }).state;
        atCap.settings.mapSize = mapSize;
        const belowCap = eligibleFixture('standard', { era: 4, extraMajors: cap - 3 }).state;
        belowCap.settings.mapSize = mapSize;

        expect(planMinorCivGraduations(atCap)).toEqual({ status: 'skipped', turn: 400, reason: 'living-major-cap' });
        expect(planMinorCivGraduations(belowCap).status).toBe('evaluated');
      }
    });

    it('does not count an eliminated civilization toward the cap', () => {
      const cap = GRADUATION_MAX_LIVING_MAJORS.small;
      const { state } = eligibleFixture('standard', { era: 4, extraMajors: cap - 2 });
      state.settings.mapSize = 'small';
      state.civilizations[`ai-${cap - 1}`]!.isEliminated = true;

      expect(planMinorCivGraduations(state).status).toBe('evaluated');
    });

    it('holds back when one civilization is a single rival away from Domination', () => {
      const { state } = plannerFixture();
      // Three living majors: every contender has two unresolved rivals and has secured none.
      // Eliminating one secures it for both survivors, leaving each exactly one rival short of the win.
      state.civilizations['ai-2']!.isEliminated = true;
      delete state.cities['city-ai-2'];

      expect(planMinorCivGraduations(state)).toEqual({ status: 'skipped', turn: 400, reason: 'domination-imminent' });
    });

    it('does not mistake an ordinary two-civilization game for a near-win', () => {
      // With only two majors each is always exactly one rival from Domination, but has secured none.
      const { state } = eligibleFixture('standard', { era: 4 });
      expect(Object.keys(state.civilizations)).toHaveLength(2);

      expect(planMinorCivGraduations(state).status).toBe('evaluated');
    });

    it('holds back when a rival is a vassal and the contender needs only the last one', () => {
      const { state } = plannerFixture();
      const { player } = state.civilizations;
      const vassal = state.civilizations['ai-2']!;
      player.diplomacy.vassalage.vassals = ['ai-2'];
      vassal.diplomacy.vassalage.overlord = 'player';
      const treaty = (selfId: string, otherId: string) => ({
        type: 'vassalage' as const, civA: selfId, civB: otherId, turnsRemaining: -1,
      });
      player.diplomacy.treaties.push(treaty('player', 'ai-2') as never);
      vassal.diplomacy.treaties.push(treaty('ai-2', 'player') as never);

      expect(planMinorCivGraduations(state)).toEqual({ status: 'skipped', turn: 400, reason: 'domination-imminent' });
    });
  });

  describe('rolls', () => {
    it('evaluates every city-state and rolls only the eligible ones, in id order', () => {
      const { state, minorCivId } = plannerFixture();
      const plan = planMinorCivGraduations(state);
      if (plan.status !== 'evaluated') throw new Error(`expected an evaluated plan, got ${plan.reason}`);

      expect(plan.evaluations.map(entry => entry.minorCivId)).toEqual(Object.keys(state.minorCivs).sort());
      expect(plan.rolls.map(entry => entry.minorCivId)).toEqual([minorCivId]);
      expect(plan.evaluations.filter(entry => entry.eligible).map(entry => entry.minorCivId)).toEqual([minorCivId]);
    });

    it('draws from the candidate’s own keyed stream and compares it with its probability', () => {
      const { state, minorCivId } = plannerFixture();
      const plan = planMinorCivGraduations(state);
      if (plan.status !== 'evaluated') throw new Error('expected an evaluated plan');
      const [entry] = plan.rolls;

      const expected = createSimulationRng(state, { domain: 'minor-civ-graduation', actorId: minorCivId })();
      expect(entry!.roll).toBe(expected);
      expect(entry!.probability).toBeCloseTo(getGraduationProbability(state, entry!.score), 12);
      expect(entry!.succeeded).toBe(entry!.roll < entry!.probability);
    });

    it('both succeeds and fails depending only on the seed, and picks nobody on a failure', () => {
      const { state, minorCivId } = plannerFixture();
      const outcomes = new Map<boolean, string>();
      for (let index = 0; index < 400 && outcomes.size < 2; index += 1) {
        state.gameId = `graduation-seed-${index}`;
        const plan = planMinorCivGraduations(state);
        if (plan.status !== 'evaluated') throw new Error('expected an evaluated plan');
        const succeeded = plan.rolls[0]!.succeeded;
        if (!outcomes.has(succeeded)) outcomes.set(succeeded, state.gameId);
        expect(plan.selectedMinorCivId).toBe(succeeded ? minorCivId : null);
      }

      expect([...outcomes.keys()].sort()).toEqual([false, true]);
    });

    it('draws a different number on a different cadence turn', () => {
      const { state } = plannerFixture();
      const rollAt = (turn: number) => {
        state.turn = turn;
        const plan = planMinorCivGraduations(state);
        if (plan.status !== 'evaluated') throw new Error('expected an evaluated plan');
        return plan.rolls[0]!.roll;
      };

      expect(rollAt(400)).not.toBe(rollAt(450));
    });
  });

  describe('determinism', () => {
    it('returns the same plan for repeated calls and never mutates the state', () => {
      const { state } = plannerFixture();
      const before = structuredClone(state);

      const first = planMinorCivGraduations(state);
      const second = planMinorCivGraduations(state);

      expect(second).toEqual(first);
      expect(state).toEqual(before);
    });

    it('is unmoved by draining any other random stream', () => {
      const { state, minorCivId } = plannerFixture();
      const before = planMinorCivGraduations(state);

      for (const domain of ['combat', 'minor-civ-scuffle-trigger', 'minor-civ-graduation-other']) {
        const rng = createSimulationRng(state, { domain, actorId: minorCivId });
        for (let index = 0; index < 50; index += 1) rng();
      }

      expect(planMinorCivGraduations(state)).toEqual(before);
    });

    it('gives the same plan after a save and reload, so reloading can never reroll', () => {
      for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
        const { state } = plannerFixture(challenge);
        const reloaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)));

        expect(planMinorCivGraduations(reloaded)).toEqual(planMinorCivGraduations(state));
      }
    });
  });

  it('scores each candidate from its own recorded relationships', () => {
    const { state, minorCiv } = plannerFixture();
    minorCiv.chainStatusByCiv.player = { chainId: 'trade-partnership', status: 'allied', statusTurn: 1, earnedTurn: 1 };

    const plan = planMinorCivGraduations(state);
    if (plan.status !== 'evaluated') throw new Error('expected an evaluated plan');

    expect(plan.rolls[0]!.score).toBeCloseTo(0.15, 10);
  });
});
