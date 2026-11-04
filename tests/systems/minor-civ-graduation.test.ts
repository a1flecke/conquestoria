import { describe, expect, it } from 'vitest';
import type { GameState, MinorCivLeagueReadiness, OpponentChallenge } from '@/core/types';
import { createUnit } from '@/systems/unit-lifecycle';
import { createDefaultMinorCivEconomyState, getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { MINOR_CIV_GRADUATION_TUNING } from '@/systems/minor-civ-graduation-rules';
import {
  evaluateMinorCivGraduationEligibility,
  getGraduationProbability,
  scoreGraduationSignals,
} from '@/systems/minor-civ-graduation';
import type { MinorCivGraduationSignals } from '@/systems/minor-civ-graduation-rules';
import { fixturePeacefulIsolated } from './helpers/minor-civ-scenario-fixtures';

const BUILDING_IDS = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'];

/** A peaceful city-state that clears every gate at exactly the difficulty's minimum. */
function eligibleFixture(challenge: OpponentChallenge = 'standard') {
  const { state, minorCivId } = fixturePeacefulIsolated('graduation-eligible');
  state.opponentChallenge = challenge;
  state.turn = 400;
  const tuning = MINOR_CIV_GRADUATION_TUNING[challenge];
  const minorCiv = state.minorCivs[minorCivId]!;
  minorCiv.foundedTurn = state.turn - tuning.minAgeTurns;
  const city = state.cities[minorCiv.cityId]!;
  city.population = getMinorCivPopulationCeiling(state, minorCivId) - tuning.populationHeadroom;
  city.buildings = BUILDING_IDS.slice(0, tuning.minBuildings);
  return { state, minorCivId, minorCiv, city, tuning };
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
      minorCiv.foundedTurn = state.turn - 150;

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
