import { describe, it, expect } from 'vitest';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';

describe('city-capture-system', () => {
  it('keeps instability pressure when the former owner reconquers its own breakaway city', () => {
    const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

    const result = transferCapturedCityOwnership(state, cityId, 'player', state.turn);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.cities[cityId].unrestLevel).toBe(1);
    expect(result.cities[cityId].conquestTurn).toBeUndefined();
  });
});
