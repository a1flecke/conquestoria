import { describe, expect, it } from 'vitest';
import { GENERAL_DEFINITIONS, resolveGeneralDefinition, STANDARD_GENERAL_COMMAND_PROFILE } from '@/systems/great-general-definitions';
import { GENERAL_PROFILES } from '@/systems/great-general-profiles';
import type { GeneratedGeneralIdentity } from '@/core/types';

const HISTORICAL = new Set(['historical', 'legendary']);
const LORE = new Set(['lore', 'archetype']);

const SUMMARY_MAX = 420;
const FACT_MAX = 260;
const FACT_MIN_COUNT = 2;
const FACT_MAX_COUNT = 4;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function assertCleanText(value: string, label: string): void {
  expect(typeof value, label).toBe('string');
  expect(value.length, `${label} is empty`).toBeGreaterThan(0);
  expect(value.trim(), `${label} is whitespace-only`).not.toBe('');
  expect(CONTROL_CHARS.test(value), `${label} has control chars`).toBe(false);
}

describe('#886 — every authored General carries a rich profile', () => {
  it('every GENERAL_DEFINITIONS entry has a provenance and exactly one matching profile object', () => {
    for (const def of GENERAL_DEFINITIONS) {
      expect(def.provenance, `${def.id} has no provenance`).toBeDefined();
      if (HISTORICAL.has(def.provenance!)) {
        expect(def.historicalProfile, `${def.id} (${def.provenance}) has no historicalProfile`).toBeDefined();
        expect(def.loreProfile, `${def.id} must not carry a loreProfile`).toBeUndefined();
      } else {
        expect(LORE.has(def.provenance!), `${def.id} has unknown provenance "${def.provenance}"`).toBe(true);
        expect(def.loreProfile, `${def.id} (${def.provenance}) has no loreProfile`).toBeDefined();
        expect(def.historicalProfile, `${def.id} must not carry a historicalProfile`).toBeUndefined();
      }
    }
  });

  it('GENERAL_PROFILES has exactly one entry per authored id, and no orphan keys', () => {
    const rosterIds = new Set(GENERAL_DEFINITIONS.map(d => d.id));
    const profileIds = new Set(Object.keys(GENERAL_PROFILES));
    for (const id of rosterIds) expect(profileIds.has(id), `${id} has no GENERAL_PROFILES entry`).toBe(true);
    for (const id of profileIds) expect(rosterIds.has(id), `GENERAL_PROFILES key "${id}" is not on the roster`).toBe(true);
  });
});

describe('#886 — historical / legendary profile content rules', () => {
  const entries = GENERAL_DEFINITIONS.filter(d => HISTORICAL.has(d.provenance!));

  it('there are historical entries to check', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  for (const def of entries) {
    describe(`${def.id} (${def.name})`, () => {
      const p = def.historicalProfile!;

      it('summary is clean prose within bounds', () => {
        assertCleanText(p.summary, `${def.id}.summary`);
        expect(p.summary.length, `${def.id}.summary too long`).toBeLessThanOrEqual(SUMMARY_MAX);
      });

      it('has 2-4 clean, non-trivial facts', () => {
        expect(p.facts.length).toBeGreaterThanOrEqual(FACT_MIN_COUNT);
        expect(p.facts.length).toBeLessThanOrEqual(FACT_MAX_COUNT);
        for (const fact of p.facts) {
          assertCleanText(fact, `${def.id} fact`);
          expect(fact.length, `${def.id} fact too long`).toBeLessThanOrEqual(FACT_MAX);
          expect(fact.length, `${def.id} fact too short`).toBeGreaterThanOrEqual(20);
        }
        expect(new Set(p.facts).size, `${def.id} has duplicate facts`).toBe(p.facts.length);
      });

      it('context, when present, is clean prose', () => {
        if (p.context !== undefined) {
          assertCleanText(p.context, `${def.id}.context`);
          expect(p.context.length).toBeLessThanOrEqual(SUMMARY_MAX);
        }
      });

      it('has at least one authoritative source note; all fields clean; URLs https + parseable + unique', () => {
        expect(p.sources.length).toBeGreaterThanOrEqual(1);
        const urls = new Set<string>();
        for (const s of p.sources) {
          assertCleanText(s.title, `${def.id} source.title`);
          assertCleanText(s.publisher, `${def.id} source.publisher`);
          assertCleanText(s.notes, `${def.id} source.notes`);
          assertCleanText(s.sourceUrl, `${def.id} source.sourceUrl`);
          expect(s.sourceUrl, `${def.id} source URL not https`).toMatch(/^https:\/\//);
          expect(() => new URL(s.sourceUrl), `${def.id} source URL unparseable`).not.toThrow();
          expect(urls.has(s.sourceUrl), `${def.id} has a duplicate source URL`).toBe(false);
          urls.add(s.sourceUrl);
        }
      });
    });
  }
});

describe('#886 — lore / archetype profile content rules', () => {
  const entries = GENERAL_DEFINITIONS.filter(d => LORE.has(d.provenance!));

  it('there are lore/archetype entries to check', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  for (const def of entries) {
    describe(`${def.id} (${def.name})`, () => {
      const p = def.loreProfile!;

      it('summary + setting are clean prose; setting names a source world', () => {
        assertCleanText(p.summary, `${def.id}.summary`);
        expect(p.summary.length).toBeLessThanOrEqual(SUMMARY_MAX);
        assertCleanText(p.setting, `${def.id}.setting`);
      });

      it('has 2-4 clean facts', () => {
        expect(p.facts.length).toBeGreaterThanOrEqual(FACT_MIN_COUNT);
        expect(p.facts.length).toBeLessThanOrEqual(FACT_MAX_COUNT);
        for (const fact of p.facts) {
          assertCleanText(fact, `${def.id} fact`);
          expect(fact.length).toBeLessThanOrEqual(FACT_MAX);
        }
        expect(new Set(p.facts).size).toBe(p.facts.length);
      });

      it('carries no external "sources" field (fictional material)', () => {
        expect((p as unknown as { sources?: unknown }).sources).toBeUndefined();
      });

      it('does not present fiction as real history', () => {
        const blob = `${p.summary} ${p.facts.join(' ')} ${p.context ?? ''}`.toLowerCase();
        expect(/\breal (?:historical )?(?:figure|person|general|commander)\b/.test(blob)).toBe(false);
      });
    });
  }
});

describe('#886 — cross-profile distinctiveness', () => {
  it('no two authored profiles share an identical summary', () => {
    const summaries = GENERAL_DEFINITIONS.map(d => d.historicalProfile?.summary ?? d.loreProfile!.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
  });

  it('no two authored profiles share an identical fact list', () => {
    const factBlobs = GENERAL_DEFINITIONS.map(d => (d.historicalProfile?.facts ?? d.loreProfile!.facts).join('␟'));
    expect(new Set(factBlobs).size).toBe(factBlobs.length);
  });

  it('no single fact string is reused verbatim across two different Generals', () => {
    const seen = new Map<string, string>();
    for (const d of GENERAL_DEFINITIONS) {
      for (const fact of d.historicalProfile?.facts ?? d.loreProfile!.facts) {
        const prior = seen.get(fact);
        expect(prior, `fact reused by ${d.id} and ${prior}: "${fact}"`).toBeUndefined();
        seen.set(fact, d.id);
      }
    }
  });
});

describe('#886 — #888 generated officers stay fact-free', () => {
  function makeGenerated(overrides: Partial<GeneratedGeneralIdentity> = {}): GeneratedGeneralIdentity {
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

  it('a generated identity carries no provenance and no rich profile', () => {
    const g = makeGenerated();
    expect(g.provenance).toBeUndefined();
    expect(g.historicalProfile).toBeUndefined();
    expect(g.loreProfile).toBeUndefined();
  });

  it('resolveGeneralDefinition returns the authored profile intact for an authored id', () => {
    const caesar = resolveGeneralDefinition({}, 'gen_caesar');
    expect(caesar?.provenance).toBe('historical');
    expect(caesar?.historicalProfile?.summary).toMatch(/Julius Caesar/);
    expect(caesar?.historicalProfile?.sources.length).toBeGreaterThanOrEqual(1);
  });

  it('resolveGeneralDefinition resolves a generated id (profile absent) and an unknown id safely', () => {
    const g = makeGenerated();
    const resolved = resolveGeneralDefinition({ generatedGenerals: { [g.id]: g } }, g.id);
    expect(resolved?.historicalProfile).toBeUndefined();
    expect(resolveGeneralDefinition({}, 'no-such-general')).toBeUndefined();
  });

  it('no GENERAL_PROFILES key targets a generated-style id', () => {
    for (const id of Object.keys(GENERAL_PROFILES)) {
      expect(id.startsWith('generated:')).toBe(false);
    }
  });
});
