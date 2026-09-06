import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');
const BASELINE_PATH = resolve(REPO_ROOT, '.claude/rng-legacy-baseline.txt');

const RNG_PATTERN = /([*]\s*(16807|48271|1664525|104729|92821|99991|73937|65599|7919|31337)\b)|(\.charCodeAt\([0-9]+\))/;

interface BaselineEntry {
  path: string;
  line: number;
  raw: string;
}

function parseBaseline(): BaselineEntry[] {
  const text = readFileSync(BASELINE_PATH, 'utf8');
  const entries: BaselineEntry[] = [];
  for (const raw of text.split('\n')) {
    const withoutComment = raw.split('#')[0].trim();
    if (!withoutComment) continue;
    const [path, lineStr] = withoutComment.split(':');
    entries.push({ path, line: Number(lineStr), raw });
  }
  return entries;
}

function eachSourceFile(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return eachSourceFile(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * #1021: the RNG source-rule baseline is a hand-maintained list of `path:line`
 * pairs, not derived from code. If the code moves (a refactor shifts line
 * numbers) or a listed line is fixed without removing its baseline entry, the
 * baseline silently drifts — either hiding a real, still-present violation
 * behind a stale line number, or (harmlessly but confusingly) keeping a dead
 * entry for code that no longer matches. Both are worth catching.
 */
describe('#1021 — RNG legacy baseline stays honest', () => {
  const entries = parseBaseline();

  it('is non-empty and well-formed', () => {
    // #982 converted every [FIX-982]-tagged entry (the genuine under-keyed
    // debt #1021 catalogued) to createSimulationRng and removed those lines
    // from this file — only already-correct [OK]/[LOW] lines remain, so the
    // threshold shrank from #1021's original ~30 to reflect that cleanup,
    // not a regression in coverage.
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(entry.path, entry.raw).toMatch(/^src\//);
      expect(entry.line, entry.raw).toBeGreaterThan(0);
    }
  });

  it('every baselined line still contains the pattern it was recorded for', () => {
    const stale: string[] = [];
    for (const entry of entries) {
      const filePath = resolve(REPO_ROOT, entry.path);
      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        stale.push(`${entry.path}:${entry.line} — file no longer exists`);
        continue;
      }
      const lines = content.split('\n');
      const lineText = lines[entry.line - 1];
      if (lineText === undefined || !RNG_PATTERN.test(lineText)) {
        stale.push(`${entry.path}:${entry.line} — no longer matches the RNG pattern (moved, fixed, or mis-recorded): ${JSON.stringify(lineText)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('every real occurrence in src/systems, src/ai, src/core is covered by the baseline or the permanent exemption list', () => {
    const exemptFiles = new Set([
      'src/systems/map-generator.ts',
      'src/systems/river-system.ts',
      'src/systems/seeded-lcg.ts',
      'src/systems/simulation-rng.ts',
    ]);
    const baselineKeys = new Set(entries.map(entry => `${entry.path}:${entry.line}`));

    const uncovered: string[] = [];
    for (const dir of ['src/systems', 'src/ai', 'src/core']) {
      for (const file of eachSourceFile(resolve(REPO_ROOT, dir))) {
        const relPath = file.slice(REPO_ROOT.length + 1);
        if (exemptFiles.has(relPath)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((lineText, index) => {
          if (lineText.includes('//')) return; // comment-only lines are excluded by the rule itself
          if (!RNG_PATTERN.test(lineText)) return;
          const key = `${relPath}:${index + 1}`;
          if (!baselineKeys.has(key)) uncovered.push(`${key}: ${lineText.trim()}`);
        });
      }
    }
    expect(uncovered).toEqual([]);
  });
});
