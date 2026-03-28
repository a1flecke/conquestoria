import { describe, it, expect } from 'vitest';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';

describe('minor civ definitions', () => {
  it('has exactly 12 definitions', () => {
    expect(MINOR_CIV_DEFINITIONS.length).toBe(12);
  });

  it('has no duplicate IDs', () => {
    const ids = MINOR_CIV_DEFINITIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate names', () => {
    const names = MINOR_CIV_DEFINITIONS.map(d => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each archetype has at least 3 definitions', () => {
    const archetypes = new Map<string, number>();
    for (const d of MINOR_CIV_DEFINITIONS) {
      archetypes.set(d.archetype, (archetypes.get(d.archetype) ?? 0) + 1);
    }
    expect(archetypes.get('militaristic')).toBeGreaterThanOrEqual(3);
    expect(archetypes.get('mercantile')).toBeGreaterThanOrEqual(3);
    expect(archetypes.get('cultural')).toBeGreaterThanOrEqual(3);
  });

  it('all definitions have valid color and bonus', () => {
    for (const d of MINOR_CIV_DEFINITIONS) {
      expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(d.allyBonus).toBeDefined();
      expect(d.allyBonus.type).toBeDefined();
    }
  });

  it('militaristic definitions have free_unit bonus', () => {
    const mil = MINOR_CIV_DEFINITIONS.filter(d => d.archetype === 'militaristic');
    for (const d of mil) {
      expect(d.allyBonus.type).toBe('free_unit');
    }
  });

  it('mercantile definitions have gold_per_turn bonus', () => {
    const merc = MINOR_CIV_DEFINITIONS.filter(d => d.archetype === 'mercantile');
    for (const d of merc) {
      expect(d.allyBonus.type).toBe('gold_per_turn');
    }
  });
});
