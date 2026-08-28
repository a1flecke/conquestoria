import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';
import { resolveSuperweaponContentDescription } from '@/systems/superweapon-content-honesty';
import type { GameState } from '@/core/types';

// Tripwire for MR12 (issue #471) — a curated denylist of phrases that named a
// nonexistent mechanic and were removed/rewritten in this MR. This is not a general
// NLP filter: it only guards the exact phrases known to have resurrected dead concepts.
// See .claude/rules/wonder-content.md-style "Adding New Content" checklists for the
// broader per-content-type honesty rules this test backstops.
const DENYLIST_PATTERNS: RegExp[] = [
  /enables air support/i,
  /decisive edge/i,
  /acts as strategic deterrent/i,
  /eliminates maintenance costs/i,
  /market manipulation/i,
  /2-hex protection bubble/i,
  /gunpowder units train faster/i,
  /units train with bonus strength/i,
  /early unit training costs reduced/i,
  // #524 MR2: air_force_command's +4 strength modifier only applies when the air
  // unit is attacking (unit-modifier-definitions.ts: when: 'attacking') — the old
  // "in combat" wording implied it also applied on defense, which it never has.
  /air units gain \+4 strength in combat/i,
  // #751: celestial-navigation used to be the only thing that gated ocean movement
  // (and only for Transport, via a hardcoded check) — now ocean access is a permanent
  // per-hull property (UnitDefinition.waterAccess) and celestial-navigation is a
  // production prerequisite instead. This phrase claimed a universal movement unlock
  // that was never true for any unit except Transport, and isn't true for anyone now.
  /units can cross ocean/i,
];

function collectStrings(): Array<{ source: string; text: string }> {
  const strings: Array<{ source: string; text: string }> = [];

  for (const tech of TECH_TREE) {
    for (const u of tech.unlocks) {
      strings.push({ source: `tech:${tech.id}.unlocks`, text: u });
    }
  }

  for (const building of Object.values(BUILDINGS)) {
    strings.push({ source: `building:${building.id}.description`, text: building.description });
  }

  for (const [unitType, text] of Object.entries(UNIT_DESCRIPTIONS)) {
    strings.push({ source: `unit:${unitType}`, text });
  }

  return strings;
}

describe('description honesty tripwire', () => {
  it('no tech.unlocks, Building.description, or UNIT_DESCRIPTIONS string names a removed dead mechanic', () => {
    const strings = collectStrings();
    const failures: string[] = [];

    for (const { source, text } of strings) {
      for (const pattern of DENYLIST_PATTERNS) {
        if (pattern.test(text)) {
          failures.push(`${source}: "${text}" matches denylisted pattern ${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('description honesty positive assertions (#545)', () => {
  it('missile_silo description honestly reflects its wired strategicLaunchPlatform + capacity effects', () => {
    const silo = BUILDINGS.missile_silo;
    expect(silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
    expect(silo.description).toContain('unlimited range');
  });

  it('missile_submarine description honestly reflects its wired strategicLaunchPlatform range', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(UNIT_DESCRIPTIONS.missile_submarine).toContain('4 hexes');
    expect(UNIT_DESCRIPTIONS.missile_submarine).not.toContain('Longest range of any unit');
  });
});

describe('superweapons off-mode description honesty (#545 MR7)', () => {
  function offState(): GameState {
    return { settings: { superweapons: 'off' } } as unknown as GameState;
  }
  function onState(): GameState {
    return { settings: { superweapons: 'on' } } as unknown as GameState;
  }

  it('missile_silo description drops all launch/capacity claims when superweapons is off, but keeps the real yield', () => {
    const real = BUILDINGS.missile_silo.description;
    const off = resolveSuperweaponContentDescription('missile_silo', real, offState());
    expect(off).not.toMatch(/launch|capacity|ICBM|intercontinental/i);
    expect(off).toContain('production');
    expect(resolveSuperweaponContentDescription('missile_silo', real, onState())).toBe(real);
  });

  it('manhattan_project description drops the capacity claim when superweapons is off', () => {
    const real = BUILDINGS.manhattan_project.description;
    const off = resolveSuperweaponContentDescription('manhattan_project', real, offState());
    expect(off).not.toMatch(/capacity|arsenal/i);
    expect(resolveSuperweaponContentDescription('manhattan_project', real, onState())).toBe(real);
  });

  it('missile_submarine description drops the launch claim when superweapons is off, but keeps the coastal-city requirement', () => {
    const real = UNIT_DESCRIPTIONS.missile_submarine;
    const off = resolveSuperweaponContentDescription('missile_submarine', real, offState());
    expect(off).not.toMatch(/launch|warhead|4 hexes/i);
    expect(off).toContain('coastal city');
    expect(resolveSuperweaponContentDescription('missile_submarine', real, onState())).toBe(real);
  });

  it('nuclear_arsenal, strategic_air_command, and arms_control_treaty are unaffected -- their real text was already honest with no capacity/launch claim', () => {
    for (const id of ['nuclear_arsenal', 'strategic_air_command', 'arms_control_treaty'] as const) {
      const real = BUILDINGS[id].description;
      expect(resolveSuperweaponContentDescription(id, real, offState())).toBe(real);
    }
  });
});
