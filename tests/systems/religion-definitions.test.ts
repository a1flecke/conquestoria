import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, BOON_DESCRIPTIONS } from '@/systems/religion-definitions';

describe('#591 MR4 — religion definitions', () => {
  it('has at least 2 name candidates for every playable civ id', () => {
    for (const civ of CIV_DEFINITIONS) {
      expect(NAME_CANDIDATES[civ.id]?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('has a non-empty neutral pool for custom civs', () => {
    expect(NEUTRAL_NAME_CANDIDATES.length).toBeGreaterThanOrEqual(2);
  });

  it('no candidate name matches a real-world major religion (spot check)', () => {
    const bannedSubstrings = ['christ', 'islam', 'muslim', 'buddh', 'hindu', 'judai', 'jewish', 'catholic', 'protestant'];
    const all = [...Object.values(NAME_CANDIDATES).flat(), ...NEUTRAL_NAME_CANDIDATES];
    for (const name of all) {
      const lower = name.toLowerCase();
      for (const banned of bannedSubstrings) {
        expect(lower).not.toContain(banned);
      }
    }
  });

  it('every name is unique across the whole table (no accidental duplicate faith names)', () => {
    const all = [...Object.values(NAME_CANDIDATES).flat(), ...NEUTRAL_NAME_CANDIDATES];
    expect(new Set(all).size).toBe(all.length);
  });

  it('fervor description mentions only conversion speed, not territory/loyalty (MR4 honesty)', () => {
    const lower = BOON_DESCRIPTIONS.fervor.toLowerCase();
    expect(lower).not.toMatch(/territory|loyalty|flip/);
  });
});
