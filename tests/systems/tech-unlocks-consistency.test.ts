import { describe, expect, it } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

describe('tech.unlocks copy matches gameplay gating', () => {
  it('every "Unlock <Name> building" claim corresponds to a building gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const u of tech.unlocks) {
        const m = u.match(/^Unlock (.+?) building$/);
        if (!m) continue;
        const name = m[1];
        const building = Object.values(BUILDINGS).find(b => b.name === name);
        if (!building) {
          failures.push(`${tech.id}: claims "${u}" but no building named "${name}" exists`);
          continue;
        }
        if (building.techRequired !== tech.id) {
          failures.push(`${tech.id}: claims "${u}" but ${building.id}.techRequired is ${building.techRequired}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every "Unlock <Name> unit" claim corresponds to a trainable unit gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const u of tech.unlocks) {
        const m = u.match(/^Unlock (.+?) unit$/);
        if (!m) continue;
        const name = m[1];
        const unit = TRAINABLE_UNITS.find(t => t.name === name);
        if (!unit) {
          failures.push(`${tech.id}: claims "${u}" but no trainable unit named "${name}" exists`);
          continue;
        }
        if (unit.techRequired !== tech.id) {
          failures.push(`${tech.id}: claims "${u}" but ${unit.type}.techRequired is ${unit.techRequired}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('tech structured unlock arrays', () => {
  it('every unlocksUnits entry is a trainable unit gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const unitType of tech.unlocksUnits ?? []) {
        const unit = TRAINABLE_UNITS.find(u => u.type === unitType);
        if (!unit) {
          failures.push(`${tech.id}.unlocksUnits: '${unitType}' is not a known trainable unit`);
          continue;
        }
        if (unit.techRequired !== tech.id) {
          failures.push(
            `${tech.id}.unlocksUnits: '${unitType}' has techRequired '${unit.techRequired}', not '${tech.id}'`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every unlocksBuildings entry is a building gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const buildingId of tech.unlocksBuildings ?? []) {
        const building = BUILDINGS[buildingId];
        if (!building) {
          failures.push(`${tech.id}.unlocksBuildings: '${buildingId}' is not a known building`);
          continue;
        }
        if (building.techRequired !== tech.id) {
          failures.push(
            `${tech.id}.unlocksBuildings: '${buildingId}' has techRequired '${building.techRequired}', not '${tech.id}'`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every tech-gated trainable unit appears in its tech unlocksUnits', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    const failures: string[] = [];
    for (const unit of TRAINABLE_UNITS) {
      if (!unit.techRequired) continue;
      if (unit.civTypeRequired) continue; // civ-specific replacements handled by civ-definition tests
      const tech = techMap.get(unit.techRequired);
      if (!tech) {
        failures.push(`unit '${unit.type}' references unknown tech '${unit.techRequired}'`);
        continue;
      }
      if (!(tech.unlocksUnits ?? []).includes(unit.type)) {
        failures.push(
          `unit '${unit.type}' is gated by '${unit.techRequired}' but missing from that tech's unlocksUnits`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('every tech-gated building appears in its tech unlocksBuildings', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    const failures: string[] = [];
    for (const [buildingId, building] of Object.entries(BUILDINGS)) {
      if (!building.techRequired) continue;
      const tech = techMap.get(building.techRequired);
      if (!tech) {
        failures.push(`building '${buildingId}' references unknown tech '${building.techRequired}'`);
        continue;
      }
      if (!(tech.unlocksBuildings ?? []).includes(buildingId)) {
        failures.push(
          `building '${buildingId}' is gated by '${building.techRequired}' but missing from that tech's unlocksBuildings`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
