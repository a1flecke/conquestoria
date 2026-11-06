import { describe, expect, it } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { isCityStateGraduationEnabled } from '@/systems/city-state-graduation-flag';

/** #497: the setup screens send `settingsOverrides.cityStateGraduation`; creation must carry it into the game. */
describe('new games and city-state graduation (#497)', () => {
  const solo = { civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Graduation option' } as const;

  it('a solo game that does not opt in has graduation off', () => {
    expect(isCityStateGraduationEnabled(createNewGame({ ...solo, seed: 'grad-opt-default' }))).toBe(false);
  });

  it('a solo game that chose Off has graduation off', () => {
    const state = createNewGame({ ...solo, seed: 'grad-opt-off', settingsOverrides: { cityStateGraduation: 'off' } });
    expect(isCityStateGraduationEnabled(state)).toBe(false);
  });

  it('a solo game that chose On has graduation on', () => {
    const state = createNewGame({ ...solo, seed: 'grad-opt-on', settingsOverrides: { cityStateGraduation: 'on' } });
    expect(state.settings.cityStateGraduation).toBe('on');
    expect(isCityStateGraduationEnabled(state)).toBe(true);
  });

  it('a hot seat game carries the choice too', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { slotId: 'player-1', name: 'One', civType: 'rome', isHuman: true },
        { slotId: 'player-2', name: 'Two', civType: 'egypt', isHuman: true },
      ],
      settingsOverrides: { cityStateGraduation: 'on' },
      seed: 'grad-opt-hotseat',
    } as Parameters<typeof createHotSeatGame>[0]);
    expect(isCityStateGraduationEnabled(state)).toBe(true);
  });
});
