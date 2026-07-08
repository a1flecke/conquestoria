import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { normalizeMinorCivEconomyState } from '@/systems/minor-civ-economy-system';

describe('minor-civ economy normalization', () => {
  it('does not change city queue, production progress, units, or regional grievance', () => {
    const state = createNewGame(undefined, 'minor-economy-normalize-system', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['walls'];
    city.productionProgress = 7;
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 45,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnits = structuredClone(state.units);

    const result = normalizeMinorCivEconomyState(state);

    expect(result.cities[city.id].productionQueue).toEqual(['walls']);
    expect(result.cities[city.id].productionProgress).toBe(7);
    expect(result.units).toEqual(beforeUnits);
    expect(result.minorCivs[minorCiv.id].regionalGrievanceByCiv).toEqual(minorCiv.regionalGrievanceByCiv);
    expect(result.minorCivs[minorCiv.id].economy).toMatchObject({ policy: 'balanced', posture: 'settled' });
  });
});
