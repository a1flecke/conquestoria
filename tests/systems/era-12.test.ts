import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { ERA_NAMES } from '@/ui/tech-panel';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

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
