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
