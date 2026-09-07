import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * #1004 architecture-gate meta-checks. These are the cheap, structural half
 * of the determinism contract and stay in the fast tier. The expensive
 * whole-simulation trajectory contracts live in
 * tests/app/simulation-determinism.test.ts (slow tier), which THIS file
 * asserts is correctly registered as slow.
 */

const REPO_ROOT = resolve(process.cwd());
const TIER_SCRIPT = resolve(REPO_ROOT, 'scripts/run-tests-by-tier.sh');
const SRC_RULE_SCRIPT = resolve(REPO_ROOT, 'scripts/check-src-rule-violations.sh');
const HEAVY_DETERMINISM_FILE = 'tests/app/simulation-determinism.test.ts';

describe('#1004 — test-tier registration', () => {
  it(`registers ${HEAVY_DETERMINISM_FILE} in the slow tier so the fast push gate skips it`, () => {
    const tierScript = readFileSync(TIER_SCRIPT, 'utf8');
    const slowBlock = tierScript.slice(
      tierScript.indexOf('SLOW_TEST_FILES="'),
      tierScript.indexOf('"', tierScript.indexOf('SLOW_TEST_FILES="') + 'SLOW_TEST_FILES="'.length) + 1,
    );
    expect(slowBlock).toContain(HEAVY_DETERMINISM_FILE);
  });

  it('keeps the pre-existing determinism-guard in the slow tier too', () => {
    const tierScript = readFileSync(TIER_SCRIPT, 'utf8');
    expect(tierScript).toContain('tests/app/determinism-guard.test.ts');
  });
});

const SIMULATION_DIRS = ['src/systems', 'src/ai', 'src/core'];

function grepSimulationDirs(pattern: string): { status: number | null; lines: string[] } {
  const grep = spawnSync(
    'grep',
    ['-rInE', '--include=*.ts', pattern, ...SIMULATION_DIRS],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  // grep exits 0 with matches, 1 with none, >=2 on a real error (bad path,
  // unreadable dir). Anything else means the scan never ran — without this the
  // whole sweep would pass vacuously on an empty stdout.
  expect(grep.error, `grep failed to spawn: ${grep.error?.message}`).toBeUndefined();
  expect([0, 1], `grep exited ${grep.status}: ${grep.stderr}`).toContain(grep.status);
  return { status: grep.status, lines: grep.stdout.split('\n').filter(Boolean) };
}

describe('#1004 — no Math.random() in simulation code', () => {
  it('actually scans the simulation source tree (guards against a vacuous pass)', () => {
    // Positive control: if the scan is running at all it must find the
    // canonical RNG factory's own call sites. A rename/move that silently
    // stops the sweep from reaching src/ fails here rather than going green.
    const { lines } = grepSimulationDirs('createSimulationRng');
    expect(lines.length).toBeGreaterThan(5);
  });

  it('src/systems, src/ai, src/core contain no non-comment Math.random( call', () => {
    const { lines } = grepSimulationDirs('Math\\.random\\(');
    const offending = lines
      // A line is only a violation if the call is not inside a `//` comment.
      // Same deliberately-simple heuristic the shipped source rule uses
      // (`scripts/check-src-rule-violations.sh` greps `-v '//'`); it does not
      // understand block comments or string literals. That is acceptable here
      // because this sweep is a belt-and-braces backstop behind the per-edit
      // hook, not the primary gate — but do not add a new exemption to it
      // without also teaching the shipped rule.
      .filter(line => {
        const body = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
        const idx = body.indexOf('Math.random(');
        const commentIdx = body.indexOf('//');
        return !(commentIdx !== -1 && commentIdx < idx);
      });
    expect(offending).toEqual([]);
  });
});

describe('#1004 — RNG source guard is still active (#1021 gate)', () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it('check-src-rule-violations.sh rejects a newly introduced hand-rolled LCG under src/systems', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'determinism-contract-'));
    tempDirs.push(workspace);
    const rel = 'src/systems/newly-added-thing.ts';
    const full = join(workspace, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(
      full,
      [
        'export function roll(turn: number, unitId: string): number {',
        '  let s = turn * 16807 + unitId.charCodeAt(0);',
        '  s = (s * 48271) % 2147483647;',
        '  return s / 2147483647;',
        '}',
      ].join('\n'),
    );

    const result = spawnSync(SRC_RULE_SCRIPT, [rel], { cwd: workspace, encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected');
    expect(result.stderr).toContain('createSimulationRng()');
  });
});
