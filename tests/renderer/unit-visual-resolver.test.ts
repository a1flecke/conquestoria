import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { resolveUnitVisual } from '@/renderer/unit-visual-resolver';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { UnitType } from '@/core/types';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('unit-visual-resolver', () => {
  it('omits role marker for major civ units', () => {
    const state = createNewGame(undefined, 'major-visual', 'small');
    const unit = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior' };

    expect(resolveUnitVisual(state, unit, { player: '#4a90d9' })).toMatchObject({
      role: 'major',
      roleMarker: null,
      color: '#4a90d9',
    });
  });

  it('uses hostile chevron marker for barbarian units', () => {
    const state = createNewGame(undefined, 'barbarian-visual', 'small');
    const unit = { ...createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC()), id: 'barb' };

    expect(resolveUnitVisual(state, unit, { barbarian: '#8b4513' })).toMatchObject({
      role: 'barbarian',
      roleMarker: 'chevron',
      color: '#8b4513',
    });
  });

  it('uses city-state diamond marker for minor-civ units', () => {
    const state = createNewGame(undefined, 'minor-visual', 'small');
    const unit = { ...createUnit('warrior', 'mc-sparta', { q: 0, r: 0 }, mkC()), id: 'mc-unit' };

    expect(resolveUnitVisual(state, unit, { 'mc-sparta': '#8a6f2a' })).toMatchObject({
      role: 'minor',
      roleMarker: 'diamond',
      color: '#8a6f2a',
    });
  });

  it('uses a hostile chevron and distinct fallback color for pirate units', () => {
    const state = createNewGame(undefined, 'pirate-visual', 'small');
    const unit = { ...createUnit('warrior', 'pirate-7', { q: 0, r: 0 }, mkC()), id: 'pirate' };

    expect(resolveUnitVisual(state, unit)).toMatchObject({
      role: 'pirate',
      roleMarker: 'chevron',
      color: '#7f1d1d',
    });
  });

  it('classifies rebels independently from major civilizations', () => {
    const state = createNewGame(undefined, 'rebel-visual', 'small');
    const unit = { ...createUnit('warrior', 'rebels', { q: 0, r: 0 }, mkC()), id: 'rebel' };

    expect(resolveUnitVisual(state, unit)).toMatchObject({
      role: 'rebel',
      roleMarker: 'chevron',
    });
  });

  it('provides a concrete fallback icon for every defined unit type', () => {
    const state = createNewGame(undefined, 'fallback-icon-coverage', 'small');

    for (const unitType of Object.keys(UNIT_DEFINITIONS) as UnitType[]) {
      const unit = { ...createUnit(unitType, 'player', { q: 0, r: 0 }, mkC()), id: unitType };

      expect(resolveUnitVisual(state, unit).fallbackIcon, unitType).not.toBe('?');
    }
  });

  it('provides era-readable fallback icons for every pirate hull', () => {
    const state = createNewGame(undefined, 'pirate-fallback-icons', 'small');
    const icons = PIRATE_HULL_TYPES.map(unitType => {
      const unit = { ...createUnit(unitType, 'pirate-1', { q: 0, r: 0 }, mkC()), id: unitType };
      return resolveUnitVisual(state, unit).fallbackIcon;
    });
    expect(icons.every(icon => icon !== '?')).toBe(true);
    expect(new Set(icons).size).toBeGreaterThanOrEqual(3);
  });
});
