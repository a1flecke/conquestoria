import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { getMovementRangeDetails } from '@/systems/unit-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { calculateCombatStrengths } from '@/systems/combat-system';
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

  it('does not stop air, recon, or units beside another domain', () => {
    const state = createNewGame(undefined, 'zoc-domain-exemptions', 'small');
    const scout = { ...createUnit('scout', 'player', { q: 4, r: 5 }, mkC()), id: 'scout', movementPointsLeft: 2 };
    const air = { ...createUnit('biplane', 'player', { q: 4, r: 6 }, mkC()), id: 'air', movementPointsLeft: 2 };
    const enemy = { ...createUnit('warrior', 'ai-1', { q: 6, r: 4 }, mkC()), id: 'enemy' };
    state.units = { scout, air, enemy };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    expect(getZoneOfControlAt(state, scout, { q: 5, r: 5 }).limited).toBe(false);
    expect(getZoneOfControlAt(state, air, { q: 5, r: 5 }).limited).toBe(false);
    expect(getMovementRangeDetails(state, scout.id).zocLimited).toEqual([]);
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

  it('applies flanking and defensive support once per eligible occupied tile', () => {
    const state = createNewGame(undefined, 'zoc-positioning', 'small');
    const defender = { ...createUnit('warrior', 'ai-1', { q: 5, r: 5 }, mkC()), id: 'defender' };
    const attacker = { ...createUnit('warrior', 'player', { q: 4, r: 5 }, mkC()), id: 'attacker' };
    const attackerStack = { ...createUnit('warrior', 'player', { q: 4, r: 5 }, mkC()), id: 'attacker-stack' };
    const flank = { ...createUnit('archer', 'player', { q: 5, r: 4 }, mkC()), id: 'flank' };
    const support = { ...createUnit('warrior', 'ai-1', { q: 6, r: 5 }, mkC()), id: 'support' };
    const civilian = { ...createUnit('worker', 'ai-1', { q: 6, r: 4 }, mkC()), id: 'civilian' };
    state.units = { defender, attacker, attackerStack, flank, support, civilian };

    const context = buildCombatContextForDefender(state, attacker, defender);
    const baseline = calculateCombatStrengths(attacker, defender, state.map, {});
    const positioned = calculateCombatStrengths(attacker, defender, state.map, context);

    expect(context.attackerPositioningMultiplier).toBeCloseTo(1.2);
    expect(context.defenderPositioningMultiplier).toBeCloseTo(1.1);
    expect(context.attackerPositioningPart?.label).toBe('Flanked +20%');
    expect(context.defenderPositioningPart?.label).toBe('Supported +10%');
    expect(positioned.attackerStrength).toBeCloseTo(baseline.attackerStrength * 1.2);
    expect(positioned.defenderStrength).toBeCloseTo(baseline.defenderStrength * 1.1);
  });

  it('adds one landing penalty and one shore-bombardment bonus for an amphibious assault', () => {
    const state = createNewGame(undefined, 'amphibious-support', 'small');
    const defender = { ...createUnit('warrior', 'ai-1', { q: 5, r: 5 }, mkC()), id: 'defender' };
    const attacker = { ...createUnit('warrior', 'player', { q: 4, r: 5 }, mkC()), id: 'attacker' };
    const shipA = { ...createUnit('frigate', 'player', { q: 5, r: 4 }, mkC()), id: 'frigate-a' };
    const shipB = { ...createUnit('frigate', 'player', { q: 6, r: 5 }, mkC()), id: 'frigate-b' };
    state.units = { defender, attacker, 'frigate-a': shipA, 'frigate-b': shipB };

    const context = buildCombatContextForDefender(state, attacker, defender, { amphibiousAssault: true });

    expect(context.attackerAmphibiousMultiplier).toBeCloseTo(0.55);
    expect(context.attackerAmphibiousParts).toEqual([
      { label: 'Landing -50%', kind: 'mult' },
      { label: 'Shore bombardment +10%', kind: 'mult' },
    ]);
  });
});
