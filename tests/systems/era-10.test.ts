import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { BUILDINGS } from '@/systems/city-system';
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';

const era10Techs = TECH_TREE.filter(t => t.era === 10);

describe('era 10 tech tree', () => {
  it('has exactly 30 era 10 techs', () => {
    expect(era10Techs).toHaveLength(30);
  });

  it('all era 10 techs have era === 10', () => {
    for (const t of era10Techs) {
      expect(t.era, `${t.id} wrong era`).toBe(10);
    }
  });

  it('all era 10 techs have cost in 280–300 range', () => {
    for (const t of era10Techs) {
      expect(t.cost, `${t.id} cost out of range`).toBeGreaterThanOrEqual(280);
      expect(t.cost, `${t.id} cost out of range`).toBeLessThanOrEqual(300);
    }
  });

  it('all 15 tracks have exactly 2 techs', () => {
    const tracks = new Map<string, number>();
    for (const t of era10Techs) {
      tracks.set(t.track, (tracks.get(t.track) ?? 0) + 1);
    }
    expect(tracks.size, 'expected 15 distinct tracks').toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 2 techs`).toBe(2);
    }
  });

  it('jet-aviation tech exists and unlocks jet_fighter', () => {
    const tech = era10Techs.find(t => t.id === 'jet-aviation');
    expect(tech, 'jet-aviation not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('jet_fighter');
  });

  it('carrier-warfare tech exists and unlocks carrier', () => {
    const tech = era10Techs.find(t => t.id === 'carrier-warfare');
    expect(tech, 'carrier-warfare not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('carrier');
  });

  it('nuclear-weapons tech unlocks nuclear_arsenal', () => {
    const tech = era10Techs.find(t => t.id === 'nuclear-weapons');
    expect(tech).toBeDefined();
    expect(tech!.unlocksBuildings).toContain('nuclear_arsenal');
  });
});

describe('era 10 jet_fighter unit', () => {
  it('jet_fighter has domain air', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.domain).toBe('air');
  });

  it('jet_fighter has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.visionRange).toBe(3);
  });

  it('jet_fighter has strength 50', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.strength).toBe(50);
  });

  it('jet_fighter has movementPoints 6', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.movementPoints).toBe(6);
  });
});

describe('era 10 carrier unit', () => {
  it('carrier has domain naval', () => {
    expect(UNIT_DEFINITIONS.carrier.domain).toBe('naval');
  });

  it('carrier has strength 30', () => {
    expect(UNIT_DEFINITIONS.carrier.strength).toBe(30);
  });

  it('carrier has movementPoints 4', () => {
    expect(UNIT_DEFINITIONS.carrier.movementPoints).toBe(4);
  });

  it('carrier has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.carrier.visionRange).toBe(3);
  });
});

describe('era 10 national projects', () => {
  it('manhattan_project exists and has uniquePerEmpire', () => {
    const np = BUILDINGS.manhattan_project;
    expect(np, 'manhattan_project not found').toBeDefined();
    expect(np.uniquePerEmpire).toBe(true);
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('manhattan_project total civYieldBonus <= 9', () => {
    const np = BUILDINGS.manhattan_project;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });

  it('postwar_reconstruction exists with homeEra 10', () => {
    const np = BUILDINGS.postwar_reconstruction;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('postwar_reconstruction each key <= 3', () => {
    const np = BUILDINGS.postwar_reconstruction;
    for (const [k, v] of Object.entries(np.civYieldBonus ?? {})) {
      expect(v as number, `postwar_reconstruction.${k} > 3`).toBeLessThanOrEqual(3);
    }
  });

  it('space_program_initiative exists with homeEra 10', () => {
    const np = BUILDINGS.space_program_initiative;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('space_program_initiative total civYieldBonus <= 9', () => {
    const np = BUILDINGS.space_program_initiative;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });
});

describe('era 10 united-nations wonder', () => {
  it('united-nations wonder exists', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    expect(w, 'united-nations wonder not found').toBeDefined();
  });

  it('united-nations has era 10', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    expect(w!.era).toBe(10);
  });

  it('united-nations civYieldBonus both keys <= 6', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    const bonus = w!.reward.civYieldBonus ?? {};
    for (const [k, v] of Object.entries(bonus)) {
      expect(v as number, `united-nations.${k} > 6`).toBeLessThanOrEqual(6);
    }
  });
});
