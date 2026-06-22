import { describe, it, expect } from 'vitest';
import { WONDER_DEFINITIONS, getWonderDefinition } from '@/systems/wonder-definitions';
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';

const ALL_WONDER_DEFINITIONS = LEGENDARY_WONDER_DEFINITIONS;

describe('Wonder Definitions', () => {
  it('has exactly 15 wonders', () => {
    expect(WONDER_DEFINITIONS).toHaveLength(15);
  });

  it('all wonders have unique IDs', () => {
    const ids = WONDER_DEFINITIONS.map(w => w.id);
    expect(new Set(ids).size).toBe(15);
  });

  it('all wonders have valid terrain types', () => {
    const validTerrains = ['grassland', 'plains', 'desert', 'tundra', 'snow', 'forest', 'hills', 'mountain', 'ocean', 'coast', 'jungle', 'swamp', 'volcanic'];
    for (const w of WONDER_DEFINITIONS) {
      expect(w.validTerrain.length).toBeGreaterThan(0);
      for (const t of w.validTerrain) {
        expect(validTerrains).toContain(t);
      }
    }
  });

  it('all wonders have non-zero yields or discovery bonus', () => {
    for (const w of WONDER_DEFINITIONS) {
      const totalYields = w.yields.food + w.yields.production + w.yields.gold + w.yields.science;
      const hasBonus = w.discoveryBonus.amount > 0;
      expect(totalYields > 0 || hasBonus).toBe(true);
    }
  });

  it('getWonderDefinition returns correct wonder by ID', () => {
    const wonder = getWonderDefinition('great_volcano');
    expect(wonder).toBeDefined();
    expect(wonder!.name).toBe('Great Volcano');
  });

  it('getWonderDefinition returns undefined for unknown ID', () => {
    expect(getWonderDefinition('nonexistent')).toBeUndefined();
  });
});

const RELOCATED_STUB_IDS = new Set([
  'global-logistics', 'nuclear-theory', 'mass-media',
  'digital-surveillance', 'cyber-warfare', 'amphibious-warfare',
]);

describe('era <= 7 wonders do not reference relocated tech stubs', () => {
  const activeWonders = ALL_WONDER_DEFINITIONS.filter(w => w.era <= 7);
  for (const w of activeWonders) {
    it(`${w.id} uses no relocated tech IDs`, () => {
      for (const techId of w.requiredTechs) {
        expect(RELOCATED_STUB_IDS.has(techId), `${w.id} references relocated ${techId}`).toBe(false);
      }
    });
  }
});

describe('era 7 legendary wonder coverage', () => {
  const era7 = ALL_WONDER_DEFINITIONS.filter(w => w.era === 7);

  it('has exactly 3 era 7 legendary wonders', () => {
    expect(era7).toHaveLength(3);
  });

  it('crystal-palace civYieldBonus matches definition', () => {
    const w = era7.find(w => w.id === 'crystal-palace');
    expect(w?.reward.civYieldBonus).toEqual({ production: 5, science: 1 });
  });

  it('suez-canal civYieldBonus matches definition', () => {
    const w = era7.find(w => w.id === 'suez-canal');
    expect(w?.reward.civYieldBonus).toEqual({ gold: 6 });
  });

  it('continental-congress civYieldBonus matches definition', () => {
    const w = era7.find(w => w.id === 'continental-congress');
    expect(w?.reward.civYieldBonus).toEqual({ science: 4, gold: 2 });
  });
});

describe('wonder yield ceilings', () => {
  for (const w of ALL_WONDER_DEFINITIONS) {
    it(`${w.id} civYieldBonus single key <= 6`, () => {
      for (const [k, v] of Object.entries(w.reward.civYieldBonus ?? {}) as [string, number][]) {
        expect(v, `${w.id}.${k} = ${v} > 6`).toBeLessThanOrEqual(6);
      }
    });
    it(`${w.id} civYieldBonus has <= 2 keys`, () => {
      expect(Object.keys(w.reward.civYieldBonus ?? {}).length).toBeLessThanOrEqual(2);
    });
    it(`${w.id} cityYieldBonus single key <= 4`, () => {
      for (const [k, v] of Object.entries(w.reward.cityYieldBonus ?? {}) as [string, number][]) {
        expect(v, `${w.id}.${k} = ${v} > 4`).toBeLessThanOrEqual(4);
      }
    });
  }
});
