import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import {
  getCombatAdjacentOccupiedTileCount,
  getZoneOfControlAt,
  isZocEligibleCombatUnit,
} from '@/systems/zone-of-control-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('zone of control', () => {
  it('excludes recon, civilians, and air while accepting ordinary combat units', () => {
    expect(isZocEligibleCombatUnit(createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()))).toBe(true);
    expect(isZocEligibleCombatUnit(createUnit('scout', 'player', { q: 0, r: 0 }, mkC()))).toBe(false);
    expect(isZocEligibleCombatUnit(createUnit('worker', 'player', { q: 0, r: 0 }, mkC()))).toBe(false);
    expect(isZocEligibleCombatUnit(createUnit('biplane', 'player', { q: 0, r: 0 }, mkC()))).toBe(false);
  });

  it('finds a hostile same-domain source across the horizontal wrap', () => {
    const state = createNewGame(undefined, 'zoc-wrap', 'small');
    state.map.width = 5;
    state.map.wrapsHorizontally = true;
    const mover = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'mover' };
    const enemy = { ...createUnit('warrior', 'ai-1', { q: 4, r: 0 }, mkC()), id: 'enemy' };
    state.units = { mover, enemy };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    expect(getZoneOfControlAt(state, mover, { q: 0, r: 0 })).toMatchObject({
      limited: true,
      sourceUnitIds: ['enemy'],
    });
  });

  it('counts occupied adjacent combat tiles rather than units in a stack', () => {
    const state = createNewGame(undefined, 'zoc-adjacency', 'small');
    const defender = { ...createUnit('warrior', 'ai-1', { q: 0, r: 0 }, mkC()), id: 'defender' };
    const attacker = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'attacker' };
    const stacked = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'stacked' };
    const flank = { ...createUnit('archer', 'player', { q: 0, r: 1 }, mkC()), id: 'flank' };
    state.units = { defender, attacker, stacked, flank };

    expect(getCombatAdjacentOccupiedTileCount(state, 'player', defender, attacker.id)).toBe(2);
  });
});
