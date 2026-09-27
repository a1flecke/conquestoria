import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  canDeclareWarGoal,
  declareWarGoal,
  getWarGoalStatus,
  recordWarGoalCityCapture,
  applyWarGoalOverreachIfNeeded,
} from '@/systems/war-goal-system';
import { makeMajorPeace } from '@/systems/diplomacy-system';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { foundCity } from '@/systems/city-system';
import { makeWarGoalFixture } from './helpers/war-goal-fixture';

describe('war goal system (#988)', () => {
  describe('canDeclareWarGoal / declareWarGoal', () => {
    it('allows conquer_city against a city the opponent actually owns', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      const result = canDeclareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId);
      expect(result.ok).toBe(true);
    });

    it('refuses conquer_city against a city the opponent does not own', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const notOpponentCity = state.civilizations['bystander'].cities[0];
      const result = canDeclareWarGoal(state, 'attacker', 'defender', 'conquer_city', notOpponentCity);
      expect(result.ok).toBe(false);
    });

    it('refuses any goal when the two civs are not at war', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const result = canDeclareWarGoal(state, 'attacker', 'bystander', 'force_vassalage');
      expect(result.ok).toBe(false);
    });

    it('refuses force_vassalage when the opponent is already someone else\'s vassal', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          defender: {
            ...state.civilizations['defender'],
            diplomacy: {
              ...state.civilizations['defender'].diplomacy,
              vassalage: { ...state.civilizations['defender'].diplomacy.vassalage, overlord: 'bystander' },
            },
          },
        },
      };
      const result = canDeclareWarGoal(state, 'attacker', 'defender', 'force_vassalage');
      expect(result.ok).toBe(false);
    });

    it('declareWarGoal is a no-op when illegal', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const notOpponentCity = state.civilizations['bystander'].cities[0];
      const next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', notOpponentCity, state.turn);
      expect(next).toBe(state);
    });

    it('declareWarGoal sets the goal only on the declaring civ\'s own diplomacy state', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      const next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      const goal = next.civilizations['attacker'].diplomacy.warGoals?.['defender'];
      expect(goal).toMatchObject({ kind: 'conquer_city', opponentCivId: 'defender', targetCityId, citiesCapturedFromOpponent: 0, overreachPenaltyApplied: false });
      expect(next.civilizations['defender'].diplomacy.warGoals?.['attacker']).toBeUndefined();
    });

    it('declaring a fresh goal against the same still-at-war opponent changes the kind but carries the capture counter forward (no overreach-laundering exploit)', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = declareWarGoal(next, 'attacker', 'defender', 'force_vassalage', undefined, next.turn);
      const goal = next.civilizations['attacker'].diplomacy.warGoals?.['defender'];
      expect(goal?.kind).toBe('force_vassalage');
      expect(goal?.citiesCapturedFromOpponent).toBe(1);
    });

    it('carries the overreach-penalty-applied guard forward across redeclaration too', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = { ...next, cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'attacker' } } };
      next = applyWarGoalOverreachIfNeeded(next, 'attacker', 'defender', next.turn, bus);
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.overreachPenaltyApplied).toBe(true);
      const beforeRedeclareTreachery = next.civilizations['attacker'].diplomacy.treacheryScore;

      next = declareWarGoal(next, 'attacker', 'defender', 'force_vassalage', undefined, next.turn);
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.overreachPenaltyApplied).toBe(true);
      next = applyWarGoalOverreachIfNeeded(next, 'attacker', 'defender', next.turn, bus);
      expect(next.civilizations['attacker'].diplomacy.treacheryScore).toBe(beforeRedeclareTreachery);
    });
  });

  describe('getWarGoalStatus', () => {
    it('is none when no goal has been declared', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      expect(getWarGoalStatus(state, 'attacker', 'defender')).toBe('none');
    });

    it('is active while the target city is still enemy-owned', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      const next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('active');
    });

    it('is satisfied once the declaring civ owns the target city', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = {
        ...next,
        cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'attacker' } },
      };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('satisfied');
    });

    it('is abandoned when the target city no longer exists', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      const { [targetCityId]: _removed, ...remainingCities } = next.cities;
      next = { ...next, cities: remainingCities };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('abandoned');
    });

    it('liberate_city is satisfied once the city leaves the opponent\'s ownership (not necessarily to the declarer)', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'liberate_city', targetCityId, state.turn);
      next = {
        ...next,
        cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'bystander' } },
      };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('satisfied');
    });

    it('force_vassalage is satisfied once the opponent becomes the declarer\'s vassal', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      let next = declareWarGoal(state, 'attacker', 'defender', 'force_vassalage', undefined, state.turn);
      next = {
        ...next,
        civilizations: {
          ...next.civilizations,
          defender: {
            ...next.civilizations['defender'],
            diplomacy: {
              ...next.civilizations['defender'].diplomacy,
              vassalage: { ...next.civilizations['defender'].diplomacy.vassalage, overlord: 'attacker' },
            },
          },
        },
      };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('satisfied');
    });

    it('is exceeded once a conquer_city goal is satisfied and a second enemy city was also taken', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender'); // the declared target
      next = recordWarGoalCityCapture(next, 'attacker', 'defender'); // an extra city
      next = {
        ...next,
        cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'attacker' } },
      };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('exceeded');
    });

    it('force_vassalage is exceeded if any enemy city was taken at all', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      let next = declareWarGoal(state, 'attacker', 'defender', 'force_vassalage', undefined, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = {
        ...next,
        civilizations: {
          ...next.civilizations,
          defender: {
            ...next.civilizations['defender'],
            diplomacy: {
              ...next.civilizations['defender'].diplomacy,
              vassalage: { ...next.civilizations['defender'].diplomacy.vassalage, overlord: 'attacker' },
            },
          },
        },
      };
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('exceeded');
    });
  });

  describe('recordWarGoalCityCapture', () => {
    it('increments only the capturing civ\'s own goal against that specific opponent', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.citiesCapturedFromOpponent).toBe(1);
    });

    it('is a no-op when the capturing civ has no active goal against that opponent', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const next = recordWarGoalCityCapture(state, 'attacker', 'defender');
      expect(next).toBe(state);
    });
  });

  describe('applyWarGoalOverreachIfNeeded', () => {
    it('applies a bounded, one-time treachery/relationship penalty once the goal is exceeded', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = {
        ...next,
        cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'attacker' } },
      };
      const beforeTreachery = next.civilizations['attacker'].diplomacy.treacheryScore;
      next = applyWarGoalOverreachIfNeeded(next, 'attacker', 'defender', next.turn, bus);
      expect(next.civilizations['attacker'].diplomacy.treacheryScore).toBeGreaterThan(beforeTreachery);
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.overreachPenaltyApplied).toBe(true);

      const beforeSecondApplication = next.civilizations['attacker'].diplomacy.treacheryScore;
      next = applyWarGoalOverreachIfNeeded(next, 'attacker', 'defender', next.turn, bus);
      expect(next.civilizations['attacker'].diplomacy.treacheryScore).toBe(beforeSecondApplication);
    });

    it('is a no-op while the goal is merely satisfied, not exceeded', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = recordWarGoalCityCapture(next, 'attacker', 'defender');
      next = {
        ...next,
        cities: { ...next.cities, [targetCityId]: { ...next.cities[targetCityId], owner: 'attacker' } },
      };
      const result = applyWarGoalOverreachIfNeeded(next, 'attacker', 'defender', next.turn, bus);
      expect(result).toBe(next);
    });
  });

  describe('end-to-end wiring: resolveMajorCityCapture drives war-goal bookkeeping (#988)', () => {
    it('an ordinary combat capture increments the counter and satisfies a matching goal', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      const result = resolveMajorCityCapture(next, targetCityId, 'attacker', 'occupy', next.turn, bus);
      next = result.state;
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.citiesCapturedFromOpponent).toBe(1);
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('satisfied');
    });

    it('capturing a second, non-target city flips the goal to exceeded and charges reputation, through the real capture path', () => {
      const bus = new EventBus();
      let state = makeWarGoalFixture(bus);
      // A third city so 'defender' survives both captures below -- otherwise
      // this capture is a total conquest and elimination-teardown (correctly)
      // clears the war goal before this test ever gets to inspect it.
      const thirdCity = foundCity(
        'defender',
        { q: state.cities[state.civilizations['defender'].cities[0]].position.q - 6, r: state.cities[state.civilizations['defender'].cities[0]].position.r - 6 },
        state.map,
        state.idCounters,
      );
      state = { ...state, cities: { ...state.cities, [thirdCity.id]: thirdCity } };
      state.civilizations['defender'].cities.push(thirdCity.id);

      const targetCityId = state.civilizations['defender'].cities[0];
      const secondCityId = state.civilizations['defender'].cities[1];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = resolveMajorCityCapture(next, secondCityId, 'attacker', 'occupy', next.turn, bus).state;
      next = resolveMajorCityCapture(next, targetCityId, 'attacker', 'occupy', next.turn, bus).state;
      expect(getWarGoalStatus(next, 'attacker', 'defender')).toBe('exceeded');
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.overreachPenaltyApplied).toBe(true);
      expect(next.civilizations['attacker'].diplomacy.treacheryScore).toBeGreaterThan(0);
    });

    it('a razed city also counts toward the capturing civ\'s war-goal bookkeeping', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      const secondCityId = state.civilizations['defender'].cities[1];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = resolveMajorCityCapture(next, secondCityId, 'attacker', 'raze', next.turn, bus).state;
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']?.citiesCapturedFromOpponent).toBe(1);
    });

    it('a capture by a civ with no declared goal against the defeated civ leaves no war-goal record', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      const next = resolveMajorCityCapture(state, targetCityId, 'attacker', 'occupy', state.turn, bus).state;
      expect(next.civilizations['attacker'].diplomacy.warGoals).toBeUndefined();
    });
  });

  describe('makeMajorPeace clears both sides\' war goals against each other (#988)', () => {
    it('removes the goal so a new war starts clean', () => {
      const bus = new EventBus();
      const state = makeWarGoalFixture(bus);
      const targetCityId = state.civilizations['defender'].cities[0];
      let next = declareWarGoal(state, 'attacker', 'defender', 'conquer_city', targetCityId, state.turn);
      next = makeMajorPeace(next, 'attacker', 'defender', bus);
      expect(next.civilizations['attacker'].diplomacy.warGoals?.['defender']).toBeUndefined();
    });
  });
});
