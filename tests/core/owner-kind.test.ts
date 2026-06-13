import { describe, expect, it } from 'vitest';
import {
  canReceiveCivilizationCombatRewards,
  classifyOwner,
  isAlwaysHostilePair,
  isMajorCivOwner,
  isPirateOwner,
} from '@/core/owner-kind';

describe('owner-kind', () => {
  it('classifies every owner namespace through one canonical boundary', () => {
    expect(classifyOwner('player')).toBe('major');
    expect(classifyOwner('ai-1')).toBe('major');
    expect(classifyOwner('mc-sparta')).toBe('minor');
    expect(classifyOwner('barbarian')).toBe('barbarian');
    expect(classifyOwner('rebels')).toBe('rebel');
    expect(classifyOwner('beasts')).toBe('beast');
    expect(classifyOwner('pirate')).toBe('pirate');
    expect(classifyOwner('pirate-7')).toBe('pirate');
  });

  it('keeps major-civilization and pirate predicates explicit', () => {
    expect(isMajorCivOwner('player')).toBe(true);
    expect(isMajorCivOwner('pirate-7')).toBe(false);
    expect(isPirateOwner('pirate-7')).toBe(true);
    expect(isPirateOwner('pirates')).toBe(false);
  });

  it('makes pirates and major civilizations mutually hostile without making pirate factions fight each other', () => {
    expect(isAlwaysHostilePair('player', 'pirate-7')).toBe(true);
    expect(isAlwaysHostilePair('pirate-7', 'player')).toBe(true);
    expect(isAlwaysHostilePair('pirate-7', 'pirate-8')).toBe(false);
    expect(isAlwaysHostilePair('pirate-7', 'pirate-7')).toBe(false);
  });

  it('does not give non-civilization owners ordinary treasury rewards', () => {
    expect(canReceiveCivilizationCombatRewards('player')).toBe(true);
    expect(canReceiveCivilizationCombatRewards('pirate-7')).toBe(false);
    expect(canReceiveCivilizationCombatRewards('barbarian')).toBe(false);
    expect(canReceiveCivilizationCombatRewards('mc-sparta')).toBe(false);
  });
});
