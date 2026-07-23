import { describe, expect, it } from 'vitest';
import {
  createScenarioState,
  findVisibleOwnedCity,
} from '../e2e/helpers/save-fixture';

describe('E2E save scenarios', () => {
  it('returns independent clones and derives the city from currentPlayer', () => {
    const first = createScenarioState('building');
    const second = createScenarioState('building');
    const city = findVisibleOwnedCity(first);

    expect(first).not.toBe(second);
    expect(city.owner).toBe(first.currentPlayer);
    first.turn = 999;
    expect(second.turn).not.toBe(999);
  });

  it('creates valid building and unit queue heads', () => {
    expect(findVisibleOwnedCity(createScenarioState('building')).productionQueue[0]).toBe('granary');
    expect(findVisibleOwnedCity(createScenarioState('unit')).productionQueue[0]).toBe('warrior');
  });

  it('uses canonical legendary-wonder transitions', () => {
    const state = createScenarioState('legendary');
    const city = findVisibleOwnedCity(state);
    const project = Object.values(state.legendaryWonderProjects ?? {}).find(candidate => (
      candidate.cityId === city.id && candidate.wonderId === 'standing-stones'
    ));

    expect(city.productionQueue[0]).toBe('legendary:standing-stones');
    expect(project?.phase).toBe('building');
  });
});
