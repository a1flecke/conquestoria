import { describe, it, expect } from 'vitest';
import {
  UNIT_SPRITE_CATALOG,
  BUILDING_SPRITE_CATALOG,
  PIRATE_HEADQUARTERS_SPRITE_CATALOG,
} from '@/renderer/sprites/sprite-catalog';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

// Derive the authoritative unit-type list from UNIT_DEFINITIONS so this test
// automatically catches any new UnitType added to types.ts without a matching
// sprite or motion wiring.
const ALL_UNIT_TYPES = Object.keys(UNIT_DEFINITIONS) as Array<keyof typeof UNIT_DEFINITIONS>;

describe('sprite-catalog coverage', () => {
  describe('UNIT_SPRITE_CATALOG', () => {
    it('has an entry for every UnitType in UNIT_DEFINITIONS', () => {
      for (const unitType of ALL_UNIT_TYPES) {
        expect(UNIT_SPRITE_CATALOG[unitType], `missing sprite for unit type: ${unitType}`).toBeDefined();
        expect(typeof UNIT_SPRITE_CATALOG[unitType], `sprite for ${unitType} must be a function`).toBe('function');
      }
    });

    it('UNIT_SPRITE_CATALOG has no entries for unknown types', () => {
      for (const unitType of Object.keys(UNIT_SPRITE_CATALOG)) {
        expect(UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS], `${unitType} in sprite catalog but not in UNIT_DEFINITIONS`).toBeDefined();
      }
    });

    it('every unit sprite responds to all three motion states', () => {
      const palette = derivePalette('#4a90d9');
      for (const unitType of ALL_UNIT_TYPES) {
        const render = UNIT_SPRITE_CATALOG[unitType];
        if (!render) continue; // caught by entry test above

        const idle    = render({ palette, svgOnly: true, motion: 'idle' });
        const movingA = render({ palette, svgOnly: true, motion: 'move-a' });
        const movingB = render({ palette, svgOnly: true, motion: 'move-b' });

        expect(idle,    `${unitType} idle`).toContain('data-motion="idle"');
        expect(movingA, `${unitType} move-a`).toContain('data-motion="move-a"');
        expect(movingB, `${unitType} move-b`).toContain('data-motion="move-b"');

        expect(movingA, `${unitType} move-a must differ from idle`).not.toBe(idle);
        expect(movingB, `${unitType} move-b must differ from move-a`).not.toBe(movingA);
      }
    });

    it('siege engines use land motion instead of naval bobbing', () => {
      const palette = derivePalette('#4a90d9');
      const siegeTypes: Array<keyof typeof UNIT_SPRITE_CATALOG> = ['catapult', 'ballista', 'cannon'];

      for (const unitType of siegeTypes) {
        const movingA = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'move-a' });
        const movingB = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'move-b' });

        expect(movingA, `${unitType} move-a should use the land pivot`).toContain('rotate(-2 64 70)');
        expect(movingB, `${unitType} move-b should use the land pivot`).toContain('rotate(2 64 70)');
        expect(movingA, `${unitType} move-a should not use the naval pivot`).not.toContain('64 82');
        expect(movingB, `${unitType} move-b should not use the naval pivot`).not.toContain('64 82');
      }
    });

    it('renders all pirate hulls as production naval sprites at low zoom', () => {
      const palette = derivePalette('#7f1d1d');
      for (const unitType of PIRATE_HULL_TYPES) {
        const svg = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'idle' });
        expect(svg, unitType).toContain('data-kind="naval"');
        expect(svg, unitType).toContain('viewBox="0 0 128 128"');
        expect(svg.length, `${unitType} must be final art, not a trivial placeholder`).toBeGreaterThan(1200);
      }
    });
  });

  describe('BUILDING_SPRITE_CATALOG', () => {
    for (const buildingId of Object.keys(BUILDINGS)) {
      it(`has a component for building: ${buildingId}`, () => {
        expect(BUILDING_SPRITE_CATALOG[buildingId]).toBeDefined();
        expect(typeof BUILDING_SPRITE_CATALOG[buildingId]).toBe('function');
      });
    }
  });

  it('covers every era-specific pirate headquarters with neutral production art', () => {
    const expected = [
      'pirate_enclave_stage_1', 'pirate_enclave_stage_2', 'pirate_enclave_stage_3',
      'pirate_enclave_stage_4', 'pirate_enclave_stage_5',
      'pirate_flotilla_stage_2', 'pirate_flotilla_stage_3', 'pirate_flotilla_stage_4', 'pirate_flotilla_stage_5',
    ];
    expect(Object.keys(PIRATE_HEADQUARTERS_SPRITE_CATALOG).sort()).toEqual(expected.sort());
    for (const id of expected) {
      const svg = PIRATE_HEADQUARTERS_SPRITE_CATALOG[id as keyof typeof PIRATE_HEADQUARTERS_SPRITE_CATALOG]({ svgOnly: true });
      expect(svg).toContain('data-pirate-headquarters');
      expect(svg).toContain('viewBox="0 0 192 192"');
      expect(svg.length).toBeGreaterThan(900);
    }
  });
});
