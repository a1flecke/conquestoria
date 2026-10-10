import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// d72a3c24f (#787 phase 10) deleted the animation stylesheet imports from main.ts and
// nothing re-added them, so every v2 SVG sprite shipped static. The CSS-content test
// only reads the file as text; this one proves the app entry graph actually loads it.
const repoRoot = resolve(__dirname, '../..');
const assetsDir = resolve(repoRoot, 'src/assets');

function resolveSpecifier(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? resolve(repoRoot, 'src', spec.slice(2))
    : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
    if (/\.[a-z]+$/.test(candidate) && existsSync(candidate) && !existsSync(`${candidate}/`)) return candidate;
  }
  return null;
}

function reachableFiles(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^\s*(?:import|export)\b[^'"\n;]*?(?:from\s*)?['"]([^'"]+)['"]/gm)) {
      const target = resolveSpecifier(file, match[1]);
      if (target) queue.push(target);
    }
  }
  return seen;
}

describe('sprite animation stylesheets are loaded by the app', () => {
  const sheets = readdirSync(assetsDir).filter(name => /(^sprite-animations-v2|-animations)\.css$/.test(name));
  const reached = reachableFiles(resolve(repoRoot, 'src/main.ts'));

  it('discovers the shared and per-beast stylesheets', () => {
    expect(sheets).toContain('sprite-animations-v2.css');
    expect(sheets.length).toBeGreaterThanOrEqual(9);
  });

  it.each(sheets)('%s is imported somewhere in main.ts\'s import graph', sheet => {
    expect(reached.has(resolve(assetsDir, sheet))).toBe(true);
  });
});
