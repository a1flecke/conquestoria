import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { resolveCombinedArms } from '@/systems/combined-arms-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { createUnit } from '@/systems/unit-system';

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('Main Battle Tank combined arms (#687)', () => {
  it('uses one adjacent friendly Mechanized Infantry provider without stacking', () => {
    const state = createNewGame(undefined, 'main-battle-tank-support', 'small');
    const mbt = { ...createUnit('main_battle_tank', 'player', { q: 5, r: 5 }, counters()), id: 'mbt' };
    const first = { ...createUnit('mechanized_infantry', 'player', { q: 6, r: 5 }, counters()), id: 'alpha' };
    const second = { ...createUnit('exosuit_infantry', 'player', { q: 5, r: 6 }, counters()), id: 'bravo' };
    state.units = { mbt, first, second };

    expect(resolveCombinedArms(state, mbt)).toMatchObject({
      multiplier: 1.10,
      provider: { id: 'alpha', type: 'mechanized_infantry' },
      fact: expect.objectContaining({
        label: 'Combined arms +10% — adjacent Mechanized Infantry',
        sourceVisibility: 'owner',
      }),
    });
  });

  it('applies the same bonus to an MBT attacker and defender through the shared context', () => {
    const state = createNewGame(undefined, 'main-battle-tank-context', 'small');
    const mbt = { ...createUnit('main_battle_tank', 'player', { q: 5, r: 5 }, counters()), id: 'mbt' };
    const infantry = { ...createUnit('exosuit_infantry', 'player', { q: 6, r: 5 }, counters()), id: 'infantry' };
    const enemy = { ...createUnit('warrior', 'ai-1', { q: 5, r: 4 }, counters()), id: 'enemy' };
    state.units = { mbt, infantry, enemy };

    const attacking = buildCombatContextForDefender(state, mbt, enemy);
    const defending = buildCombatContextForDefender(state, enemy, mbt);

    expect(attacking.attackerCombinedArmsMultiplier).toBe(1.10);
    expect(attacking.attackerCombinedArmsFact?.label).toContain('Exosuit Infantry');
    expect(defending.defenderCombinedArmsMultiplier).toBe(1.10);
  });
});
