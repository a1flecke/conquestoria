import { describe, expect, it } from 'vitest';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import {
  CULTURE_FAMILIES,
  GENERAL_FALLBACK_EPITHETS,
  GENERAL_FALLBACK_NAME_POOLS,
  GENERAL_FALLBACK_TITLES,
  MAX_FALLBACK_ATTEMPTS,
  generateFallbackGeneralCandidates,
  resolveCultureFamily,
  type GeneralCultureFamily,
} from '@/systems/great-general-fallback-content';

const ALL_FAMILIES = Object.keys(GENERAL_FALLBACK_NAME_POOLS) as GeneralCultureFamily[];

describe('#888 — fallback content tables', () => {
  it('maps every playable civ id to a real culture family', () => {
    for (const civ of CIV_DEFINITIONS) {
      const family = CULTURE_FAMILIES[civ.id];
      expect(family, `no culture family mapping for civ "${civ.id}"`).toBeDefined();
      expect(GENERAL_FALLBACK_NAME_POOLS[family!], `family "${family}" has no name pool`).toBeDefined();
    }
  });

  it('every family (incl. generic) has non-empty given/surname/title pools', () => {
    for (const family of ALL_FAMILIES) {
      expect(GENERAL_FALLBACK_NAME_POOLS[family].given.length, family).toBeGreaterThanOrEqual(6);
      expect(GENERAL_FALLBACK_NAME_POOLS[family].surname.length, family).toBeGreaterThanOrEqual(6);
      expect(GENERAL_FALLBACK_TITLES[family].length, family).toBeGreaterThanOrEqual(3);
    }
    expect(GENERAL_FALLBACK_EPITHETS.some(e => e === '')).toBe(true); // "no epithet" is reachable
  });

  it('has a generic family for unknown / future civ ids', () => {
    expect(resolveCultureFamily(undefined)).toBe('generic');
    expect(resolveCultureFamily('some-future-custom-civ')).toBe('generic');
    expect(GENERAL_FALLBACK_NAME_POOLS.generic).toBeDefined();
  });
});

describe('#888 — generateFallbackGeneralCandidates', () => {
  it('produces the requested count of unique, generated-origin identities with a standard profile', () => {
    const out = generateFallbackGeneralCandidates('game-abc', 'rome', 3, 5, 3, []);
    expect(out).toHaveLength(3);
    expect(new Set(out.map(g => g.id)).size).toBe(3);
    for (const g of out) {
      expect(g.origin).toBe('generated');
      expect(g.id.startsWith('generated:rome:3:')).toBe(true);
      expect(g.civTypeEligibility).toEqual(['rome']);
      expect(g.era).toBe(3);
      expect(g.maxCommandCharges).toBe(3);
      expect(g.commandRange).toBe(2);
      expect(g.commandCapacity).toBe(3);
      expect(g.abilityIds).toEqual(expect.arrayContaining(['rally', 'seize_the_moment', 'last_stand']));
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.portraitIcon.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic in id, name and order for identical inputs; differs when the context differs', () => {
    const a = generateFallbackGeneralCandidates('game-abc', 'rome', 3, 5, 3, []);
    const b = generateFallbackGeneralCandidates('game-abc', 'rome', 3, 5, 3, []);
    expect(a.map(g => g.id)).toEqual(b.map(g => g.id));
    expect(a.map(g => g.name)).toEqual(b.map(g => g.name));

    const otherGame = generateFallbackGeneralCandidates('game-xyz', 'rome', 3, 5, 3, []);
    const otherSeed = generateFallbackGeneralCandidates('game-abc', 'rome', 3, 6, 3, []);
    const otherEra = generateFallbackGeneralCandidates('game-abc', 'rome', 4, 5, 3, []);
    expect(otherGame.map(g => g.id)).not.toEqual(a.map(g => g.id));
    expect(otherSeed.map(g => g.id)).not.toEqual(a.map(g => g.id));
    expect(otherEra.map(g => g.id)).not.toEqual(a.map(g => g.id));
    // no cross-context id collisions
    const combined = [...a, ...otherGame, ...otherSeed, ...otherEra].map(g => g.id);
    expect(new Set(combined).size).toBe(combined.length);
  });

  it('uses the civ\'s mapped culture pool (historical vs lore)', () => {
    const roman = generateFallbackGeneralCandidates('g', 'rome', 3, 1, 3, []);
    const rohirric = generateFallbackGeneralCandidates('g', 'rohan', 4, 1, 3, []);
    const romanGivens = new Set(GENERAL_FALLBACK_NAME_POOLS.roman.given);
    const rohanGivens = new Set(GENERAL_FALLBACK_NAME_POOLS.rohirric.given);
    // the given-name portion of "Given Surname[...]" comes from the family pool
    expect(roman.every(g => romanGivens.has(g.name.split(' ')[0]!))).toBe(true);
    expect(rohirric.every(g => rohanGivens.has(g.name.split(' ')[0]!))).toBe(true);
  });

  it('an unknown civ falls back to the generic pool', () => {
    const out = generateFallbackGeneralCandidates('g', 'unknown-civ', 2, 1, 3, []);
    const genericGivens = new Set(GENERAL_FALLBACK_NAME_POOLS.generic.given);
    expect(out.every(g => genericGivens.has(g.name.split(' ')[0]!))).toBe(true);
    expect(out.every(g => g.id.startsWith('generated:unknown-civ:2:'))).toBe(true);
  });

  it('honours excludeIds — never returns an id already used/offered', () => {
    const first = generateFallbackGeneralCandidates('g', 'greece', 3, 9, 3, []);
    const exclude = first.map(g => g.id);
    const second = generateFallbackGeneralCandidates('g', 'greece', 3, 9, 3, exclude);
    expect(second.some(g => exclude.includes(g.id))).toBe(false);
    expect(second).toHaveLength(3);
  });

  it('never generates a name that collides with an authored general', () => {
    const authoredNames = new Set(GENERAL_DEFINITIONS.map(g => g.name));
    for (let seed = 0; seed < 60; seed++) {
      for (const civ of ['rome', 'egypt', 'mongolia', 'gondor', 'wakanda']) {
        const out = generateFallbackGeneralCandidates('g', civ, (seed % 8) + 1, seed, 3, []);
        for (const g of out) expect(authoredNames.has(g.name)).toBe(false);
      }
    }
  });

  it('descriptors carry no fact/number claims and differ from every authored descriptor', () => {
    const authoredDescriptors = new Set(GENERAL_DEFINITIONS.map(g => g.descriptor));
    const out = generateFallbackGeneralCandidates('g', 'persia', 3, 3, 3, []);
    for (const g of out) {
      expect(authoredDescriptors.has(g.descriptor)).toBe(false);
      expect(/\d/.test(g.descriptor)).toBe(false);
      expect(/\b(defeated|victor|conquered|crushed|routed|battle of)\b/i.test(g.descriptor)).toBe(false);
    }
  });

  it('terminates and stays unique under extreme exhaustion (huge excludeIds set)', () => {
    // Pre-exclude a very large deterministic swath, then still demand a full set.
    const bulk: string[] = [];
    for (let s = 0; s < 400; s++) {
      for (const g of generateFallbackGeneralCandidates('g', 'norse', 3, s, 3, [])) bulk.push(g.id);
    }
    const excludeSet = new Set(bulk);
    const start = Date.now();
    const out = generateFallbackGeneralCandidates('g', 'norse', 3, 999_999, 5, excludeSet);
    expect(Date.now() - start).toBeLessThan(2000); // no unbounded loop
    expect(out).toHaveLength(5);
    expect(new Set(out.map(g => g.id)).size).toBe(5);
    expect(out.some(g => excludeSet.has(g.id))).toBe(false);
    // the ordinal safety net may kick in — display names still render sanely
    for (const g of out) expect(g.name.length).toBeGreaterThan(0);
  });

  it('MAX_FALLBACK_ATTEMPTS is a small, sane bound', () => {
    expect(MAX_FALLBACK_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_FALLBACK_ATTEMPTS).toBeLessThanOrEqual(200);
  });

  it('content safety: no generated name matches a known modern/political/extremist figure (controlled-list check)', () => {
    // A cheap belt-and-suspenders sweep. The pools are period/fantasy fragments,
    // so this should never trip — it exists to catch a future careless pool edit.
    const FORBIDDEN = [
      'hitler', 'stalin', 'mao', 'pol pot', 'mussolini', 'himmler', 'goebbels',
      'bin laden', 'hussein', 'gaddafi', 'putin', 'trump', 'biden', 'napoleon bonaparte',
    ];
    const names: string[] = [];
    for (let seed = 0; seed < 120; seed++) {
      for (const civ of ['rome', 'germany', 'russia', 'ottoman', 'china', 'egypt', 'mongolia', 'unknown']) {
        for (const g of generateFallbackGeneralCandidates('g', civ, (seed % 10) + 1, seed, 3, [])) {
          names.push(g.name.toLowerCase());
        }
      }
    }
    for (const name of names) {
      for (const bad of FORBIDDEN) {
        expect(name.includes(bad), `generated name "${name}" contains forbidden "${bad}"`).toBe(false);
      }
    }
  });

  it('every family pool fragment is a plain human-readable string (no control chars / regex artefacts)', () => {
    for (const family of ALL_FAMILIES) {
      const pool = GENERAL_FALLBACK_NAME_POOLS[family];
      for (const frag of [...pool.given, ...pool.surname, ...GENERAL_FALLBACK_TITLES[family]]) {
        expect(typeof frag).toBe('string');
        expect(frag.trim().length).toBeGreaterThan(0);
        expect(/[\x00-\x1f]/.test(frag)).toBe(false);
      }
    }
  });
});
