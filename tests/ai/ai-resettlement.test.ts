import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { processAIResettlement } from '@/ai/ai-resettlement';

function citylessAiState() {
  const state = createNewGame(undefined, 'ai-resettlement', 'small');
  const civId = 'ai-1';
  for (const city of Object.values(state.cities)) {
    if (city.owner === civId) delete state.cities[city.id];
  }
  state.civilizations[civId].cities = [];
  const settlers = Object.values(state.units).filter(unit => unit.owner === civId && unit.type === 'settler');
  const settler = settlers[0];
  if (!settler) throw new Error('fixture requires an AI settler');
  state.units = { [settler.id]: settler };
  state.civilizations[civId].units = [];
  return { state, civId, settlerId: settler.id };
}

describe('processAIResettlement', () => {
  it('founds immediately for a cityless AI settler on a legal site even when its roster omits the settler', () => {
    const { state, civId, settlerId } = citylessAiState();

    const result = processAIResettlement(state, civId, new EventBus());

    expect(getCivilizationLiveness(result, civId)).toEqual({ living: true, reason: 'city' });
    expect(result.units[settlerId]).toBeUndefined();
    expect(Object.values(result.cities).some(city => city.owner === civId)).toBe(true);
  });

  it('does not spend a human cityless settler', () => {
    const state = createNewGame(undefined, 'human-resettlement', 'small');
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
    if (!settler) throw new Error('fixture requires a player settler');
    state.units = { [settler.id]: settler };
    state.civilizations.player.units = [settler.id];

    const result = processAIResettlement(state, 'player', new EventBus());

    expect(result).toBe(state);
    expect(result.units[settler.id]).toBeDefined();
  });
});
