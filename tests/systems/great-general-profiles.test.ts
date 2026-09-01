import { describe, expect, it } from 'vitest';
import {
  GENERAL_PROFILES,
  GAME_ORIGINAL_LORE_IDS,
  getGeneralProfile,
  type GeneralProfile,
} from '@/systems/great-general-profiles';
import {
  GENERAL_DEFINITIONS,
  STANDARD_GENERAL_COMMAND_PROFILE,
  resolveGeneralDefinition,
} from '@/systems/great-general-definitions';
import type { GeneratedGeneralIdentity } from '@/core/types';

/**
 * #886 — the authoritative historical-vs-lore classification of the authored
 * roster. A NEW authored `GENERAL_DEFINITIONS` entry MUST be added here (and
 * given a profile) or the "covers exactly the roster" test fails — this is the
 * "fail loudly until content policy is decided" gate from issue #886 Phase 18.
 */
const EXPECTED_KIND: Readonly<Record<string, 'historical' | 'lore'>> = {
  // real historical figures
  gen_ramesses: 'historical',
  gen_caesar: 'historical',
  gen_alexander: 'historical',
  gen_genghis: 'historical',
  gen_nebuchadnezzar: 'historical',
  gen_cyrus: 'historical',
  gen_chandragupta: 'historical',
  gen_hannibal: 'historical',
  gen_yuefei: 'historical',
  gen_shaka: 'historical',
  gen_wellington: 'historical',
  gen_napoleon: 'historical',
  gen_frederick: 'historical',
  gen_suvorov: 'historical',
  gen_mehmed: 'historical',
  gen_cuauhtemoc: 'historical',
  gen_tokugawa: 'historical',
  gen_elcid: 'historical',
  // fictional / legendary. Ragnar is deliberately 'lore': his historicity as a
  // single person is unproven (Britannica classifies him under /topic/, not a
  // biography), so #886 frames him as legend with `loreWork` + sources that
  // document the legend and the debate.
  gen_ragnar: 'lore',
  gen_boromir: 'lore',
  gen_eomer: 'lore',
  gen_merry: 'lore',
  gen_ugluk: 'lore',
  gen_gwydion: 'lore',
  gen_hornedking: 'lore',
  gen_okoye: 'lore',
  gen_lancelot: 'lore',
  gen_haldir: 'lore',
  gen_oreius: 'lore',
  gen_thessaly: 'lore',
  gen_universal_marshal: 'lore',
  gen_universal_warlord: 'lore',
  gen_universal_field_marshal: 'lore',
  gen_universal_commodore: 'lore',
};

const authoredIds = GENERAL_DEFINITIONS.map(g => g.id);
const profileEntries = Object.entries(GENERAL_PROFILES) as [string, GeneralProfile][];

// Any C0 control char or DEL — none should appear in this editorial copy.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

function makeGeneratedIdentity(overrides: Partial<GeneratedGeneralIdentity> = {}): GeneratedGeneralIdentity {
  return {
    id: 'generated:egypt:2:cafef00d',
    name: 'Userhat of Waset',
    civTypeEligibility: ['egypt'],
    era: 2,
    descriptor: 'Overseer of the Host. An Egyptian field commander, risen through the ranks of the host.',
    portraitIcon: '☀️',
    origin: 'generated',
    ...STANDARD_GENERAL_COMMAND_PROFILE,
    abilityIds: [...STANDARD_GENERAL_COMMAND_PROFILE.abilityIds],
    ...overrides,
  };
}

describe('#886 — GENERAL_PROFILES catalog coverage', () => {
  it('has a profile for every authored General definition', () => {
    for (const id of authoredIds) {
      expect(getGeneralProfile(id), `no profile for authored General "${id}"`).toBeDefined();
    }
  });

  it('has no profile keys that are not authored General ids', () => {
    for (const [id] of profileEntries) {
      expect(authoredIds, `profile "${id}" is not an authored General`).toContain(id);
    }
  });

  it('EXPECTED_KIND covers exactly the authored roster (new roster entry fails until classified + given content)', () => {
    expect(new Set(Object.keys(EXPECTED_KIND))).toEqual(new Set(authoredIds));
  });

  it('every profile kind matches the authoritative classification', () => {
    for (const [id, profile] of profileEntries) {
      expect(profile.kind, `"${id}" classified wrong`).toBe(EXPECTED_KIND[id]);
    }
  });
});

describe('#886 — profile prose shape (readable for ages ~7–43)', () => {
  for (const [id, profile] of profileEntries) {
    it(`${id}: summary is a clean, bounded sentence block`, () => {
      expect(profile.summary).toBe(profile.summary.trim());
      expect(profile.summary.length).toBeGreaterThan(0);
      expect(profile.summary.length).toBeLessThanOrEqual(400);
      expect(CONTROL_CHARS.test(profile.summary)).toBe(false);
      expect(profile.summary).not.toMatch(/\s{2,}/);
      expect(profile.summary).not.toMatch(/https?:\/\//);
      // starts like a sentence
      expect(profile.summary[0]).toBe(profile.summary[0]!.toUpperCase());
    });

    it(`${id}: has 2–4 facts, each a clean bounded sentence`, () => {
      expect(profile.facts.length).toBeGreaterThanOrEqual(2);
      expect(profile.facts.length).toBeLessThanOrEqual(4);
      for (const fact of profile.facts) {
        expect(fact).toBe(fact.trim());
        expect(fact.length).toBeGreaterThan(0);
        expect(fact.length).toBeLessThanOrEqual(240);
        expect(CONTROL_CHARS.test(fact)).toBe(false);
        expect(fact).not.toMatch(/\s{2,}/);
        expect(fact).not.toMatch(/https?:\/\//);
        expect(fact.endsWith('.')).toBe(true);
      }
    });

    it(`${id}: context, when present, is clean and bounded`, () => {
      if (profile.context === undefined) return;
      expect(profile.context).toBe(profile.context.trim());
      expect(profile.context.length).toBeGreaterThan(0);
      expect(profile.context.length).toBeLessThanOrEqual(400);
      expect(CONTROL_CHARS.test(profile.context)).toBe(false);
      expect(profile.context).not.toMatch(/\s{2,}/);
      expect(profile.context).not.toMatch(/https?:\/\//);
    });
  }
});

describe('#886 — historical profiles carry real provenance', () => {
  const historical = profileEntries.filter(([, p]) => p.kind === 'historical');

  it('there is a meaningful body of historical content', () => {
    expect(historical.length).toBeGreaterThanOrEqual(18);
  });

  for (const [id, profile] of historical) {
    it(`${id}: >= 2 authoritative sources and no loreWork`, () => {
      expect(profile.sources.length).toBeGreaterThanOrEqual(2);
      expect(profile.loreWork).toBeUndefined();
    });

    it(`${id}: every source note is well-formed (https, real date, non-empty fields)`, () => {
      for (const src of profile.sources) {
        expect(src.title.trim().length).toBeGreaterThan(0);
        expect(src.publisher.trim().length).toBeGreaterThan(0);
        expect(src.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(src.accessed))).toBe(false);

        let parsed: URL | undefined;
        expect(() => { parsed = new URL(src.sourceUrl); }).not.toThrow();
        expect(parsed!.protocol).toBe('https:');
      }
    });

    it(`${id}: no duplicate source URL within the profile`, () => {
      const urls = profile.sources.map(sn => sn.sourceUrl);
      expect(new Set(urls).size).toBe(urls.length);
    });
  }

  it('no two historical profiles share a summary', () => {
    const summaries = historical.map(([, p]) => p.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
  });

  it('no fact string is reused across historical profiles', () => {
    const facts = historical.flatMap(([, p]) => p.facts);
    const seen = new Map<string, string>();
    for (const [id, p] of historical) {
      for (const f of p.facts) {
        const prev = seen.get(f);
        expect(prev, `fact reused by "${id}" and "${prev}"`).toBeUndefined();
        seen.set(f, id);
      }
    }
    expect(new Set(facts).size).toBe(facts.length);
  });
});

describe('#886 — lore profiles do not masquerade as history', () => {
  const lore = profileEntries.filter(([, p]) => p.kind === 'lore');

  for (const [id, profile] of lore) {
    it(`${id}: names a source work OR is an explicit game-original entry`, () => {
      if (GAME_ORIGINAL_LORE_IDS.has(id)) {
        expect(profile.loreWork).toBeUndefined();
        expect(profile.sources).toEqual([]);
      } else {
        expect(typeof profile.loreWork).toBe('string');
        expect(profile.loreWork!.trim().length).toBeGreaterThan(0);
      }
    });

    it(`${id}: any sources it does cite are still well-formed https notes`, () => {
      for (const src of profile.sources) {
        expect(src.title.trim().length).toBeGreaterThan(0);
        expect(src.publisher.trim().length).toBeGreaterThan(0);
        expect(src.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        let parsed: URL | undefined;
        expect(() => { parsed = new URL(src.sourceUrl); }).not.toThrow();
        expect(parsed!.protocol).toBe('https:');
      }
      const urls = profile.sources.map(sn => sn.sourceUrl);
      expect(new Set(urls).size).toBe(urls.length);
    });
  }

  it('GAME_ORIGINAL_LORE_IDS only lists real authored lore entries', () => {
    for (const id of GAME_ORIGINAL_LORE_IDS) {
      expect(authoredIds, `"${id}" is not an authored General`).toContain(id);
      expect(EXPECTED_KIND[id], `"${id}" is not lore`).toBe('lore');
    }
  });
});

describe('#886 — #888 generated-officer compatibility', () => {
  it('a generated-officer id has no historical/lore profile', () => {
    const identity = makeGeneratedIdentity();
    expect(getGeneralProfile(identity.id)).toBeUndefined();
  });

  it('a generated identity that resolves through resolveGeneralDefinition still has no profile', () => {
    const identity = makeGeneratedIdentity();
    const resolved = resolveGeneralDefinition({ generatedGenerals: { [identity.id]: identity } }, identity.id);
    expect(resolved?.origin).toBe('generated');
    expect(getGeneralProfile(resolved!.id)).toBeUndefined();
  });

  it('no authored profile id looks like a generated id', () => {
    for (const [id] of profileEntries) {
      expect(id.startsWith('generated:')).toBe(false);
    }
  });

  it('getGeneralProfile degrades safely for undefined / unknown ids', () => {
    expect(getGeneralProfile(undefined)).toBeUndefined();
    expect(getGeneralProfile('')).toBeUndefined();
    expect(getGeneralProfile('no-such-general')).toBeUndefined();
  });

  it('#886 does not disturb resolveGeneralDefinition', () => {
    expect(resolveGeneralDefinition({}, 'gen_caesar')?.name).toBe('Julius Caesar');
    expect(resolveGeneralDefinition({}, 'no-such-general')).toBeUndefined();
  });
});
