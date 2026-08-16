import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getActiveCampPressure,
  recordCampPressure,
} from '@/systems/barbarian-pressure';

function pressureState() {
  const state = createNewGame('rome', 'barbarian-pressure', 'small');
  state.turn = 40;
  state.barbarianCamps = {
    'camp-a': { id: 'camp-a', position: { q: 5, r: 5 }, strength: 5, spawnCooldown: 3 },
  };
  return state;
}

describe('barbarian camp pressure', () => {
  it('keeps armor through the ten-turn expiry boundary and expires it after', () => {
    const state = pressureState();
    const observed = recordCampPressure(state, 'camp-a', 'armor', 40);

    expect(getActiveCampPressure(observed, 'camp-a', 50)).toEqual(['armor']);
    expect(getActiveCampPressure(observed, 'camp-a', 51)).toEqual([]);
  });

  it('renews one scalar fact without retaining live-unit data', () => {
    const state = pressureState();
    const observed = recordCampPressure(
      recordCampPressure(state, 'camp-a', 'armor', 12),
      'camp-a',
      'armor',
      15,
    );

    expect(observed.barbarianCampPressure?.['camp-a']).toEqual({ armorLastObservedTurn: 15 });
    expect(JSON.stringify(observed.barbarianCampPressure)).not.toContain('unit-');
  });
});
