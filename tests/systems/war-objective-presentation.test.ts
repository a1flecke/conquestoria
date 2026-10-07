import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { declareWarGoal } from '@/systems/war-goal-system';
import { getWarObjectiveOpportunities, WAR_OBJECTIVE_PRIORITY } from '@/systems/war-objective-presentation';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { expectViewerSafety } from '../helpers/viewer-safety';
import { makeWarGoalFixture } from './helpers/war-goal-fixture';

function fixture(): GameState {
  return makeWarGoalFixture(new EventBus());
}

function withGoal(state: GameState, kind: 'conquer_city' | 'liberate_city' | 'force_vassalage', targetCityId?: string): GameState {
  return declareWarGoal(state, 'attacker', 'defender', kind, targetCityId, state.turn);
}

function defenderCity(state: GameState, index = 0): string {
  return state.civilizations['defender'].cities[index];
}

function transferCity(state: GameState, cityId: string, owner: string): GameState {
  const previous = state.cities[cityId].owner;
  return {
    ...state,
    cities: { ...state.cities, [cityId]: { ...state.cities[cityId], owner } },
    civilizations: {
      ...state.civilizations,
      [previous]: { ...state.civilizations[previous], cities: state.civilizations[previous].cities.filter(id => id !== cityId) },
      [owner]: { ...state.civilizations[owner], cities: [...state.civilizations[owner].cities, cityId] },
    },
  };
}

describe('war objective opportunities (#1372)', () => {
  it('reports nothing when the viewer is not at war', () => {
    const state = fixture();
    expect(getWarObjectiveOpportunities(state, 'bystander')).toEqual([]);
  });

  it('reports a war with no declared goal as a gap, without inventing a target', () => {
    const [opp, ...rest] = getWarObjectiveOpportunities(fixture(), 'attacker');
    expect(rest).toEqual([]);
    expect(opp.stage).toBe('no-goal');
    expect(opp.title).toBe('Give the war against Egypt a purpose');
    expect(opp.destination).toEqual({ kind: 'open-diplomacy' });
    expect(opp.id).toBe('war-objective-defender');
    expect(`${opp.title} ${opp.why}`).not.toContain(state0CityName());
  });

  it('reminds the viewer of an active conquer-city goal using the canonical label', () => {
    const state = fixture();
    const next = withGoal(state, 'conquer_city', defenderCity(state));
    const [opp] = getWarObjectiveOpportunities(next, 'attacker');
    expect(opp.stage).toBe('active');
    expect(opp.title).toBe(`Conquer ${state.cities[defenderCity(state)].name} — Active`);
    expect(opp.priority).toBe(WAR_OBJECTIVE_PRIORITY.active);
  });

  it('reports an active liberate-city goal', () => {
    const state = fixture();
    const next = withGoal(state, 'liberate_city', defenderCity(state));
    const [opp] = getWarObjectiveOpportunities(next, 'attacker');
    expect(opp.stage).toBe('active');
    expect(opp.title).toContain('Liberate');
  });

  it('reports an active force-vassalage goal', () => {
    const next = withGoal(fixture(), 'force_vassalage');
    const [opp] = getWarObjectiveOpportunities(next, 'attacker');
    expect(opp.stage).toBe('active');
    expect(opp.title).toBe('Force Vassalage — Active');
  });

  it('flags a satisfied goal as worth negotiating, never as guaranteed acceptance', () => {
    const state = fixture();
    const target = defenderCity(state);
    const next = transferCity(withGoal(state, 'conquer_city', target), target, 'attacker');
    const [opp] = getWarObjectiveOpportunities(next, 'attacker');
    expect(opp.stage).toBe('satisfied');
    expect(opp.priority).toBeGreaterThan(WAR_OBJECTIVE_PRIORITY.active);
    expect(opp.why).toContain('worth considering');
    expect(opp.why.toLowerCase()).not.toMatch(/will accept|surrender|ready to/);
    expect(opp.destination).toEqual({ kind: 'open-diplomacy' });
  });

  it('flags an exceeded goal', () => {
    const state = fixture();
    const target = defenderCity(state);
    let next = withGoal(state, 'conquer_city', target);
    next = transferCity(next, target, 'attacker');
    const goal = next.civilizations['attacker'].diplomacy.warGoals!['defender'];
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        attacker: {
          ...next.civilizations['attacker'],
          diplomacy: { ...next.civilizations['attacker'].diplomacy, warGoals: { defender: { ...goal, citiesCapturedFromOpponent: 2 } } },
        },
      },
    };
    const [opp] = getWarObjectiveOpportunities(next, 'attacker');
    expect(opp.stage).toBe('exceeded');
    expect(opp.priority).toBe(WAR_OBJECTIVE_PRIORITY.exceeded);
  });

  it('flags an abandoned goal when its target city is gone', () => {
    const state = fixture();
    const target = defenderCity(state);
    const withTarget = withGoal(state, 'conquer_city', target);
    const { [target]: _gone, ...remaining } = withTarget.cities;
    const [opp] = getWarObjectiveOpportunities({ ...withTarget, cities: remaining }, 'attacker');
    expect(opp.stage).toBe('abandoned');
    expect(opp.why).toContain('Review the war in Diplomacy');
  });

  it('does not advise a settlement while a war-resolution request is already pending', () => {
    const state = fixture();
    const target = defenderCity(state);
    const satisfied = transferCity(withGoal(state, 'conquer_city', target), target, 'attacker');
    for (const type of ['peace', 'settlement'] as const) {
      const pending: GameState = {
        ...satisfied,
        pendingDiplomacyRequests: [{ id: `r-${type}`, type, fromCivId: 'defender', toCivId: 'attacker', turnIssued: satisfied.turn }],
      };
      expect(getWarObjectiveOpportunities(pending, 'attacker')).toEqual([]);
    }
  });

  it('keeps advising a no-goal war while a request is pending (the advice is not a settlement)', () => {
    const state = fixture();
    const pending: GameState = {
      ...state,
      pendingDiplomacyRequests: [{ id: 'r', type: 'peace', fromCivId: 'defender', toCivId: 'attacker', turnIssued: state.turn }],
    };
    expect(getWarObjectiveOpportunities(pending, 'attacker')[0]?.stage).toBe('no-goal');
  });

  it('orders several wars by priority, then civ id, deterministically', () => {
    let state = fixture();
    state = declareMajorWar(state, 'attacker', 'bystander', new EventBus());
    const target = defenderCity(state);
    state = transferCity(withGoal(state, 'conquer_city', target), target, 'attacker');
    const first = getWarObjectiveOpportunities(state, 'attacker');
    expect(first.map(o => [o.opponentCivId, o.stage])).toEqual([['defender', 'satisfied'], ['bystander', 'no-goal']]);
    expect(getWarObjectiveOpportunities(state, 'attacker')).toEqual(first);
  });

  it('skips an eliminated opponent', () => {
    const state = fixture();
    const dead: GameState = {
      ...state,
      civilizations: { ...state.civilizations, defender: { ...state.civilizations['defender'], isEliminated: true } },
    };
    expect(getWarObjectiveOpportunities(dead, 'attacker')).toEqual([]);
  });

  it('follows canonical goal legality: a vassal can still declare conquer goals, so the gap is real', () => {
    const state = fixture();
    const vassal: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        attacker: {
          ...state.civilizations['attacker'],
          diplomacy: { ...state.civilizations['attacker'].diplomacy, vassalage: { ...state.civilizations['attacker'].diplomacy.vassalage, overlord: 'bystander' } },
        },
      },
    };
    expect(getWarObjectiveOpportunities(vassal, 'attacker')[0]?.stage).toBe('no-goal');
  });

  it('offers no goal-less advice when no goal kind is legal (opponent owns no city and already has an overlord)', () => {
    const state = fixture();
    const cityless: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        defender: {
          ...state.civilizations['defender'],
          cities: [],
          diplomacy: { ...state.civilizations['defender'].diplomacy, vassalage: { ...state.civilizations['defender'].diplomacy.vassalage, overlord: 'bystander' } },
        },
      },
    };
    expect(getWarObjectiveOpportunities(cityless, 'attacker')).toEqual([]);
  });

  it('does not mutate the state it reads', () => {
    const state = fixture();
    const before = JSON.stringify(state);
    getWarObjectiveOpportunities(state, 'attacker');
    expect(JSON.stringify(state)).toBe(before);
  });

  describe('viewer safety', () => {
    it('is invariant under hidden enemy military and the enemy\'s private goal, but moves with the viewer\'s own goal', () => {
      const world = withGoal(fixture(), 'force_vassalage');
      expectViewerSafety(
        { name: 'war objective opportunities', project: (state: GameState, viewerId: string) => getWarObjectiveOpportunities(state, viewerId) },
        {
          world,
          viewerId: 'attacker',
          hidden: [
            {
              label: 'enemy fields a much larger army',
              apply: state => {
                const civ = state.civilizations['defender'];
                for (let i = 0; i < 6; i++) {
                  const id = `hidden-unit-${i}`;
                  state.units[id] = { ...state.units[civ.units[0] ?? Object.keys(state.units)[0]], id, owner: 'defender' };
                  civ.units.push(id);
                }
              },
            },
            {
              label: 'enemy declares its own private war goal against the viewer',
              apply: state => {
                state.civilizations['defender'].diplomacy.warGoals = {
                  attacker: { kind: 'force_vassalage', opponentCivId: 'attacker', declaredTurn: 1, citiesCapturedFromOpponent: 0, overreachPenaltyApplied: false },
                };
              },
            },
          ],
          earned: [
            {
              label: 'viewer takes the opponent city it declared as its goal',
              apply: state => { state.civilizations['defender'].diplomacy.vassalage.overlord = 'attacker'; },
            },
          ],
        },
      );
    });
  });
});

function state0CityName(): string {
  const state = fixture();
  return state.cities[state.civilizations['defender'].cities[0]].name;
}
