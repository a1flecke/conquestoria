import { describe, it, expect } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { PIRATE_HULL_DEFINITIONS, PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

describe('naval hull water-class catalog coverage', () => {
  it('every naval UnitDefinition sets waterAccess explicitly', () => {
    const missing = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval' && def.waterAccess === undefined)
      .map(def => def.type);
    expect(missing).toEqual([]);
  });

  it('every naval UnitDefinition sets a valid waterAccess value', () => {
    const invalid = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval')
      .filter(def => def.waterAccess !== 'coastal' && def.waterAccess !== 'ocean')
      .map(def => def.type);
    expect(invalid).toEqual([]);
  });

  it('every PirateHullDefinition sets a valid waterAccess value', () => {
    const invalid = PIRATE_HULL_TYPES
      .filter(type => {
        const access = PIRATE_HULL_DEFINITIONS[type].waterAccess;
        return access !== 'coastal' && access !== 'ocean';
      });
    expect(invalid).toEqual([]);
  });

  it('pirate hull waterAccess flows through into UNIT_DEFINITIONS (createPirateUnitDefinition wiring)', () => {
    for (const type of PIRATE_HULL_TYPES) {
      expect(UNIT_DEFINITIONS[type]?.waterAccess).toBe(PIRATE_HULL_DEFINITIONS[type].waterAccess);
    }
  });

  it('matches the final hull classification table from the design spec', () => {
    const coastalOnly: readonly string[] = ['galley', 'transport'];
    const oceanGoing: readonly string[] = [
      'trireme', 'carrack', 'galleon', 'steamship', 'troop_transport', 'frigate', 'ironclad',
      'pre_dreadnought', 'submarine', 'carrier', 'destroyer', 'missile_submarine',
      'autonomous_frigate', 'naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship',
    ];
    for (const type of coastalOnly) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('coastal');
    }
    for (const type of oceanGoing) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('ocean');
    }

    const coastalPirates: readonly string[] = ['pirate_galley', 'pirate_corsair'];
    const oceanPirates: readonly string[] = [
      'pirate_frigate', 'pirate_ironclad', 'pirate_fast_attack_craft', 'pirate_mothership',
    ];
    for (const type of coastalPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('coastal');
    }
    for (const type of oceanPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('ocean');
    }
  });
});
