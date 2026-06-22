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

  it('every national project homeEra is in range 1–12', () => {
    for (const np of nationalProjects) {
      expect(np.nationalProject!.homeEra, `${np.id} homeEra out of range`).toBeGreaterThanOrEqual(1);
      expect(np.nationalProject!.homeEra, `${np.id} homeEra out of range`).toBeLessThanOrEqual(12);
    }
  });

  it('no national project has cityYieldBonus', () => {
    for (const np of nationalProjects) {
      expect((np as any).cityYieldBonus, `${np.id} must not have cityYieldBonus`).toBeUndefined();
    }
  });
});

describe('national project yield ceilings', () => {
  const ERA_CEILINGS: Record<number, number> = { 1: 2, 2: 2, 3: 5, 4: 5, 5: 7, 6: 7, 7: 9, 8: 9 };

  it('ceiling table covers eras 1–8', () => {
    expect(Object.keys(ERA_CEILINGS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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
