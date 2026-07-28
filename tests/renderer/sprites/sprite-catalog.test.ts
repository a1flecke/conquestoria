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
import {
  JetFighterSprite, IroncladSprite, MachineGunnerSprite, MissionarySprite, SpyHackerSprite,
} from '@/renderer/sprites/units';
import {
  DataCenterSprite, CyberDefenseCenterSprite, AutomatedPortSprite, SignalsHubSprite,
  BroadcastTowerSprite, PrecisionFarmSprite, TelemedicineHubSprite, SmartGridSprite,
  RocketProgramSprite,
} from '@/renderer/sprites/buildings';

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

// #652: all 20 of these entries were temporary aliases to older-era sprites at Era 13
// launch (#515), replaced across two batches (A: 2026-07-26, B: 2026-07-27). Reject any
// regression back to that aliasing — if one of these ever starts rendering byte-identical
// output to the sprite it replaced, either the catalog line was reverted or a future edit
// accidentally reintroduced the old alias.
describe('Era 13 sprites are not aliases of their placeholders (#652)', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the placeholders they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['combat_drone', JetFighterSprite],
      ['autonomous_frigate', IroncladSprite],
      ['exosuit_infantry', MachineGunnerSprite],
      ['propagandist', MissionarySprite],
      ['drone_controller', SpyHackerSprite],
    ];
    for (const [type, placeholderFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const placeholder = placeholderFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old placeholder`).not.toBe(placeholder);
    }
  });

  it('building sprites are not the same component as the placeholders they replaced', () => {
    const replacements: Array<[keyof typeof BUILDING_SPRITE_CATALOG, unknown]> = [
      ['network_operations_center', DataCenterSprite],
      ['ai_safety_institute', CyberDefenseCenterSprite],
      ['drone_fabricator', AutomatedPortSprite],
      ['electronic_warfare_array', SignalsHubSprite],
      ['civic_media_forum', BroadcastTowerSprite],
      ['vertical_farm', PrecisionFarmSprite],
      ['neural_rehabilitation_center', TelemedicineHubSprite],
      ['ocean_robotics_yard', AutomatedPortSprite],
      ['circular_fabricator', SmartGridSprite],
      ['modular_arcology', DataCenterSprite],
      ['carbon_capture_grid', SmartGridSprite],
      ['immersive_arts_lab', BroadcastTowerSprite],
      ['national_ai_assurance_program', CyberDefenseCenterSprite],
      ['circular_manufacturing_network', SmartGridSprite],
      ['mars_robotics_initiative', RocketProgramSprite],
    ];
    for (const [id, placeholderFn] of replacements) {
      expect(BUILDING_SPRITE_CATALOG[id], `${id} still aliases its old placeholder component`).not.toBe(placeholderFn);
    }
  });
});

// The completeness tests above only check `typeof fn === 'function'` — they never call the
// function, so a runtime-only bug (a NaN from a bad coordinate calc, a property access that
// only fails for a specific palette's derived colors, etc.) would slip through undetected until
// a live crash. `yarn build`'s type-check caught the one real bug found while integrating Era 13
// batch A (an unjoined string[] passed as JSX children) — but tsc only catches type errors, not
// runtime ones. This actually renders every catalog entry, across multiple real faction
// palettes, matching the pattern already used for PIRATE_HEADQUARTERS_SPRITE_CATALOG above.
describe('every catalog sprite renders without throwing, across multiple factions', () => {
  const testFactions = ['#4a90d9', '#b8434a', '#3a6e94']; // arbitrary real civ colors, not the neutral palette

  it('every UNIT_SPRITE_CATALOG entry renders non-empty SVG markup for every test faction', () => {
    for (const civColor of testFactions) {
      const palette = derivePalette(civColor);
      for (const type of Object.keys(UNIT_SPRITE_CATALOG)) {
        let svg: string;
        expect(() => {
          svg = UNIT_SPRITE_CATALOG[type as keyof typeof UNIT_SPRITE_CATALOG]({ palette, svgOnly: true });
        }, `${type} threw for faction color ${civColor}`).not.toThrow();
        expect(svg!, `${type} produced no markup for faction color ${civColor}`).toContain('<svg');
        expect(svg!.length, `${type} produced suspiciously short markup for faction color ${civColor}`).toBeGreaterThan(100);
      }
    }
  });

  it('every BUILDING_SPRITE_CATALOG entry renders non-empty SVG markup for every test faction', () => {
    for (const civColor of testFactions) {
      const palette = derivePalette(civColor);
      for (const id of Object.keys(BUILDING_SPRITE_CATALOG)) {
        let svg: string;
        expect(() => {
          svg = BUILDING_SPRITE_CATALOG[id]({ palette, svgOnly: true });
        }, `${id} threw for faction color ${civColor}`).not.toThrow();
        expect(svg!, `${id} produced no markup for faction color ${civColor}`).toContain('<svg');
        expect(svg!.length, `${id} produced suspiciously short markup for faction color ${civColor}`).toBeGreaterThan(100);
      }
    }
  });
});
