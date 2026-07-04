import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { ERA_NAMES } from '@/ui/tech-panel';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_SFX } from '@/audio/sfx-catalog';

const era12Techs = TECH_TREE.filter(t => t.era === 12);

describe('era 12 tech tree', () => {
  it('has exactly 30 era 12 techs', () => {
    expect(era12Techs).toHaveLength(30);
  });

  it('all era 12 techs have era === 12', () => {
    for (const t of era12Techs) {
      expect(t.era, `${t.id} wrong era`).toBe(12);
    }
  });

  it('all era 12 techs cost in 380–420 range', () => {
    for (const t of era12Techs) {
      expect(t.cost, `${t.id} cost out of range`).toBeGreaterThanOrEqual(380);
      expect(t.cost, `${t.id} cost out of range`).toBeLessThanOrEqual(420);
    }
  });

  it('all 15 tracks have exactly 2 techs', () => {
    const tracks = new Map<string, number>();
    for (const t of era12Techs) {
      tracks.set(t.track, (tracks.get(t.track) ?? 0) + 1);
    }
    expect(tracks.size, 'expected 15 distinct tracks').toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 2 techs`).toBe(2);
    }
  });

  it('cyber-warfare unlocks cyber_unit', () => {
    const tech = era12Techs.find(t => t.id === 'cyber-warfare');
    expect(tech).toBeDefined();
    expect(tech!.unlocksUnits).toContain('cyber_unit');
  });

  it('stealth-technology unlocks stealth_bomber and stealth_airbase', () => {
    const tech = era12Techs.find(t => t.id === 'stealth-technology');
    expect(tech!.unlocksUnits).toContain('stealth_bomber');
    expect(tech!.unlocksBuildings).toContain('stealth_airbase');
  });

  it('internet unlocks cyber_defense_center', () => {
    const tech = era12Techs.find(t => t.id === 'internet');
    expect(tech!.unlocksBuildings).toContain('cyber_defense_center');
  });

  it('no unlocks entry is a bare building id or unit type', () => {
    const buildingIds = new Set(Object.keys(BUILDINGS));
    const unitTypes = new Set(TRAINABLE_UNITS.map(u => u.type));
    for (const t of era12Techs) {
      for (const entry of t.unlocks ?? []) {
        expect(buildingIds.has(entry), `tech ${t.id} unlocks entry "${entry}" is a bare building id`).toBe(false);
        expect(unitTypes.has(entry as any), `tech ${t.id} unlocks entry "${entry}" is a bare unit type`).toBe(false);
      }
    }
  });
});

describe('era 12 units — spec stats', () => {
  it('cyber_unit has strength 0, movementPoints 3, productionCost 120', () => {
    const def = UNIT_DEFINITIONS['cyber_unit'];
    expect(def.strength).toBe(0);
    expect(def.movementPoints).toBe(3);
    expect(def.productionCost).toBe(120);
    expect(def.domain ?? 'land').toBe('land');
  });

  it('stealth_bomber has strength 52, movementPoints 5, productionCost 360, range 3', () => {
    const def = UNIT_DEFINITIONS['stealth_bomber'];
    expect(def.strength).toBe(52);
    expect(def.movementPoints).toBe(5);
    expect(def.productionCost).toBe(360);
    expect((def as any).attackProfile?.range).toBe(3);
  });

  it('cyber_unit in TRAINABLE_UNITS gated by cyber-warfare, no trainedFromBuilding', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'cyber_unit');
    expect(entry).toBeDefined();
    expect(entry!.techRequired).toBe('cyber-warfare');
    expect(entry!.trainedFromBuilding).toBeUndefined();
    expect(entry!.cost).toBe(120);
  });

  it('stealth_bomber TRAINABLE_UNITS cost updated to 360', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'stealth_bomber');
    expect(entry!.cost).toBe(360);
  });
});

describe('era 12 units — SFX catalog', () => {
  it('stealth_bomber has ranged-loose, ranged-impact, and death SFX', () => {
    const sfx = UNIT_SFX['stealth_bomber'];
    expect(sfx).toBeDefined();
    expect(sfx!['ranged-loose']).toBeDefined();
    expect(sfx!['ranged-impact']).toBeDefined();
    expect(sfx!['death']).toBeDefined();
  });

  it('cyber_unit has death SFX', () => {
    expect(UNIT_SFX['cyber_unit']?.['death']).toBeDefined();
  });
});

describe('ERA_NAMES', () => {
  it('ERA_NAMES[12] returns Information Age', () => {
    expect(ERA_NAMES[12]).toBe('Information Age');
  });
  it('ERA_NAMES[8] through [11] are all defined', () => {
    for (const era of [8, 9, 10, 11]) {
      expect(ERA_NAMES[era], `ERA_NAMES[${era}] missing`).toBeDefined();
    }
  });
});
