import { describe, expect, it } from 'vitest';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

describe('GENERAL_DEFINITIONS', () => {
  it('has at least one universal (civTypeEligibility: []) entry for custom/fantasy civs and adjacent-era fallback', () => {
    expect(GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.length === 0)).toBe(true);
  });

  it('has at least one historically/lore-eligible entry for every playable civ definition', () => {
    for (const civ of CIV_DEFINITIONS) {
      const hasEntry = GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.includes(civ.id));
      expect(hasEntry, `no General entry eligible for civ "${civ.id}"`).toBe(true);
    }
  });

  it('every entry has a unique id', () => {
    const ids = GENERAL_DEFINITIONS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has an era in range 1-12', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.era).toBeGreaterThanOrEqual(1);
      expect(g.era).toBeLessThanOrEqual(12);
    }
  });

  it('every entry has a non-empty descriptor and a non-empty portraitIcon', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.descriptor.length).toBeGreaterThan(0);
      expect(g.portraitIcon.length).toBeGreaterThan(0);
    }
  });

  it('every civTypeEligibility entry (when non-empty) references a real civ id', () => {
    const realCivIds = new Set(CIV_DEFINITIONS.map(c => c.id));
    for (const g of GENERAL_DEFINITIONS) {
      for (const civId of g.civTypeEligibility) {
        expect(realCivIds.has(civId), `"${g.id}" references unknown civ id "${civId}"`).toBe(true);
      }
    }
  });

  it('no display name collides with a building or trainable unit name (mirrors wonder-content.md\'s collision rule)', () => {
    const buildingNames = new Set(Object.values(BUILDINGS).map(b => b.name));
    const unitNames = new Set(TRAINABLE_UNITS.map(u => u.name));
    for (const g of GENERAL_DEFINITIONS) {
      expect(buildingNames.has(g.name), `"${g.name}" collides with a building name`).toBe(false);
      expect(unitNames.has(g.name), `"${g.name}" collides with a trainable unit name`).toBe(false);
    }
  });

  it('every commandRange and commandCapacity is a positive integer', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(Number.isInteger(g.commandRange)).toBe(true);
      expect(g.commandRange).toBeGreaterThan(0);
      expect(Number.isInteger(g.commandCapacity)).toBe(true);
      expect(g.commandCapacity).toBeGreaterThan(0);
    }
  });
});
