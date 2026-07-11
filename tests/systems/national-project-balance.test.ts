import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';

// Per-city/per-route allowlist — must match .claude/rules/game-balance.md
const PER_CITY_ALLOWLIST = new Set(['grand_bazaar', 'colonial_administration']);

const nationalProjects = Object.values(BUILDINGS).filter(b => b.nationalProject);

describe('national project structural invariants', () => {
  it('every national project has uniquePerEmpire: true', () => {
    for (const np of nationalProjects) {
      expect(np.uniquePerEmpire, `${np.id} missing uniquePerEmpire`).toBe(true);
    }
  });

  it('every national project has a positive authored home era', () => {
    for (const np of nationalProjects) {
      expect(np.nationalProject!.homeEra, `${np.id} homeEra out of range`).toBeGreaterThanOrEqual(1);
    }
  });

  it('no national project has cityYieldBonus', () => {
    for (const np of nationalProjects) {
      expect((np as any).cityYieldBonus, `${np.id} must not have cityYieldBonus`).toBeUndefined();
    }
  });
});

describe('national project yield ceilings', () => {
  const ERA_CEILINGS: Record<number, number> = { 1: 2, 2: 2, 3: 5, 4: 5, 5: 7, 6: 7, 7: 9, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9 };

  it('ceiling table covers eras 1–12', () => {
    expect(Object.keys(ERA_CEILINGS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  for (const np of nationalProjects) {
    const era = np.nationalProject!.homeEra;
    const ceiling = ERA_CEILINGS[era] ?? 9;
    const bonus = np.civYieldBonus ?? {};
    const values = Object.values(bonus).filter((v): v is number => typeof v === 'number');

    it(`${np.id} (era ${era}) total civYieldBonus <= era ceiling ${ceiling}`, () => {
      if (PER_CITY_ALLOWLIST.has(np.id)) return; // dynamic scaling, exempt from static ceiling
      const total = values.reduce((a, b) => a + b, 0);
      expect(total, `${np.id} total ${total} > era ${era} ceiling ${ceiling}`).toBeLessThanOrEqual(ceiling);
    });

    it(`${np.id} with two keys: neither exceeds 3`, () => {
      if (values.length < 2) return;
      for (const [k, v] of Object.entries(bonus) as [string, number][]) {
        expect(v, `${np.id}.${k} = ${v} exceeds two-key max 3`).toBeLessThanOrEqual(3);
      }
    });
  }
});

describe('era 7 national project coverage', () => {
  const era7NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 7);

  it('has exactly 3 era 7 national projects', () => {
    expect(era7NPs).toHaveLength(3);
  });

  it('grand_arsenal has single production civYieldBonus', () => {
    const np = era7NPs.find(np => np.id === 'grand_arsenal');
    expect(np?.civYieldBonus).toEqual({ production: 5 });
  });

  it('peoples_university has single science civYieldBonus', () => {
    const np = era7NPs.find(np => np.id === 'peoples_university');
    expect(np?.civYieldBonus).toEqual({ science: 5 });
  });

  it('national_railway has single gold civYieldBonus', () => {
    const np = era7NPs.find(np => np.id === 'national_railway');
    expect(np?.civYieldBonus).toEqual({ gold: 4 });
  });
});

describe('era 9 national project coverage', () => {
  const era9NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 9);

  it('has exactly 4 era 9 national projects', () => {
    expect(era9NPs).toHaveLength(4);
  });

  it('air_force_command has dual production+science civYieldBonus within era-9 ceiling', () => {
    const np = era9NPs.find(np => np.id === 'air_force_command');
    expect(np?.civYieldBonus).toEqual({ production: 3, science: 2 });
    // Each key ≤ 3, total 5 ≤ 9 (era 9 ceiling)
    expect((np?.civYieldBonus?.production ?? 0) + (np?.civYieldBonus?.science ?? 0)).toBeLessThanOrEqual(9);
  });
});

describe('era 10 national project coverage', () => {
  const era10NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 10);

  it('has exactly 3 era 10 national projects', () => {
    expect(era10NPs).toHaveLength(3);
  });

  it('manhattan_project has single production civYieldBonus', () => {
    const np = era10NPs.find(np => np.id === 'manhattan_project');
    expect(np?.civYieldBonus).toEqual({ production: 6 });
  });

  it('postwar_reconstruction has dual gold+food civYieldBonus within era-10 ceiling', () => {
    const np = era10NPs.find(np => np.id === 'postwar_reconstruction');
    expect(np?.civYieldBonus).toEqual({ gold: 3, food: 3 });
    expect((np?.civYieldBonus?.gold ?? 0) + (np?.civYieldBonus?.food ?? 0)).toBeLessThanOrEqual(9);
  });

  it('space_program_initiative has single science civYieldBonus', () => {
    const np = era10NPs.find(np => np.id === 'space_program_initiative');
    expect(np?.civYieldBonus).toEqual({ science: 6 });
  });
});

describe('era 11 national project coverage', () => {
  const era11NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 11);

  it('has exactly 3 era 11 national projects', () => {
    expect(era11NPs).toHaveLength(3);
  });

  it('arms_control_treaty has single gold civYieldBonus', () => {
    const np = era11NPs.find(np => np.id === 'arms_control_treaty');
    expect(np?.civYieldBonus).toEqual({ gold: 5 });
  });

  it('green_revolution_program has single food civYieldBonus', () => {
    const np = era11NPs.find(np => np.id === 'green_revolution_program');
    expect(np?.civYieldBonus).toEqual({ food: 5 });
  });

  it('strategic_air_command has single production civYieldBonus', () => {
    const np = era11NPs.find(np => np.id === 'strategic_air_command');
    expect(np?.civYieldBonus).toEqual({ production: 6 });
  });
});

describe('era 12 national project coverage (MR11)', () => {
  const era12NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 12);

  it('has exactly 3 era 12 national projects', () => {
    expect(era12NPs).toHaveLength(3);
  });

  it('planetary_data_grid has single science civYieldBonus', () => {
    const np = era12NPs.find(np => np.id === 'planetary_data_grid');
    expect(np?.civYieldBonus).toEqual({ science: 6 });
  });

  it('global_logistics_network has single gold civYieldBonus', () => {
    const np = era12NPs.find(np => np.id === 'global_logistics_network');
    expect(np?.civYieldBonus).toEqual({ gold: 6 });
  });

  it('orbital_fabrication_program has single production civYieldBonus', () => {
    const np = era12NPs.find(np => np.id === 'orbital_fabrication_program');
    expect(np?.civYieldBonus).toEqual({ production: 6 });
  });
});
