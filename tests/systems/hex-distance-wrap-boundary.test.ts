import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Procedural maps wrap horizontally by default, so a raw `hexDistance` treats two tiles that sit
 * next to each other across the seam as a whole map apart. That bug shipped in combat
 * counter-attacks, healing ranges, distance-from-capital unrest, spy detection, quest radii and more.
 * Game-rule code measures distance with `mapDistance(map, a, b)` (or a local wrap branch).
 *
 * The neighbour and range helpers (`hexNeighbors`, `hexesInRange`, `hexRing`) have the same flaw: off
 * the edge they return coordinates with no tile, so a lookup silently misses the land across the seam.
 * That split every seam-crossing landmass into two tags and hid faith pressure, crisis terrain and
 * eruptions across the edge. Game-rule code uses `mapNeighbors` / `mapHexesInRange` (or wraps the
 * result itself).
 *
 * A raw call is accepted only when it cannot be affected by the seam (same-tile `=== 0` / `!== 0`),
 * when the line or the two either side of it handle the wrap themselves, or when it is listed below
 * with the reason it is left alone. A listed entry whose count changes fails too, so the list cannot
 * go stale.
 */
const ROOTS = ['src/systems', 'src/ai', 'src/core', 'src/ui', 'src/app', 'src/input'];
const CANONICAL = new Set(['src/systems/hex-utils.ts']);

const DISTANCE_ALLOWED: Record<string, { count: number; why: string }> = {
  'src/systems/wonder-system.ts': {
    count: 2,
    why: 'natural-wonder spacing during map generation; changing it re-rolls the world for every existing seed, a separate decision',
  },
  'src/systems/balanced-map-generator.ts': {
    count: 2,
    why: 'map generation (zones and luxury hotspot); changing it re-rolls the world for every existing seed, a separate decision',
  },
  'src/ai/ai-war-goals.ts': {
    count: 2,
    why: 'pure AI preference over a map-free input DTO (nearest known enemy city); no legality depends on it',
  },
  'src/ai/ai-home-guard.ts': {
    count: 2,
    why: 'pure AI preference over a map-free world slice (nearest free guard); no legality depends on it',
  },
};

const NEIGHBOUR_ALLOWED: Record<string, { count: number; why: string }> = {
  'src/systems/river-system.ts': {
    count: 1,
    why: 'river courses during map generation; changing it re-rolls the world for every existing seed, a separate decision',
  },
  'src/systems/map-validation.ts': {
    count: 2,
    why: 'map-generation validation of start sites; changing it re-rolls the world for every existing seed, a separate decision',
  },
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function unguardedCallCount(source: string, call: RegExp): number {
  const lines = source.split('\n');
  let count = 0;
  lines.forEach((line, index) => {
    const matches = line.match(call);
    if (!matches || /^\s*import\b/.test(line)) return;
    const at = line.search(call);
    const comment = line.indexOf('//');
    if (comment >= 0 && comment < at) return;
    if (/^\s*\*/.test(line)) return;
    const context = lines.slice(Math.max(0, index - 2), index + 3).join('\n');
    if (/wrap|canonicali[sz]e/i.test(context)) return;
    if (/\)\s*[!=]==\s*0\b/.test(line)) return;
    count += matches.length;
  });
  return count;
}

const CHECKS = [
  { name: 'distance', call: /\bhexDistance\(/g, allowed: DISTANCE_ALLOWED, fix: 'use mapDistance(state.map, a, b)' },
  {
    name: 'neighbour and range',
    call: /\b(?:hexNeighbors|hexesInRange|hexRing)\(/g,
    allowed: NEIGHBOUR_ALLOWED,
    fix: 'use mapNeighbors / mapHexesInRange, or wrap the coordinates',
  },
] as const;

describe('game rules follow the wrapping seam', () => {
  const root = resolve(__dirname, '../..');
  const files = ROOTS.flatMap(dir => walk(resolve(root, dir)))
    .map(file => ({ rel: file.slice(root.length + 1), source: readFileSync(file, 'utf8') }))
    .filter(file => !CANONICAL.has(file.rel));

  for (const check of CHECKS) {
    const counts = new Map<string, number>();
    for (const file of files) {
      const count = unguardedCallCount(file.source, check.call);
      if (count > 0) counts.set(file.rel, count);
    }

    it(`has no wrap-blind ${check.name} call outside the reviewed list`, () => {
      const unexpected = [...counts.keys()].filter(file => !(file in check.allowed));
      expect(unexpected, `${check.fix}, or add a reviewed entry with its reason`).toEqual([]);
    });

    it(`every reviewed ${check.name} entry still matches the source`, () => {
      const stale = Object.entries(check.allowed)
        .filter(([file, entry]) => (counts.get(file) ?? 0) !== entry.count)
        .map(([file, entry]) => `${file}: expected ${entry.count}, found ${counts.get(file) ?? 0}`);
      expect(stale).toEqual([]);
    });
  }
});
