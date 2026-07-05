import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  TRADE_TECHS,
  ALLIANCE_TECHS,
  NAP_TECHS,
  EMBARGO_TECHS,
  WRITING_TECHS,
} from '@/systems/diplomacy-system';
import { ESPIONAGE_TECH_MAX_SPIES } from '@/systems/espionage-system';
import { MELEE_RANGED_UNIT_TYPES, CAVALRY_UNIT_TYPES, SIEGE_UNIT_TYPES, BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_MODIFIERS } from '@/systems/unit-modifier-definitions';

const techIds = new Set(TECH_TREE.map(t => t.id));
const unitTypes = new Set(Object.keys(UNIT_DEFINITIONS));

describe('catalog-id-integrity', () => {
  describe('diplomacy tech gate lists reference real techs', () => {
    it.each([
      ['TRADE_TECHS', TRADE_TECHS],
      ['ALLIANCE_TECHS', ALLIANCE_TECHS],
      ['NAP_TECHS', NAP_TECHS],
      ['EMBARGO_TECHS', EMBARGO_TECHS],
      ['WRITING_TECHS', WRITING_TECHS],
    ])('every id in %s exists in TECH_TREE', (_name, ids) => {
      for (const id of ids) {
        expect(techIds.has(id)).toBe(true);
      }
    });
  });

  it('every id in ESPIONAGE_TECH_MAX_SPIES exists in TECH_TREE', () => {
    for (const id of Object.keys(ESPIONAGE_TECH_MAX_SPIES)) {
      expect(techIds.has(id)).toBe(true);
    }
  });

  describe('city-system discount unit lists reference real unit types', () => {
    it.each([
      ['MELEE_RANGED_UNIT_TYPES', MELEE_RANGED_UNIT_TYPES],
      ['CAVALRY_UNIT_TYPES', CAVALRY_UNIT_TYPES],
      ['SIEGE_UNIT_TYPES', SIEGE_UNIT_TYPES],
    ])('every id in %s exists in UNIT_DEFINITIONS', (_name, ids) => {
      for (const id of ids) {
        expect(unitTypes.has(id)).toBe(true);
      }
    });
  });

  describe('UNIT_MODIFIERS source ids reference real techs/national projects', () => {
    it('every tech source id exists in TECH_TREE', () => {
      for (const modifier of UNIT_MODIFIERS) {
        if (modifier.source.kind !== 'tech') continue;
        expect(techIds.has(modifier.source.id)).toBe(true);
      }
    });

    it('every nationalProject source id exists as a national-project building', () => {
      for (const modifier of UNIT_MODIFIERS) {
        if (modifier.source.kind !== 'nationalProject') continue;
        const building = BUILDINGS[modifier.source.id];
        expect(building?.nationalProject).toBeDefined();
      }
    });

    it('every unitTypes entry exists in UNIT_DEFINITIONS', () => {
      for (const modifier of UNIT_MODIFIERS) {
        for (const type of modifier.unitTypes ?? []) {
          expect(unitTypes.has(type)).toBe(true);
        }
      }
    });
  });
});
