import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Procedural maps wrap horizontally by default, so a raw `hexDistance` treats two tiles that sit
 * next to each other across the seam as a whole map apart. That bug shipped in combat
 * counter-attacks, healing ranges, distance-from-capital unrest, spy detection, quest radii and more.
 * Game-rule code measures distance with `mapDistance(map, a, b)` (or a local wrap branch).
 *
 * A raw call is accepted only when it cannot be affected by the seam (same-tile `=== 0` / `!== 0`),
 * when the line or the two before it branch on the wrap themselves, or when it is listed below with
 * the reason it is left alone. A listed file whose count changes fails too, so the list cannot go stale.
 */
const ROOTS = ['src/systems', 'src/ai', 'src/core'];
const CANONICAL = new Set(['src/systems/hex-utils.ts']);

const ALLOWED: Record<string, { count: number; why: string }> = {
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

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function unguardedCallCount(source: string): number {
  const lines = source.split('\n');
  let count = 0;
  lines.forEach((line, index) => {
    const at = line.indexOf('hexDistance(');
    if (at < 0 || /^\s*import\b/.test(line)) return;
    const comment = line.indexOf('//');
    if (comment >= 0 && comment < at) return;
    if (/^\s*\*/.test(line)) return;
    const context = lines.slice(Math.max(0, index - 2), index + 1).join('\n');
    if (/wrap/i.test(context)) return;
    if (/\)\s*[!=]==\s*0\b/.test(line)) return;
    count += line.split('hexDistance(').length - 1;
  });
  return count;
}

describe('game rules measure distance across the wrapping seam', () => {
  const root = resolve(__dirname, '../..');
  const counts = new Map<string, number>();
  for (const dir of ROOTS) {
    for (const file of walk(resolve(root, dir))) {
      const rel = file.slice(root.length + 1);
      if (CANONICAL.has(rel)) continue;
      const count = unguardedCallCount(readFileSync(file, 'utf8'));
      if (count > 0) counts.set(rel, count);
    }
  }

  it('has no wrap-blind hexDistance call outside the reviewed list', () => {
    const unexpected = [...counts.keys()].filter(file => !(file in ALLOWED));
    expect(unexpected, 'use mapDistance(state.map, a, b), or add a reviewed entry with its reason').toEqual([]);
  });

  it('every reviewed entry still matches the source', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([file, entry]) => (counts.get(file) ?? 0) !== entry.count)
      .map(([file, entry]) => `${file}: expected ${entry.count}, found ${counts.get(file) ?? 0}`);
    expect(stale).toEqual([]);
  });
});
