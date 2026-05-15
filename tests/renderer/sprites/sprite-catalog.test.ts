import { describe, it, expect } from 'vitest';
import { UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDINGS } from '@/systems/city-system';

const ALL_UNIT_TYPES = [
  'settler', 'worker', 'scout', 'warrior', 'archer',
  'swordsman', 'pikeman', 'musketeer', 'galley', 'trireme',
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
  'scout_hound', 'shadow_warden', 'war_hound',
] as const;

describe('sprite-catalog coverage', () => {
  describe('UNIT_SPRITE_CATALOG', () => {
    for (const unitType of ALL_UNIT_TYPES) {
      it(`has a component for unit type: ${unitType}`, () => {
        expect(UNIT_SPRITE_CATALOG[unitType]).toBeDefined();
        expect(typeof UNIT_SPRITE_CATALOG[unitType]).toBe('function');
      });
    }

    it('every unit sprite returns distinct moving output', () => {
      const palette = derivePalette('#4a90d9');
      for (const [type, render] of Object.entries(UNIT_SPRITE_CATALOG)) {
        const idle = render({ palette, svgOnly: true, motion: 'idle' });
        const movingA = render({ palette, svgOnly: true, motion: 'move-a' });
        const movingB = render({ palette, svgOnly: true, motion: 'move-b' });
        expect(idle, `${type} idle sprite`).toContain('data-motion="idle"');
        expect(movingA, `${type} move-a sprite`).toContain('data-motion="move-a"');
        expect(movingB, `${type} move-b sprite`).toContain('data-motion="move-b"');
        expect(movingA, `${type} move-a differs from idle`).not.toBe(idle);
        expect(movingB, `${type} move-b differs from move-a`).not.toBe(movingA);
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
});
