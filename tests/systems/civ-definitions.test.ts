import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';

describe('civ-definitions', () => {
  it('defines exactly 6 civilizations', () => {
    expect(CIV_DEFINITIONS).toHaveLength(6);
  });

  it('each civ has unique id, name, and color', () => {
    const ids = CIV_DEFINITIONS.map(c => c.id);
    const names = CIV_DEFINITIONS.map(c => c.name);
    const colors = CIV_DEFINITIONS.map(c => c.color);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(names).size).toBe(6);
    expect(new Set(colors).size).toBe(6);
  });

  it('getCivDefinition returns correct civ by id', () => {
    const egypt = getCivDefinition('egypt');
    expect(egypt).toBeDefined();
    expect(egypt!.name).toBe('Egypt');
    expect(egypt!.bonusEffect.type).toBe('faster_wonders');
  });

  it('getCivDefinition returns undefined for unknown id', () => {
    expect(getCivDefinition('atlantis')).toBeUndefined();
  });

  it('each civ has at least one personality trait', () => {
    for (const civ of CIV_DEFINITIONS) {
      expect(civ.personality.traits.length).toBeGreaterThan(0);
    }
  });

  it('egypt has faster_wonders bonus with 0.7 multiplier', () => {
    const egypt = getCivDefinition('egypt')!;
    expect(egypt.bonusEffect).toEqual({ type: 'faster_wonders', speedMultiplier: 0.7 });
  });

  it('mongolia has mounted_movement bonus', () => {
    const mongolia = getCivDefinition('mongolia')!;
    expect(mongolia.bonusEffect).toEqual({ type: 'mounted_movement', bonus: 1 });
  });

  it('zulu has faster_military bonus with 0.75 multiplier', () => {
    const zulu = getCivDefinition('zulu')!;
    expect(zulu.bonusEffect).toEqual({ type: 'faster_military', speedMultiplier: 0.75 });
  });

  it('greece has diplomacy_start_bonus of 20', () => {
    const greece = getCivDefinition('greece')!;
    expect(greece.bonusEffect).toEqual({ type: 'diplomacy_start_bonus', bonus: 20 });
  });
});
