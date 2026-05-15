import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { resolveUnitVisual } from '@/renderer/unit-visual-resolver';
import { createUnit } from '@/systems/unit-system';

describe('unit-visual-resolver', () => {
  it('omits role marker for major civ units', () => {
    const state = createNewGame(undefined, 'major-visual', 'small');
    const unit = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior' };

    expect(resolveUnitVisual(state, unit, { player: '#4a90d9' })).toMatchObject({
      role: 'major',
      roleMarker: null,
      color: '#4a90d9',
    });
  });

  it('uses hostile chevron marker for barbarian units', () => {
    const state = createNewGame(undefined, 'barbarian-visual', 'small');
    const unit = { ...createUnit('warrior', 'barbarian', { q: 0, r: 0 }), id: 'barb' };

    expect(resolveUnitVisual(state, unit, { barbarian: '#8b4513' })).toMatchObject({
      role: 'barbarian',
      roleMarker: 'chevron',
      color: '#8b4513',
    });
  });

  it('uses city-state diamond marker for minor-civ units', () => {
    const state = createNewGame(undefined, 'minor-visual', 'small');
    const unit = { ...createUnit('warrior', 'mc-sparta', { q: 0, r: 0 }), id: 'mc-unit' };

    expect(resolveUnitVisual(state, unit, { 'mc-sparta': '#8a6f2a' })).toMatchObject({
      role: 'minor',
      roleMarker: 'diamond',
      color: '#8a6f2a',
    });
  });
});
