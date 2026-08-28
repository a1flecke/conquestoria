import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getStrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    civilizations: {
      p1: {
        id: 'p1', cities: [], units: [], strategicArsenal: 2,
        // treaties: [] must be present -- getActiveArmsControlCap (#545 MR6)
        // reads civ.diplomacy.treaties unconditionally, same convention as
        // every other diplomacy helper in this codebase.
        diplomacy: { strategicStrikesReceivedFrom: ['p2'], treaties: [] },
      } as any,
    },
    cities: {}, units: {},
    builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } as any },
    ...overrides,
  } as GameState;
}

describe('getStrategicArsenalSummaryPresentation (#545 MR4 warchief panel)', () => {
  it('reports real arsenal count, capacity, and who has struck this civ', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
    expect(presentation.arsenalCount).toBe(2);
    expect(presentation.arsenalCapacity).toBeGreaterThanOrEqual(1);
    expect(presentation.strikesReceivedFromCivIds).toEqual(['p2']);
  });

  it('reports zero platforms when the civ owns no eligible building or unit', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
    expect(presentation.platforms).toEqual([]);
  });

  it('defaults to empty for an unknown civ', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'nobody');
    expect(presentation.arsenalCount).toBe(0);
    expect(presentation.strikesReceivedFromCivIds).toEqual([]);
  });

  it('activeArmsControlCap is null with no active pact', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
    expect(presentation.activeArmsControlCap).toBeNull();
  });

  it('activeArmsControlCap surfaces the active pact cap', () => {
    const state = makeState({
      civilizations: {
        p1: {
          id: 'p1', cities: [], units: [], strategicArsenal: 2,
          diplomacy: { strategicStrikesReceivedFrom: ['p2'], treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 4 }] },
        } as any,
      },
    });
    expect(getStrategicArsenalSummaryPresentation(state, 'p1').activeArmsControlCap).toBe(4);
  });

  it('civ A\'s presentation is unaffected by civ B\'s arsenal/platform state, even in the same multi-civ state (#545 MR8 hot-seat privacy)', () => {
    const state = makeState({
      settings: { superweapons: 'on' } as any,
      civilizations: {
        p1: {
          id: 'p1', cities: ['c1'], units: [], strategicArsenal: 1,
          diplomacy: { strategicStrikesReceivedFrom: [], treaties: [] },
        } as any,
        p2: {
          id: 'p2', cities: ['c2'], units: [], strategicArsenal: 5,
          diplomacy: { strategicStrikesReceivedFrom: [], treaties: [] },
        } as any,
      },
      cities: {
        c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
        c2: { id: 'c2', name: 'C2', owner: 'p2', position: { q: 5, r: 5 }, buildings: ['missile_silo', 'nuclear_arsenal'] } as any,
      },
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } as any,
        'p2:manhattan_project': { civId: 'p2', cityId: 'c2', eraBuilt: 10 } as any,
      },
    });

    const p1View = getStrategicArsenalSummaryPresentation(state, 'p1');
    expect(p1View.arsenalCount).toBe(1);
    expect(p1View.arsenalCapacity).toBe(2); // base 1 + missile_silo 1
    expect(p1View.platforms).toHaveLength(1);

    const p2View = getStrategicArsenalSummaryPresentation(state, 'p2');
    expect(p2View.arsenalCount).toBe(5);
    expect(p2View.arsenalCapacity).toBe(4); // base 1 + missile_silo 1 + nuclear_arsenal 2
    expect(p2View.platforms).toHaveLength(1);

    // The critical assertion: p1's own view never reflects p2's numbers.
    expect(p1View.arsenalCount).not.toBe(p2View.arsenalCount);
    expect(p1View.arsenalCapacity).not.toBe(p2View.arsenalCapacity);
  });
});
