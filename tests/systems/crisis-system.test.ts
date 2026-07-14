import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processCrisisScheduler, countActiveCrisesForCiv, countUnrestGroups, getCrisisYieldMultiplier } from '@/systems/crisis-system';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import type { GameState } from '@/core/types';

describe('crisis scheduler', () => {
  it('fires a crisis for an idle human past grace', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard' });
    const next = processCrisisScheduler(state, new EventBus());
    const crises = Object.values(next.activeCrises ?? {});
    expect(crises).toHaveLength(1);
    // This fixture's city (population 5, grassland, no forest/mountain/coast/jungle
    // terrain) is geography-eligible for 'plague' (population >= 4), 'bandit-uprising'
    // (any land city, MR3), and 'crop-blight' (grassland city, MR5) — all start with
    // equal anti-repeat weight, and this seed's weighted pick lands on crop-blight
    // (was bandit-uprising before MR5 added a new equally-weighted grassland-eligible
    // candidate). The point of this test is the grace/cooldown gate and history
    // bookkeeping, not which specific flavor wins the pick.
    expect(crises[0].flavorId).toBe('crop-blight');
    expect(next.civilizations.p1.lastCrisisOnsetTurn).toBe(40);
    expect(next.civilizations.p1.recentCrisisHistory).toEqual(['crop-blight']);
  });

  it('respects era grace: no crisis in era 1 for anyone, era 2 for explorer', () => {
    for (const [challenge, era] of [['veteran', 1], ['explorer', 2]] as const) {
      const { state } = makeCrisisFixture({ era, turn: 99, challenge });
      expect(Object.keys(processCrisisScheduler(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
    }
  });

  it('respects turn grace floors (30/20/10)', () => {
    for (const [challenge, turn] of [['explorer', 29], ['standard', 19], ['veteran', 9]] as const) {
      const { state } = makeCrisisFixture({ era: 5, turn, challenge });
      expect(Object.keys(processCrisisScheduler(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
    }
  });

  it('respects cooldown', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard', lastCrisisOnsetTurn: 35 });
    expect(Object.keys(processCrisisScheduler(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
  });

  it('is blocked at cap, counting unrest groups', () => {
    // standard cap = 2: one active crisis + one unrest group = at cap
    const { state } = makeCrisisFixture({
      era: 3, turn: 40, challenge: 'standard',
      existingCrisisCount: 1, unrestCityCount: 1,
    });
    expect(countUnrestGroups(state, 'p1')).toBe(1);
    expect(countActiveCrisesForCiv(state, 'p1')).toBe(2);
    const next = processCrisisScheduler(state, new EventBus());
    expect(Object.keys(next.activeCrises ?? {})).toHaveLength(1); // unchanged
  });

  it('adjacent unrest cities count as ONE group', () => {
    const { state } = makeCrisisFixture({ unrestCityCount: 2, adjacentUnrestCities: true });
    expect(countUnrestGroups(state, 'p1')).toBe(1);
  });

  it('merges unrest cities that are only far apart by raw distance, adjacent across the wrap seam (issue #520)', () => {
    const { state } = makeCrisisFixture({ unrestCityCount: 2, adjacentUnrestCities: false });
    state.map.wrapsHorizontally = true;
    const width = state.map.width;
    state.cities.c2.position = { q: 0, r: 0 };
    state.cities.c3.position = { q: width - 1, r: 0 };

    expect(countUnrestGroups(state, 'p1')).toBe(1);
  });

  it('is deterministic: same state → same crisis id and target', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40 });
    const a = processCrisisScheduler(state, new EventBus());
    const b = processCrisisScheduler(state, new EventBus());
    expect(a.activeCrises).toEqual(b.activeCrises);
  });

  it('skips players with an active external threat', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, activeExternalThreat: true });
    expect(Object.keys(processCrisisScheduler(state, new EventBus()).activeCrises ?? {})).toHaveLength(0);
  });

  it('emits crisis:started with what-to-do copy routed later', () => {
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:started', e => events.push(e));
    processCrisisScheduler(makeCrisisFixture({ era: 3, turn: 40 }).state, bus);
    expect(events).toHaveLength(1);
  });
});

describe('AI crisis severity uses standard, not opponentChallenge (#526 MR1)', () => {
  it('resolves AI crisis severity as standard even when opponentChallenge is veteran', () => {
    const flavor = getCrisisFlavor('plague')!;
    const std = 1 - flavor.severityByChallenge.standard.yieldPenalty;
    const vet = 1 - flavor.severityByChallenge.veteran.yieldPenalty;
    expect(std).not.toBe(vet); // guard: the test is meaningful
    // Minimal literal state — getCrisisYieldMultiplier only reads activeCrises,
    // cities (for membership), civilizations, opponentChallenge.
    const state = {
      opponentChallenge: 'veteran',
      civilizations: { 'ai-1': { id: 'ai-1', isHuman: false } },
      cities: { 'ai-city': { id: 'ai-city' } },
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'ai-1',
          cityIds: ['ai-city'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
        },
      },
    } as unknown as GameState;
    expect(getCrisisYieldMultiplier(state, 'ai-city')).toBeCloseTo(std);
  });
});
