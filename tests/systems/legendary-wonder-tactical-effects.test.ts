import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { LegendaryWonderDefinition } from '@/core/types';
import { getCompletedLegendaryWonderTacticalEffects, getTacticalWonderAiValue } from '@/systems/legendary-wonder-tactical-effects';

const definitions: LegendaryWonderDefinition[] = [{
  id: 'test-wonder', name: 'Test Wonder', era: 3, productionCost: 1,
  requiredTechs: [], requiredResources: [], cityRequirement: 'any', questSteps: [],
  reward: { summary: 'Test', tacticalEffects: [{ kind: 'fort-occupant-healing', amount: 5, aiValue: 14 }] },
}];

describe('legendary wonder tactical effects', () => {
  it('resolves only effects from wonders completed by the requesting owner', () => {
    const state = createNewGame('rome', 'tactical-effect-owner', 'small');
    state.completedLegendaryWonders = { 'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 } };

    expect(getCompletedLegendaryWonderTacticalEffects(state, 'player', definitions)).toEqual(definitions[0]!.reward.tacticalEffects);
    expect(getCompletedLegendaryWonderTacticalEffects(state, 'ai-1', definitions)).toEqual([]);
    expect(getTacticalWonderAiValue(state, 'player', definitions)).toBe(14);
  });
});
