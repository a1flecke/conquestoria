import { describe, it, expect } from 'vitest';
import { WONDER_DEFINITIONS, getWonderDefinition } from '@/systems/wonder-definitions';
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';
import { BUILDINGS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';

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

describe('era <= 9 wonders do not reference relocated tech stubs', () => {
  // storm-signal-spire (era 9) intentionally references future-era tech stubs — excluded from this guard.
  const activeWonders = ALL_WONDER_DEFINITIONS.filter(w => w.era <= 9 && w.id !== 'storm-signal-spire');
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

describe('era 8 legendary wonder coverage', () => {
  const era8 = ALL_WONDER_DEFINITIONS.filter(w => w.era === 8);

  it('has exactly 3 era 8 legendary wonders', () => {
    expect(era8).toHaveLength(3);
  });

  it('eiffel-tower civYieldBonus matches definition', () => {
    const w = era8.find(w => w.id === 'eiffel-tower');
    expect(w?.reward.civYieldBonus).toEqual({ gold: 5, production: 1 });
  });

  it('brooklyn-bridge civYieldBonus matches definition', () => {
    const w = era8.find(w => w.id === 'brooklyn-bridge');
    expect(w?.reward.civYieldBonus).toEqual({ production: 4, food: 2 });
  });

  it('trans-siberian-railway civYieldBonus matches definition', () => {
    const w = era8.find(w => w.id === 'trans-siberian-railway');
    expect(w?.reward.civYieldBonus).toEqual({ production: 6 });
  });
});

describe('era 9 legendary wonder coverage', () => {
  const era9 = ALL_WONDER_DEFINITIONS.filter(w => w.era === 9);

  it('has exactly 5 era 9 legendary wonders (4 new + storm-signal-spire)', () => {
    expect(era9).toHaveLength(5);
  });

  it('panama-canal civYieldBonus matches definition', () => {
    const w = era9.find(w => w.id === 'panama-canal');
    expect(w?.reward.civYieldBonus).toEqual({ gold: 6 });
  });

  it('empire-state-building civYieldBonus matches definition', () => {
    const w = era9.find(w => w.id === 'empire-state-building');
    expect(w?.reward.civYieldBonus).toEqual({ production: 4, gold: 3 });
  });

  it('hoover-dam civYieldBonus matches definition', () => {
    const w = era9.find(w => w.id === 'hoover-dam');
    expect(w?.reward.civYieldBonus).toEqual({ food: 4, production: 3 });
  });

  it('wright-flyer civYieldBonus matches definition', () => {
    const w = era9.find(w => w.id === 'wright-flyer');
    expect(w?.reward.civYieldBonus).toEqual({ science: 4, production: 2 });
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

// MR10: manhattan_project (national project) and internet (tech) were renamed to
// disambiguate from the legendary wonders of the same original name.
describe('MR10 — name collision regression lock', () => {
  it('BUILDINGS.manhattan_project display name differs from the legendary wonder name', () => {
    const legendary = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'manhattan-project')!;
    expect(BUILDINGS.manhattan_project.name).not.toBe(legendary.name);
    expect(legendary.name).toBe('Manhattan Project');
    expect(BUILDINGS.manhattan_project.name).toBe('Atomic Weapons Program');
  });

  it('the internet tech display name differs from the legendary wonder name', () => {
    const legendary = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'internet')!;
    const tech = TECH_TREE.find(t => t.id === 'internet')!;
    expect(tech.name).not.toBe(legendary.name);
    expect(legendary.name).toBe('Internet');
    expect(tech.name).toBe('Internet Protocols');
  });
});
