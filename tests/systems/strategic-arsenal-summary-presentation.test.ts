import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getStrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    civilizations: {
      p1: {
        id: 'p1', cities: [], units: [], strategicArsenal: 2,
        diplomacy: { strategicStrikesReceivedFrom: ['p2'] },
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
});
