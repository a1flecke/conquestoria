import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { getIdleCityIds, needsResearchChoice } from '@/systems/planning-system';

describe('end-turn gating', () => {
  it('detects when the player has no active research but valid options exist', () => {
    const state = createNewGame(undefined, 'end-turn-gating-seed', 'small');
    expect(needsResearchChoice(state, state.currentPlayer)).toBe(true);
  });

  it('still reports blockers after only one of multiple idle choices is resolved', () => {
    const state = createNewGame(undefined, 'end-turn-multi-blocker-seed', 'small');
    const playerId = state.currentPlayer;
    const settlerId = state.civilizations[playerId].units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();
    const basePosition = state.units[settlerId!].position;

    const firstCity = foundCity(playerId, basePosition, state.map);
    const secondCity = foundCity(playerId, { q: basePosition.q + 2, r: basePosition.r }, state.map);
    state.cities[firstCity.id] = firstCity;
    state.cities[secondCity.id] = secondCity;
    state.civilizations[playerId].cities.push(firstCity.id, secondCity.id);

    expect(getIdleCityIds(state, playerId)).toHaveLength(2);
    expect(needsResearchChoice(state, playerId)).toBe(true);

    state.civilizations[playerId].techState.currentResearch = 'fire';

    expect(getIdleCityIds(state, playerId)).toHaveLength(2);
    expect(needsResearchChoice(state, playerId)).toBe(false);
  });
});
