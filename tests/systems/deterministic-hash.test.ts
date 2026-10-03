import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  djb2XorUnsigned,
  fnv1a32,
  fnv1a32CodePointLead,
  fnv1a32CodePointLeadRaw,
  fnv1a32Raw,
  lehmerFoldByCodePoint,
  rolling31Signed,
  rolling31UnsignedByCodePoint,
} from '@/systems/deterministic-hash';
import { createRng } from '@/systems/map-generator';
import { deterministicCombatSeed } from '@/systems/combat-system';
import { deriveGeneralCandidateSeed } from '@/core/turn-manager';
import { hashCode } from '@/renderer/sprite-overlay';

/**
 * #1234 — one import-free leaf for every deterministic string hash, without moving a single bit of output.
 *
 * The expected values below were produced by running the PRE-#1234 loops (verbatim copies live in `LEGACY`), not by
 * reasoning about the arithmetic. If a golden here has to change, the refactor changed simulation output: that is a
 * bug in the change, never a number to regenerate.
 */

// ---- the verbatim legacy loops (ba3f76d5), kept only to prove the leaf reproduces them --------------------------
const LEGACY = {
  // game-state.ts hashSeed (raw loop), map-generator.ts createRng, simulation-rng.ts hashToSeed
  rolling31(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; } return h; },
  // river-system.ts: the same arithmetic written with a shift
  riverRolling31(seed: string): number { let hash = 0; for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0; } return hash; },
  // barbarian-system.ts
  rolling31UnsignedByCodePoint(str: string): number { return [...str].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 1); },
  // ai-roster-selection.ts / start-placement-system.ts (xor, then multiply)
  fnvXorThenMul(value: string): number { let hash = 2166136261; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash; },
  // stampede-route / stampede / rogue-elephant / great-general / pirate-definitions (multiply the xor)
  fnvImul(seed: string): number { let hash = 2166136261; for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619); return hash; },
  // pirate-actions.ts deterministicRoll, air-operations-system.ts stableAirLossRoll
  fnvCodePointLead(seed: string): number { let hash = 2166136261; for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return hash; },
  // round-phases/per-civ/general-candidates.ts deriveGeneralCandidateSeed, combat-reward-system.ts seededRoll
  lehmer(initial: number, source: string): number { let seed = initial; for (const char of source) { seed = (seed * 48271 + char.charCodeAt(0)) % 2147483647; } return seed; },
  // sprite-overlay.ts hashCode
  djb2(str: string): number { let h = 5381; for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) ^ str.charCodeAt(i); } return h >>> 0; },
};

interface GoldenRow {
  input: string;
  rolling31Signed: number;
  rolling31UnsignedByCodePoint: number;
  fnv1a32Raw: number;
  fnv1a32CodePointLeadRaw: number;
  lehmerFrom0: number;
  lehmerFrom1: number;
  lehmerFromTurn12: number;
  lehmerFrom123456789: number;
  djb2XorUnsigned: number;
}

// empty, ASCII, unicode (BMP and astral), gameId:civId-style seeds, a separator-heavy string, an aliasing pair, a long string
const GOLDEN: GoldenRow[] = [
  { input: '', rolling31Signed: 0, rolling31UnsignedByCodePoint: 1, fnv1a32Raw: 2166136261, fnv1a32CodePointLeadRaw: 2166136261, lehmerFrom0: 0, lehmerFrom1: 1, lehmerFromTurn12: 95028, lehmerFrom123456789: 123456789, djb2XorUnsigned: 5381 },
  { input: 'a', rolling31Signed: 97, rolling31UnsignedByCodePoint: 128, fnv1a32Raw: -468965076, fnv1a32CodePointLeadRaw: -468965076, lehmerFrom0: 97, lehmerFrom1: 48368, lehmerFromTurn12: 292129391, lehmerFrom123456789: 115541491, djb2XorUnsigned: 177604 },
  { input: 'hello', rolling31Signed: 99162322, rolling31UnsignedByCodePoint: 127791473, fnv1a32Raw: 1335831723, fnv1a32CodePointLeadRaw: 1335831723, lehmerFrom0: 1396118051, lehmerFrom1: 1327303445, lehmerFromTurn12: 1169444198, lehmerFrom123456789: 1094183559, djb2XorUnsigned: 178056679 },
  { input: 'game-1:player', rolling31Signed: 1525294533, rolling31UnsignedByCodePoint: 1019735908, fnv1a32Raw: 299805824, fnv1a32CodePointLeadRaw: 299805824, lehmerFrom0: 1022914648, lehmerFrom1: 125759748, lehmerFromTurn12: 1287863348, lehmerFrom123456789: 2098969455, djb2XorUnsigned: 1306719486 },
  { input: 'gameId:12:camp-3:unit-77', rolling31Signed: -1648115678, rolling31UnsignedByCodePoint: 569642275, fnv1a32Raw: -489147597, fnv1a32CodePointLeadRaw: -489147597, lehmerFrom0: 1893160158, lehmerFrom1: 1147980598, lehmerFromTurn12: 95708656, lehmerFrom123456789: 1922618279, djb2XorUnsigned: 3699218005 },
  { input: 'héllo wörld', rolling31Signed: 1628148953, rolling31UnsignedByCodePoint: 1757231672, fnv1a32Raw: -743317818, fnv1a32CodePointLeadRaw: -743317818, lehmerFrom0: 2030409979, lehmerFrom1: 75228703, lehmerFromTurn12: 1054285397, lehmerFrom123456789: 110666891, djb2XorUnsigned: 2555501552 },
  { input: '🎲 roll', rolling31Signed: 1650346855, rolling31UnsignedByCodePoint: 872913186, fnv1a32Raw: 1542156082, fnv1a32CodePointLeadRaw: -962568126, lehmerFrom0: 1465927358, lehmerFrom1: 1873283041, lehmerFromTurn12: 1121550660, lehmerFrom123456789: 1757576215, djb2XorUnsigned: 2638585366 },
  { input: '𝒳y', rolling31Signed: 54941979, rolling31UnsignedByCodePoint: 1716901, fnv1a32Raw: -805347104, fnv1a32CodePointLeadRaw: 1926025739, lehmerFrom0: 524268053, lehmerFrom1: 706873847, lehmerFromTurn12: 1519792525, lehmerFrom123456789: 807866568, djb2XorUnsigned: 174663674 },
  { input: ':::|::|:', rolling31Signed: -283814848, rolling31UnsignedByCodePoint: 2203697985, fnv1a32Raw: 153483893, fnv1a32CodePointLeadRaw: 153483893, lehmerFrom0: 826682611, lehmerFrom1: 1681399116, lehmerFromTurn12: 700222917, lehmerFrom123456789: 2116480517, djb2XorUnsigned: 1941540037 },
  { input: 'ab:c', rolling31Signed: 2985802, rolling31UnsignedByCodePoint: 3909323, fnv1a32Raw: -672947767, fnv1a32CodePointLeadRaw: -672947767, lehmerFrom0: 1429550869, lehmerFrom1: 1196787859, lehmerFromTurn12: 1507800689, lehmerFrom123456789: 2082184607, djb2XorUnsigned: 2087554623 },
  { input: 'a:bc', rolling31Signed: 2948602, rolling31UnsignedByCodePoint: 3872123, fnv1a32Raw: -447179239, fnv1a32CodePointLeadRaw: -447179239, lehmerFrom0: 569700890, lehmerFrom1: 336937880, lehmerFromTurn12: 647950710, lehmerFrom123456789: 1222334628, djb2XorUnsigned: 2087651775 },
  { input: `${'x'.repeat(300)}:end`, rolling31Signed: 50425953, rolling31UnsignedByCodePoint: 2210982498, fnv1a32Raw: 1217813986, fnv1a32CodePointLeadRaw: 1217813986, lehmerFrom0: 1610965409, lehmerFrom1: 341872075, lehmerFromTurn12: 596270283, lehmerFrom123456789: 41049885, djb2XorUnsigned: 532216528 },
];

const label = (input: string) => (input.length > 24 ? `${input.slice(0, 12)}…(${input.length} chars)` : JSON.stringify(input));

describe('deterministic-hash leaf: each variant reproduces its historical output exactly (#1234)', () => {
  it.each(GOLDEN)('pinned values for $input', row => {
    expect(rolling31Signed(row.input)).toBe(row.rolling31Signed);
    expect(rolling31UnsignedByCodePoint(row.input)).toBe(row.rolling31UnsignedByCodePoint);
    expect(fnv1a32Raw(row.input)).toBe(row.fnv1a32Raw);
    expect(fnv1a32(row.input)).toBe(row.fnv1a32Raw >>> 0);
    expect(fnv1a32CodePointLeadRaw(row.input)).toBe(row.fnv1a32CodePointLeadRaw);
    expect(fnv1a32CodePointLead(row.input)).toBe(row.fnv1a32CodePointLeadRaw >>> 0);
    expect(lehmerFoldByCodePoint(0, row.input)).toBe(row.lehmerFrom0);
    expect(lehmerFoldByCodePoint(1, row.input)).toBe(row.lehmerFrom1);
    expect(lehmerFoldByCodePoint(Math.abs(12 * 7919), row.input)).toBe(row.lehmerFromTurn12);
    expect(lehmerFoldByCodePoint(123456789, row.input)).toBe(row.lehmerFrom123456789);
    expect(djb2XorUnsigned(row.input)).toBe(row.djb2XorUnsigned);
  });

  it('agrees with a verbatim copy of every legacy loop, including the river-system shift form', () => {
    const inputs = [
      ...GOLDEN.map(row => row.input),
      // more shapes: gameId-style seeds across turns, embedded NUL, lone surrogates, CJK
      ...Array.from({ length: 40 }, (_, turn) => `game-${turn * 37}:${turn}:civ-${turn % 5}:unit-${turn * 11}`),
      'a\u0000b', '\ud800', 'x\udc00y', '日本語のシード', 'Ünïcödé:🎲:🎲',
    ];
    for (const input of inputs) {
      const where = label(input);
      expect(rolling31Signed(input), where).toBe(LEGACY.rolling31(input));
      expect(rolling31Signed(input), `${where} (river form)`).toBe(LEGACY.riverRolling31(input));
      expect(rolling31UnsignedByCodePoint(input), where).toBe(LEGACY.rolling31UnsignedByCodePoint(input));
      expect(fnv1a32Raw(input), where).toBe(LEGACY.fnvXorThenMul(input));
      expect(fnv1a32Raw(input), `${where} (imul form)`).toBe(LEGACY.fnvImul(input));
      expect(fnv1a32CodePointLeadRaw(input), where).toBe(LEGACY.fnvCodePointLead(input));
      expect(lehmerFoldByCodePoint(0, input), where).toBe(LEGACY.lehmer(0, input));
      expect(lehmerFoldByCodePoint(95028, input), where).toBe(LEGACY.lehmer(95028, input));
      expect(djb2XorUnsigned(input), where).toBe(LEGACY.djb2(input));
    }
  });

  it('keeps the historically distinct variants distinct (nothing was normalised onto anything else)', () => {
    // signed start-0 vs unsigned start-1 rolling hashes are different functions
    expect(rolling31Signed('hello')).not.toBe(rolling31UnsignedByCodePoint('hello'));
    // raw FNV is signed for non-empty input; the unsigned form is the same bits read unsigned
    expect(fnv1a32Raw('a')).toBeLessThan(0);
    expect(fnv1a32('a')).toBe(fnv1a32Raw('a') + 2 ** 32);
    // the code-point-lead walk equals the UTF-16 walk for ASCII and BMP text, and differs for astral characters
    for (const bmp of ['', 'a', 'hello', 'héllo wörld', 'game-1:player']) {
      expect(fnv1a32CodePointLeadRaw(bmp), bmp).toBe(fnv1a32Raw(bmp));
    }
    for (const astral of ['🎲 roll', '𝒳y']) {
      expect(fnv1a32CodePointLeadRaw(astral), astral).not.toBe(fnv1a32Raw(astral));
    }
    // separator placement matters ("ab","c" must not alias "a","bc")
    expect(fnv1a32('ab:c')).not.toBe(fnv1a32('a:bc'));
  });

  it('the Lehmer fold honours the caller-supplied start state (a different start is a different stream)', () => {
    expect(lehmerFoldByCodePoint(0, 'ab:c')).not.toBe(lehmerFoldByCodePoint(1, 'ab:c'));
    // an empty string returns the start unchanged, exactly as the old loop did
    expect(lehmerFoldByCodePoint(123456789, '')).toBe(123456789);
    // the fold chains: folding 'ab' then ':c' from the result equals folding 'ab:c' from the start
    expect(lehmerFoldByCodePoint(lehmerFoldByCodePoint(7, 'ab'), ':c')).toBe(lehmerFoldByCodePoint(7, 'ab:c'));
  });

  it('the empty string keeps each variant\'s historical start value', () => {
    expect(rolling31Signed('')).toBe(0);
    expect(rolling31UnsignedByCodePoint('')).toBe(1);
    expect(fnv1a32Raw('')).toBe(2166136261);
    expect(fnv1a32('')).toBe(2166136261);
    expect(djb2XorUnsigned('')).toBe(5381);
  });
});

describe('the sites that used to carry their own copy still produce the same output (#1234)', () => {
  const seeds = ['', 'a', 'hello', 'campaign-seed-7', '🎲 roll', 'héllo wörld'];

  it('sprite-overlay hashCode (djb2 variant)', () => {
    for (const seed of seeds) expect(hashCode(seed), label(seed)).toBe(LEGACY.djb2(seed));
  });

  it('deterministicCombatSeed (FNV-1a over the joined seed, floored at 1)', () => {
    for (const [gameId, turn, attacker, defender] of [
      ['game-1', 3, 'unit-1', 'unit-2'], [undefined, 12, 'unit-77', 'city-4'], ['🎲', 0, 'a', 'b'],
    ] as const) {
      const source = [gameId ?? 'legacy', turn, attacker, defender].join(':');
      expect(deterministicCombatSeed(gameId, turn, attacker, defender), source).toBe(Math.max(1, LEGACY.fnvXorThenMul(source) >>> 0));
    }
  });

  it('deriveGeneralCandidateSeed (Lehmer fold from a turn-derived start)', () => {
    for (const [gameId, turn, civId] of [
      ['game-1', 5, 'player'], [undefined, 12, 'ai-egypt'], ['🎲 game', 99, 'civ-ünï'],
    ] as const) {
      expect(deriveGeneralCandidateSeed(gameId, turn, civId)).toBe(LEGACY.lehmer(Math.abs(turn * 7919), `${gameId ?? 'legacy'}:${civId}`));
    }
  });

  it('createRng (the map generator\'s mulberry32, seeded by the signed rolling hash)', () => {
    const legacyCreateRng = (seed: string) => {
      let h = LEGACY.rolling31(seed);
      return () => {
        h |= 0; h = h + 0x6D2B79F5 | 0;
        let t = Math.imul(h ^ h >>> 15, 1 | h);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    };
    for (const seed of seeds) {
      const actual = createRng(seed);
      const expected = legacyCreateRng(seed);
      for (let i = 0; i < 5; i++) expect(actual(), `${label(seed)} draw ${i}`).toBe(expected());
    }
  });
});

// ---- structure: every former copy delegates, and no new copy can appear ------------------------------------------
const ROOT = resolve(__dirname, '../..');
const LEAF = 'src/systems/deterministic-hash.ts';
/** `src/storage/migrations/steps/**` is frozen history (a migration must keep reproducing what it shipped with). */
const FROZEN_PREFIX = 'src/storage/migrations/steps/';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const SOURCES = walk(resolve(ROOT, 'src')).map(file => ({
  path: file.slice(ROOT.length + 1),
  source: readFileSync(file, 'utf8'),
}));

/**
 * Every site that used to hand-roll a hash, with the leaf function(s) it must now call. A new entry here is a
 * deliberate decision; the scanner below is what catches the one nobody listed.
 */
const SITES: Array<[path: string, uses: string[]]> = [
  ['src/core/game-state.ts', ['rolling31Signed']],
  ['src/core/round-phases/per-civ/general-candidates.ts', ['lehmerFoldByCodePoint']],
  ['src/renderer/sprite-overlay.ts', ['djb2XorUnsigned']],
  ['src/systems/ai-roster-selection.ts', ['fnv1a32']],
  ['src/systems/air-operations-system.ts', ['fnv1a32CodePointLead']],
  ['src/systems/barbarian-system.ts', ['rolling31UnsignedByCodePoint']],
  ['src/systems/combat-reward-system.ts', ['lehmerFoldByCodePoint']],
  ['src/systems/combat-system.ts', ['fnv1a32']],
  ['src/systems/great-general-fallback-content.ts', ['fnv1a32']],
  ['src/systems/map-generator.ts', ['rolling31Signed']],
  ['src/systems/pirate-actions.ts', ['fnv1a32CodePointLeadRaw']],
  ['src/systems/pirate-definitions.ts', ['fnv1a32Raw']],
  ['src/systems/river-system.ts', ['rolling31Signed']],
  ['src/systems/rogue-elephant-host-system.ts', ['fnv1a32']],
  ['src/systems/simulation-rng.ts', ['rolling31Signed']],
  ['src/systems/stampede-route-system.ts', ['fnv1a32']],
  ['src/systems/stampede-system.ts', ['fnv1a32']],
  ['src/systems/start-placement-system.ts', ['fnv1a32']],
];

const HASH_STEP = /Math\.imul\(|\*\s*31\b|<<\s*5\b|%\s*2147483647|\*\s*48271|\b16777619\b|\b2166136261\b|\b5381\b/;
const CHAR_READ = /\.(charCodeAt|codePointAt)\(/;
const isCommentLine = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

/**
 * A hand-rolled deterministic string hash: a line that reads a character code with hash arithmetic on the same line or
 * within two lines of it. This deliberately does NOT ban `charCodeAt` itself (alphabet indexing, parsing and the like
 * are fine); it bans the combination that makes a hash, which is what every historical copy had.
 */
function findHandRolledStringHashes(files: Array<{ path: string; source: string }>, allow: ReadonlySet<string> = new Set()): string[] {
  const hits: string[] = [];
  for (const { path, source } of files) {
    if (path === LEAF || path.startsWith(FROZEN_PREFIX) || allow.has(path)) continue;
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (isCommentLine(line) || !CHAR_READ.test(line)) return;
      const window = lines.slice(Math.max(0, index - 2), index + 3).filter(candidate => !isCommentLine(candidate)).join('\n');
      if (HASH_STEP.test(window)) hits.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

describe('every former hash copy delegates to the leaf (#1234)', () => {
  it.each(SITES)('%s calls the canonical function(s) and keeps no loop of its own', (path, uses) => {
    const source = SOURCES.find(file => file.path === path)?.source;
    expect(source, `${path} not found`).toBeDefined();
    expect(source).toMatch(/from '(@\/systems|\.)\/deterministic-hash'/);
    for (const name of uses) expect(source, `${path} must call ${name}(`).toContain(`${name}(`);
    expect(findHandRolledStringHashes(SOURCES.filter(file => file.path === path))).toEqual([]);
  });

  it('the leaf is import-free so any layer can depend on it without a cycle', () => {
    const leaf = SOURCES.find(file => file.path === LEAF)!.source;
    expect(leaf).not.toMatch(/^\s*import\s/m);
    expect(leaf).not.toMatch(/\brequire\(/);
  });

  it('every source file that imports the leaf is a listed site (no silent extra consumer)', () => {
    const importers = SOURCES
      .filter(file => file.path !== LEAF && /from '(@\/systems|\.)\/deterministic-hash'/.test(file.source))
      .map(file => file.path)
      .sort();
    expect(importers).toEqual(SITES.map(([path]) => path).sort());
  });
});

describe('no hand-rolled string hash outside the canonical leaf (#1234)', () => {
  it('finds none in src today (frozen migration steps excluded, nothing else allow-listed)', () => {
    expect(findHandRolledStringHashes(SOURCES)).toEqual([]);
  });

  it('the frozen migration copy still exists and is excluded on purpose, not by accident', () => {
    const frozen = SOURCES.filter(file => file.path.startsWith(FROZEN_PREFIX) && /\b16777619\b/.test(file.source));
    expect(frozen.map(file => file.path)).toEqual(['src/storage/migrations/steps/tech-identity.ts']);
    // without the exclusion the scanner would flag it, so the exclusion is doing real work
    const unfrozen = frozen.map(file => ({ ...file, path: `src/systems/${file.path.split('/').pop()}` }));
    expect(findHandRolledStringHashes(unfrozen).length).toBeGreaterThan(0);
  });

  describe('the scanner is not vacuous: it bites on every historical shape and spares legitimate charCodeAt', () => {
    const shapes: Record<string, string> = {
      'rolling-31 imul': 'for (let i = 0; i < s.length; i++) {\n  h = Math.imul(31, h) + s.charCodeAt(i) | 0;\n}',
      'rolling-31 shift': 'for (let i = 0; i < seed.length; i++) {\n  hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;\n}',
      'rolling-31 reduce': '[...text].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 1)',
      'FNV xor-then-multiply': 'let hash = 2166136261;\nfor (let i = 0; i < v.length; i++) {\n  hash ^= v.charCodeAt(i);\n  hash = Math.imul(hash, 16777619);\n}',
      'FNV multiply-the-xor, one line': 'for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);',
      'Lehmer fold': 'for (const char of text) {\n  state = (state * 48271 + char.charCodeAt(0)) % 2147483647;\n}',
      'djb2': 'for (let i = 0; i < str.length; i++) {\n  h = ((h << 5) + h) ^ str.charCodeAt(i);\n}',
      'codePointAt variant': 'for (const ch of text) { hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619); }',
    };
    for (const [name, code] of Object.entries(shapes)) {
      it(`flags a synthetic ${name} copy`, () => {
        expect(findHandRolledStringHashes([{ path: 'src/systems/new-feature.ts', source: code }]).length).toBeGreaterThan(0);
      });
    }

    it('spares a charCodeAt that is not a hash (alphabet index, parsing)', () => {
      const benign = [
        "const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);",
        'const isDigit = code => code.charCodeAt(0) >= 48 && code.charCodeAt(0) <= 57;',
        'return String.fromCharCode(base.charCodeAt(0) + offset);',
      ].join('\n');
      expect(findHandRolledStringHashes([{ path: 'src/systems/new-feature.ts', source: benign }])).toEqual([]);
    });

    it('spares comments that merely mention a hash', () => {
      const commented = '// h = Math.imul(31, h) + s.charCodeAt(i) | 0 was the old loop\n/* * 48271 + c.charCodeAt(0) */';
      expect(findHandRolledStringHashes([{ path: 'src/systems/new-feature.ts', source: commented }])).toEqual([]);
    });

    it('honours an allow-list entry and ignores the leaf and the frozen steps', () => {
      const code = 'h = Math.imul(31, h) + s.charCodeAt(i) | 0;';
      expect(findHandRolledStringHashes([{ path: 'src/systems/x.ts', source: code }], new Set(['src/systems/x.ts']))).toEqual([]);
      expect(findHandRolledStringHashes([{ path: LEAF, source: code }])).toEqual([]);
      expect(findHandRolledStringHashes([{ path: `${FROZEN_PREFIX}old.ts`, source: code }])).toEqual([]);
    });
  });
});
