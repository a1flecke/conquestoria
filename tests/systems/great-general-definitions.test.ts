import { describe, expect, it } from 'vitest';
import {
  GENERAL_DEFINITIONS,
  STANDARD_GENERAL_COMMAND_PROFILE,
  resolveGeneralDefinition,
} from '@/systems/great-general-definitions';
import type { GeneratedGeneralIdentity } from '@/core/types';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

function makeGeneratedIdentity(overrides: Partial<GeneratedGeneralIdentity> = {}): GeneratedGeneralIdentity {
  return {
    id: 'generated:rome:3:deadbeef',
    name: 'Marcus Valerius',
    civTypeEligibility: ['rome'],
    era: 3,
    descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
    portraitIcon: '🦅',
    origin: 'generated',
    ...STANDARD_GENERAL_COMMAND_PROFILE,
    abilityIds: [...STANDARD_GENERAL_COMMAND_PROFILE.abilityIds],
    ...overrides,
  };
}

describe('GENERAL_DEFINITIONS', () => {
  it('has at least one universal (civTypeEligibility: []) entry for custom/fantasy civs and adjacent-era fallback', () => {
    expect(GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.length === 0)).toBe(true);
  });

  it('has at least one historically/lore-eligible entry for every playable civ definition', () => {
    for (const civ of CIV_DEFINITIONS) {
      const hasEntry = GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.includes(civ.id));
      expect(hasEntry, `no General entry eligible for civ "${civ.id}"`).toBe(true);
    }
  });

  it('every entry has a unique id', () => {
    const ids = GENERAL_DEFINITIONS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has an era in range 1-12', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.era).toBeGreaterThanOrEqual(1);
      expect(g.era).toBeLessThanOrEqual(12);
    }
  });

  it('every entry has a non-empty descriptor and a non-empty portraitIcon', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.descriptor.length).toBeGreaterThan(0);
      expect(g.portraitIcon.length).toBeGreaterThan(0);
    }
  });

  it('every civTypeEligibility entry (when non-empty) references a real civ id', () => {
    const realCivIds = new Set(CIV_DEFINITIONS.map(c => c.id));
    for (const g of GENERAL_DEFINITIONS) {
      for (const civId of g.civTypeEligibility) {
        expect(realCivIds.has(civId), `"${g.id}" references unknown civ id "${civId}"`).toBe(true);
      }
    }
  });

  it('no display name collides with a building or trainable unit name (mirrors wonder-content.md\'s collision rule)', () => {
    const buildingNames = new Set(Object.values(BUILDINGS).map(b => b.name));
    const unitNames = new Set(TRAINABLE_UNITS.map(u => u.name));
    for (const g of GENERAL_DEFINITIONS) {
      expect(buildingNames.has(g.name), `"${g.name}" collides with a building name`).toBe(false);
      expect(unitNames.has(g.name), `"${g.name}" collides with a trainable unit name`).toBe(false);
    }
  });

  it('every commandRange and commandCapacity is a positive integer', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(Number.isInteger(g.commandRange)).toBe(true);
      expect(g.commandRange).toBeGreaterThan(0);
      expect(Number.isInteger(g.commandCapacity)).toBe(true);
      expect(g.commandCapacity).toBeGreaterThan(0);
    }
  });
});

describe('#544 MR4 — heroic command fields', () => {
  it('every General definition has a positive maxCommandCharges, positive cooldownTurns, and non-empty abilityIds', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.maxCommandCharges).toBeGreaterThan(0);
      expect(def.cooldownTurns).toBeGreaterThan(0);
      expect(def.abilityIds.length).toBeGreaterThan(0);
    }
  });

  it('every definition includes all three V1 abilities (contract §17: no per-definition ability variance yet)', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.abilityIds).toEqual(
        expect.arrayContaining(['rally', 'seize_the_moment', 'last_stand']),
      );
    }
  });

  it('V1 charge count is 3 lifetime charges (contract §17)', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.maxCommandCharges).toBe(3);
    }
  });
});

describe('#888 — STANDARD_GENERAL_COMMAND_PROFILE', () => {
  it('matches the uniform V1 authored profile (generated officers stay mechanically ordinary)', () => {
    const sample = GENERAL_DEFINITIONS[0]!;
    expect(STANDARD_GENERAL_COMMAND_PROFILE.commandRange).toBe(sample.commandRange);
    expect(STANDARD_GENERAL_COMMAND_PROFILE.commandCapacity).toBe(sample.commandCapacity);
    expect(STANDARD_GENERAL_COMMAND_PROFILE.maxCommandCharges).toBe(sample.maxCommandCharges);
    expect(STANDARD_GENERAL_COMMAND_PROFILE.cooldownTurns).toBe(sample.cooldownTurns);
    expect([...STANDARD_GENERAL_COMMAND_PROFILE.abilityIds].sort()).toEqual([...sample.abilityIds].sort());
    // every authored entry shares it (V1 "data coincidence" — see the definitions file)
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.commandRange).toBe(STANDARD_GENERAL_COMMAND_PROFILE.commandRange);
      expect(def.commandCapacity).toBe(STANDARD_GENERAL_COMMAND_PROFILE.commandCapacity);
      expect(def.cooldownTurns).toBe(STANDARD_GENERAL_COMMAND_PROFILE.cooldownTurns);
    }
  });

  it('authored roster entries carry no `origin` flag', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.origin).toBeUndefined();
    }
  });
});

describe('#888 — resolveGeneralDefinition', () => {
  it('resolves an authored id from the roster', () => {
    const resolved = resolveGeneralDefinition({}, 'gen_caesar');
    expect(resolved?.name).toBe('Julius Caesar');
  });

  it('resolves a generated id from the caller\'s generatedGenerals registry', () => {
    const identity = makeGeneratedIdentity();
    const resolved = resolveGeneralDefinition({ generatedGenerals: { [identity.id]: identity } }, identity.id);
    expect(resolved).toBe(identity);
    expect(resolved?.origin).toBe('generated');
  });

  it('returns undefined for an unknown id, a missing registry, and an undefined id', () => {
    expect(resolveGeneralDefinition({}, 'no-such-general')).toBeUndefined();
    expect(resolveGeneralDefinition({}, 'generated:rome:3:deadbeef')).toBeUndefined();
    expect(resolveGeneralDefinition(null, 'gen_caesar')?.name).toBe('Julius Caesar');
    expect(resolveGeneralDefinition(undefined, undefined)).toBeUndefined();
  });

  it('authored roster always wins over a colliding registry entry', () => {
    const impostor = makeGeneratedIdentity({ id: 'gen_caesar', name: 'Not Caesar' });
    const resolved = resolveGeneralDefinition({ generatedGenerals: { gen_caesar: impostor } }, 'gen_caesar');
    expect(resolved?.name).toBe('Julius Caesar');
  });
});
