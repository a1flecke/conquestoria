import { describe, it, expect } from 'vitest';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('beast definitions', () => {
  it('every beast has a real unit definition with positive strength', () => {
    for (const def of Object.values(BEAST_DEFINITIONS)) {
      const unitDef = UNIT_DEFINITIONS[def.unitType];
      expect(unitDef, `${def.id} missing UNIT_DEFINITIONS entry`).toBeDefined();
      expect(unitDef.strength).toBeGreaterThan(0);
    }
  });

  it('every beast has habitat terrains, a leash radius, and player-facing flavor', () => {
    for (const def of Object.values(BEAST_DEFINITIONS)) {
      expect(def.habitatTerrains.length).toBeGreaterThan(0);
      expect(def.leashRadius).toBeGreaterThanOrEqual(2);
      expect(def.packSize).toBeGreaterThanOrEqual(1);
      expect(def.dangerHint.length).toBeGreaterThan(10);
      expect(def.awakeningFlavor.length).toBeGreaterThan(10);
      expect(def.sightingFlavor.length).toBeGreaterThan(10);
    }
  });

  it('resolves a beast definition from its unit type', () => {
    expect(getBeastDefinitionByUnitType('beast_boar')?.id).toBe('giant_boar');
    expect(getBeastDefinitionByUnitType('warrior')).toBeUndefined();
  });
});
