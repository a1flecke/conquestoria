import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import { declareWarGoal } from '@/systems/war-goal-system';
import { getWarObjectiveOpportunities, WAR_OBJECTIVE_ACTIVE_LIMITED_PRIORITY, WAR_OBJECTIVE_PRIORITY } from '@/systems/war-objective-presentation';
import { createUnit } from '@/systems/unit-lifecycle';
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

// --- #1398: operational readiness enriches the war decision (own forces only, empire-wide, never a comparison) ---

describe('war objective x own-force readiness (#1398)', () => {
  function armyOf(state: GameState, owner: string, count: number, patch: Partial<Unit> = {}): GameState {
    const next: GameState = { ...state, units: { ...state.units } };
    const home = next.cities[next.civilizations[owner].cities[0]];
    for (let i = 0; i < count; i += 1) {
      const unit = { ...createUnit('warrior', owner, { q: home.position.q + 1, r: home.position.r + i }, next.idCounters), ...patch };
      next.units[unit.id] = unit;
    }
    return next;
  }

  function activeWar(): GameState {
    const state = fixture();
    // Start from a known, healthy 6-unit force so thresholds are exact.
    const clean: GameState = { ...state, units: Object.fromEntries(Object.entries(state.units).filter(([, u]) => u.owner !== 'attacker')) };
    return withGoal(armyOf(clean, 'attacker', 6), 'conquer_city', defenderCity(state));
  }

  const limits = (why: string) => /Across your whole armed forces/.test(why);

  it('leaves the plain reminder untouched for a healthy force', () => {
    const [opp] = getWarObjectiveOpportunities(activeWar(), 'attacker');
    expect(opp.why).toBe('Your declared aim against Egypt is still in progress.');
    expect(opp.priority).toBe(WAR_OBJECTIVE_PRIORITY.active);
  });

  it('turns an unfinished aim into a real recover-or-press-on choice when a quarter of the force is limited', () => {
    const state = activeWar();
    const wounded = Object.values(state.units).filter(u => u.owner === 'attacker').slice(0, 2).map(u => u.id);
    const hurt: GameState = { ...state, units: { ...state.units, ...Object.fromEntries(wounded.map(id => [id, { ...state.units[id], health: 20 }])) } };
    const [opp] = getWarObjectiveOpportunities(hurt, 'attacker');
    expect(opp.stage).toBe('active');
    expect(opp.priority).toBe(WAR_OBJECTIVE_ACTIVE_LIMITED_PRIORITY);
    expect(opp.priority).toBeGreaterThan(WAR_OBJECTIVE_PRIORITY.active);
    expect(opp.priority).toBeLessThan(WAR_OBJECTIVE_PRIORITY['no-goal']);
    expect(opp.why).toContain('Across your whole armed forces (not just this front), 2 of 6 units are limited: 2 badly wounded.');
    expect(opp.why).toContain('let them recover before pressing the attack, or keep fighting');
    expect(opp.destination).toEqual({ kind: 'open-diplomacy' });
  });

  it('stays quiet below the threshold: one limited unit, or a small share of a large force', () => {
    const state = activeWar();
    const ids = Object.values(state.units).filter(u => u.owner === 'attacker').map(u => u.id);
    const one: GameState = { ...state, units: { ...state.units, [ids[0]]: { ...state.units[ids[0]], health: 10 } } };
    expect(limits(getWarObjectiveOpportunities(one, 'attacker')[0].why)).toBe(false);
    const big = armyOf(state, 'attacker', 14); // 20 units, 2 limited = 10%
    const bigIds = Object.values(big.units).filter(u => u.owner === 'attacker').map(u => u.id);
    const twoHurt: GameState = { ...big, units: { ...big.units, [bigIds[0]]: { ...big.units[bigIds[0]], health: 10 }, [bigIds[1]]: { ...big.units[bigIds[1]], health: 10 } } };
    expect(limits(getWarObjectiveOpportunities(twoHurt, 'attacker')[0].why)).toBe(false);
  });

  it('does not restate land supply: a cut-off army is the supply constraint\'s business, not this card\'s', () => {
    const state = activeWar();
    const supply = { state: 'severe', hostileUnsupportedTurns: 9, suppliedTurnsSinceRecovery: 0 } as const;
    const cutOff: GameState = { ...state, units: Object.fromEntries(Object.entries(state.units).map(([id, u]) => [id, u.owner === 'attacker' ? { ...u, landSupply: supply } : u])) };
    const [opp] = getWarObjectiveOpportunities(cutOff, 'attacker');
    expect(opp.why).toBe('Your declared aim against Egypt is still in progress.');
    expect(opp.priority).toBe(WAR_OBJECTIVE_PRIORITY.active);
  });

  it('names naval and air limits in plain language, most severe first, capped', () => {
    let state = activeWar();
    const ships = armyOf(state, 'attacker', 0);
    state = ships;
    const home = state.cities[state.civilizations['attacker'].cities[0]];
    const galley = { ...createUnit('galley', 'attacker', { q: home.position.q, r: home.position.r }, state.idCounters), navalOps: { awayTurns: 12 } };
    const galley2 = { ...createUnit('galley', 'attacker', { q: home.position.q, r: home.position.r }, state.idCounters), navalOps: { awayTurns: 12 } };
    state = { ...state, units: { ...state.units, [galley.id]: galley, [galley2.id]: galley2 } };
    const [opp] = getWarObjectiveOpportunities(state, 'attacker');
    expect(opp.why).toContain('2 of 8 units are limited: 2 depleted ships.');
  });

  it('adds the force condition to a satisfied aim as one more reason to weigh a settlement, never a promise', () => {
    const state = activeWar();
    const target = defenderCity(state);
    const ids = Object.values(state.units).filter(u => u.owner === 'attacker').slice(0, 3).map(u => u.id);
    const hurt: GameState = { ...state, units: { ...state.units, ...Object.fromEntries(ids.map(id => [id, { ...state.units[id], health: 30 }])) } };
    const [opp] = getWarObjectiveOpportunities(transferCity(hurt, target, 'attacker'), 'attacker');
    expect(opp.stage).toBe('satisfied');
    expect(opp.priority).toBe(WAR_OBJECTIVE_PRIORITY.satisfied);
    expect(opp.why).toContain('3 of 6 units are limited: 3 badly wounded.');
    expect(opp.why).toContain('though the other side may not agree to one');
    expect(opp.why.toLowerCase()).not.toMatch(/will accept|you are winning|stronger than|weaker than/);
  });

  it('does not touch a missing or abandoned aim: those choices do not depend on how worn the force is', () => {
    const state = fixture();
    const hurt: GameState = { ...state, units: Object.fromEntries(Object.entries(state.units).map(([id, u]) => [id, { ...u, health: 10 }])) };
    const [noGoal] = getWarObjectiveOpportunities(hurt, 'attacker');
    expect(noGoal.stage).toBe('no-goal');
    expect(limits(noGoal.why)).toBe(false);

    const target = defenderCity(state);
    const withTarget = withGoal(hurt, 'conquer_city', target);
    const { [target]: _gone, ...remaining } = withTarget.cities;
    const [abandoned] = getWarObjectiveOpportunities({ ...withTarget, cities: remaining }, 'attacker');
    expect(abandoned.stage).toBe('abandoned');
    expect(limits(abandoned.why)).toBe(false);
  });

  it('still honours a pending peace/settlement request: no settlement advice, so no force text either', () => {
    const state = activeWar();
    const target = defenderCity(state);
    const satisfied = transferCity(state, target, 'attacker');
    const pending: GameState = { ...satisfied, pendingDiplomacyRequests: [{ id: 'r', type: 'peace', fromCivId: 'defender', toCivId: 'attacker', turnIssued: satisfied.turn }] };
    expect(getWarObjectiveOpportunities(pending, 'attacker')).toEqual([]);
  });

  it('is deterministic, does not mutate, and ignores everything about the other side (earned vs hidden)', () => {
    const state = activeWar();
    const ids = Object.values(state.units).filter(u => u.owner === 'attacker').slice(0, 2).map(u => u.id);
    const hurt: GameState = { ...state, units: { ...state.units, ...Object.fromEntries(ids.map(id => [id, { ...state.units[id], health: 20 }])) } };
    const before = JSON.stringify(hurt);
    const first = getWarObjectiveOpportunities(hurt, 'attacker');
    expect(JSON.stringify(hurt)).toBe(before);
    expect(getWarObjectiveOpportunities(hurt, 'attacker')).toEqual(first);

    expectViewerSafety(
      { name: 'war objective with force readiness', project: (world: GameState, viewer: string) => getWarObjectiveOpportunities(world, viewer) },
      {
        world: hurt,
        viewerId: 'attacker',
        hidden: [
          { label: 'enemy army wounded', apply: w => { for (const u of Object.values(w.units)) if (u.owner === 'defender') u.health = 5; } },
          { label: 'enemy reinforcements appear', apply: w => { const home = w.cities[w.civilizations['defender'].cities[0]]; const u = createUnit('warrior', 'defender', { q: home.position.q, r: home.position.r + 2 }, w.idCounters); w.units[u.id] = u; } },
          { label: 'enemy AI intent changes', apply: w => { w.opponentAI = { ...(w.opponentAI ?? ({} as never)), nationalIntentByCiv: { defender: { current: 'dominate' } } } as never; } },
        ],
        earned: [
          { label: 'own units recover', apply: w => { for (const id of ids) w.units[id].health = 100; } },
          { label: 'a third own unit is badly wounded', apply: w => { const extra = Object.values(w.units).find(u => u.owner === 'attacker' && !ids.includes(u.id))!; w.units[extra.id].health = 10; } },
        ],
      },
    );
  });

  it('answers independently for a second hot-seat viewer at war with the same opponent', () => {
    const state = activeWar();
    const ids = Object.values(state.units).filter(u => u.owner === 'attacker').slice(0, 2).map(u => u.id);
    const hurt: GameState = { ...state, units: { ...state.units, ...Object.fromEntries(ids.map(id => [id, { ...state.units[id], health: 20 }])) } };
    const [mine] = getWarObjectiveOpportunities(hurt, 'attacker');
    const [theirs] = getWarObjectiveOpportunities(hurt, 'defender');
    expect(limits(mine.why)).toBe(true);
    expect(theirs === undefined || !limits(theirs.why)).toBe(true);
  });
});
