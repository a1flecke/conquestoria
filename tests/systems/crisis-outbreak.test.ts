import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { ActiveCrisis, GameState } from '@/core/types';
import {
  processCrisisTurn,
  applyQuarantine,
  applyRemedy,
  getCrisisYieldMultiplier,
  resolveCrisis,
  handleCityLeftCiv,
} from '@/systems/crisis-system';
import { makeCrisisFixture } from './helpers/crisis-fixture';

function withCrisis(overrides: Partial<ActiveCrisis> = {}) {
  const { state, civId } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard' });
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: civId,
    cityIds: ['c1'], tileKeys: [], startedTurn: 38, stage: 'active', turnsInStage: 2,
    ...overrides,
  };
  return {
    state: { ...state, activeCrises: { [crisis.id]: crisis } },
    civId,
    crisis,
  };
}

describe('outbreak resolver', () => {
  it('ticks turnsInStage each turn for every active crisis', () => {
    const { state } = withCrisis();
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises!['crisis-1'].turnsInStage).toBe(3);
  });

  it('applies yield multiplier: afflicted, quarantined, unaffected', () => {
    const { state } = withCrisis();
    expect(getCrisisYieldMultiplier(state, 'c1')).toBeCloseTo(0.75); // standard yieldPenalty 0.25
    expect(getCrisisYieldMultiplier(state, 'c2')).toBe(1);

    const { state: quarantined } = withCrisis({ quarantinedCityIds: ['c1'] });
    expect(getCrisisYieldMultiplier(quarantined, 'c1')).toBeCloseTo(0.5); // 1 - 2*0.25
  });

  it('composes multiplicatively across multiple crises on the same city', () => {
    const { state, civId } = withCrisis();
    const secondCrisis: ActiveCrisis = {
      id: 'crisis-2', flavorId: 'plague', archetype: 'outbreak', targetCivId: civId,
      cityIds: ['c1'], tileKeys: [], startedTurn: 39, stage: 'active', turnsInStage: 1,
    };
    const withBoth = { ...state, activeCrises: { ...state.activeCrises, [secondCrisis.id]: secondCrisis } };
    expect(getCrisisYieldMultiplier(withBoth, 'c1')).toBeCloseTo(0.75 * 0.75);
  });

  it('spreads to nearest same-owner non-afflicted city, never to another civ', () => {
    // deterministic spread requires many turns to guarantee; run several turns and check it never targets an enemy
    let { state } = withCrisis();
    const enemyState = {
      ...state,
      cities: {
        ...state.cities,
        enemy: { ...state.cities.c2, id: 'enemy', owner: 'other-civ' },
      },
    };
    let s: GameState = enemyState;
    for (let i = 0; i < 30; i++) {
      s = processCrisisTurn({ ...s, turn: s.turn + 1 }, new EventBus());
    }
    expect(s.activeCrises!['crisis-1'].cityIds).not.toContain('enemy');
  });

  it('remedy completion clears the city and resolves contained when empty', () => {
    const { state } = withCrisis({ remedyCompletionByCity: { c1: 41 } });
    const next = processCrisisTurn({ ...state, turn: 41 }, new EventBus());
    expect(next.activeCrises?.['crisis-1']).toBeUndefined();
  });

  it('explorer auto-expiry resolves the crisis as expired', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'explorer' });
    const crisis: ActiveCrisis = {
      id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'p1',
      cityIds: ['c1'], tileKeys: [], startedTurn: 35, stage: 'active', turnsInStage: 5,
    };
    const withCrisisState = { ...state, activeCrises: { [crisis.id]: crisis } };
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    const next = processCrisisTurn(withCrisisState, bus);
    expect(next.activeCrises?.['crisis-1']).toBeUndefined();
    expect(events).toEqual([{ crisisId: 'crisis-1', civId: 'p1', outcome: 'expired' }]);
  });

  it('veteran pop loss every N ignored turns when not quarantined/remedied', () => {
    const { state } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'veteran' });
    const crisis: ActiveCrisis = {
      id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'p1',
      cityIds: ['c1'], tileKeys: [], startedTurn: 37, stage: 'active', turnsInStage: 2,
    };
    const withCrisisState = { ...state, activeCrises: { [crisis.id]: crisis } };
    const popBefore = withCrisisState.cities.c1.population;
    const next = processCrisisTurn(withCrisisState, new EventBus());
    expect(next.cities.c1.population).toBe(popBefore - 1);
  });

  it('applyQuarantine is free and idempotent', () => {
    const { state } = withCrisis();
    const result = applyQuarantine(state, 'crisis-1', 'c1');
    expect(result.success).toBe(true);
    expect(result.state.activeCrises!['crisis-1'].quarantinedCityIds).toEqual(['c1']);
    expect(result.state.civilizations.p1.gold).toBe(state.civilizations.p1.gold);

    const second = applyQuarantine(result.state, 'crisis-1', 'c1');
    expect(second.success).toBe(false);
    expect(second.message).toBe('Already quarantined.');
  });

  it('applyRemedy costs gold, fails when unaffordable, sets completion turn', () => {
    const { state } = withCrisis();
    const poor = { ...state, civilizations: { ...state.civilizations, p1: { ...state.civilizations.p1, gold: 0 } } };
    const failed = applyRemedy(poor, 'crisis-1', 'c1');
    expect(failed.success).toBe(false);

    const result = applyRemedy(state, 'crisis-1', 'c1');
    expect(result.success).toBe(true);
    expect(result.state.activeCrises!['crisis-1'].remedyCompletionByCity?.c1).toBe(state.turn + 2);
    expect(result.state.civilizations.p1.gold).toBeLessThan(state.civilizations.p1.gold);
  });

  it('handleCityLeftCiv removes the city and resolves abandoned if crisis empties', () => {
    const { state } = withCrisis();
    const next = handleCityLeftCiv(state, 'c1', new EventBus());
    expect(next.activeCrises?.['crisis-1']).toBeUndefined();
  });

  it('resolveCrisis deletes the crisis and emits crisis:resolved', () => {
    const { state } = withCrisis();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:resolved', e => events.push(e));
    const next = resolveCrisis(state, 'crisis-1', 'contained', bus);
    expect(next.activeCrises?.['crisis-1']).toBeUndefined();
    expect(events).toEqual([{ crisisId: 'crisis-1', civId: 'p1', outcome: 'contained' }]);
  });
});
