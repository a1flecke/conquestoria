import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import baseConfig from '../../vite.config';
import perfConfig from '../../vitest.perf.config';

/**
 * #1007 meta-guard. The local wall-clock performance reporter
 * (`tests/perf/report/**`) records machine-dependent timings and MUST stay
 * explicit-run only (`yarn perf:report`). The machine-INDEPENDENT algorithmic
 * budgets (`tests/perf/algorithmic-budgets.test.ts`, `perf-probe.test.ts`) DO
 * run in the ordinary suite — only the reporter is excluded.
 *
 * This test proves, in the ordinary fast suite, that:
 *  - the default config excludes `perf/report/**` (and only that under tests/perf),
 *  - `vitest.perf.config.ts` is the one place that re-opens it,
 *  - the reporter directory actually contains a test (no vacuous pass),
 *  - no default test script / verification script / git hook / Claude hook / CI
 *    workflow reaches the reporter by name,
 *  - and NO `src/**` file imports vitest, uses `vi.*`, or references `tests/perf`
 *    (the `PerfProbe` is test-only; zero production instrumentation).
 *
 * Do not "fix" a failure here by loosening an assertion.
 */

const REPO_ROOT = process.cwd();
const REPORT_GLOB = 'perf/report/**';
const REPORT_DIR = resolve(REPO_ROOT, 'tests/perf/report');
const SRC_DIR = resolve(REPO_ROOT, 'src');

type ResolvedTest = NonNullable<ViteUserConfig['test']>;

function resolveTestConfig(config: typeof baseConfig | typeof perfConfig): ResolvedTest {
  const resolved = (typeof config === 'function'
    ? config({ mode: 'test', command: 'serve', isSsrBuild: false, isPreview: false })
    : config) as ViteUserConfig;
  const test = resolved.test;
  if (!test) throw new Error('config has no `test` block');
  return test;
}

function walkFiles(dir: string, pred: (abs: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = resolve(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile() && pred(abs)) out.push(abs);
    }
  };
  visit(dir);
  return out;
}

describe('#1007 perf-report isolation', () => {
  it('the default config excludes only the perf REPORTER directory', () => {
    const test = resolveTestConfig(baseConfig);
    expect(test.exclude).toContain(REPORT_GLOB);
    // The algorithmic budgets must NOT be excluded — they run in the slow tier.
    expect(test.exclude).not.toContain('perf/**');
    expect(test.exclude).not.toContain('perf/*');
    expect(String(test.dir)).toMatch(/[/\\]tests$/);
  });

  it('the dedicated perf config is the one place that re-includes the reporter', () => {
    const test = resolveTestConfig(perfConfig);
    expect(test.include).toEqual(['perf/report/**/*.test.ts']);
    expect(test.exclude ?? []).not.toContain(REPORT_GLOB);
    const base = resolveTestConfig(baseConfig);
    expect(test.dir).toBe(base.dir);
    expect(test.environment).toBe(base.environment);
    expect(test.maxWorkers).toBe(base.maxWorkers);
  });

  it('the reporter directory actually contains a test (no vacuous pass)', () => {
    const entries = readdirSync(REPORT_DIR);
    expect(entries.filter(name => name.endsWith('.test.ts')).length).toBeGreaterThan(0);
  });

  it('the ALGORITHMIC budgets ARE wired into the slow tier (so CI runs them)', () => {
    const tier = readFileSync(resolve(REPO_ROOT, 'scripts/run-tests-by-tier.sh'), 'utf8');
    // It must be listed in SLOW_TEST_FILES — otherwise the perf gate silently
    // stops running in `yarn test` / the CI slow lane.
    expect(tier).toMatch(/SLOW_TEST_FILES=/);
    expect(tier).toContain('tests/perf/algorithmic-budgets.test.ts');
    // And it must NOT be excluded by the default vitest config.
    const test = resolveTestConfig(baseConfig);
    for (const glob of (test.exclude ?? []) as string[]) {
      expect('perf/algorithmic-budgets.test.ts').not.toMatch(
        new RegExp('^' + glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'),
      );
    }
  });

  it('no default test script, verification script, hook or CI workflow reaches the reporter by name', () => {
    const forbidden = [/perf:report\b/, /run-perf-report/, /vitest\.perf\.config/];
    const explicitFiles = [
      'package.json',
      'scripts/run-test-suite.sh',
      'scripts/run-tests-by-tier.sh',
      'scripts/verify-before-push.sh',
      'scripts/verify-pr.sh',
      'scripts/run-durable-test-suite.sh',
      '.githooks/pre-push',
      '.githooks/pre-commit',
    ];
    const scannedDirs = ['.github/workflows', '.claude/hooks'];
    const gatingFiles = [
      ...explicitFiles.filter(rel => existsSync(resolve(REPO_ROOT, rel))),
      ...scannedDirs.flatMap(dir => {
        const abs = resolve(REPO_ROOT, dir);
        if (!existsSync(abs)) return [];
        return readdirSync(abs)
          .map(name => `${dir}/${name}`)
          .filter(rel => statSync(resolve(REPO_ROOT, rel)).isFile());
      }),
    ];
    expect(gatingFiles).toContain('.github/workflows/deploy.yml'); // the tree scan found something

    for (const relPath of gatingFiles) {
      const contents = readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
      const lines = contents.split('\n').filter(line => {
        // package.json legitimately DEFINES the script.
        if (relPath !== 'package.json') return true;
        return !line.includes('"perf:report"');
      });
      for (const pattern of forbidden) {
        const offending = lines.find(line => pattern.test(line));
        expect(
          offending,
          `${relPath} references the perf reporter (${pattern}): ${offending?.trim()}`,
        ).toBeUndefined();
      }
    }
  });

  it('no src/** file imports vitest, uses vi.*, or references tests/perf', () => {
    const srcFiles = walkFiles(SRC_DIR, abs => /\.tsx?$/.test(abs) && !abs.endsWith('.d.ts'));
    expect(srcFiles.length).toBeGreaterThan(200); // sanity: we actually walked src

    const offenders: string[] = [];
    const banned = [
      /from ['"]vitest['"]/,
      /\bvi\.(spyOn|mock|stubGlobal|fn|restoreAllMocks)\b/,
      /tests[/\\]perf/,
    ];
    for (const abs of srcFiles) {
      const contents = readFileSync(abs, 'utf8');
      for (const pattern of banned) {
        if (pattern.test(contents)) {
          offenders.push(`${relative(REPO_ROOT, abs)} :: ${pattern}`);
          break;
        }
      }
    }
    expect(offenders, `production code must never contain test-only instrumentation:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
