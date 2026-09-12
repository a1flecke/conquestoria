import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import baseConfig from '../../vite.config';
import longHorizonConfig from '../../vitest.long-horizon.config';

/**
 * #1005 meta-guard. The long-horizon AI campaign suite
 * (`tests/simulation/long-horizon/**`) is minutes-per-scenario and MUST stay
 * explicit-run only. This test proves, in the ordinary fast suite, that:
 *
 *  - the default Vite/Vitest config excludes the directory,
 *  - the dedicated `vitest.long-horizon.config.ts` is the one place that re-opens it,
 *  - the directory actually contains campaign tests (so the guard can't pass vacuously),
 *  - and no default test script, verification script, git hook, Claude hook or CI
 *    workflow reaches the suite by name.
 *
 * If this fails, a heavyweight campaign run has leaked into `yarn test` /
 * `verify:push` / CI. Do not "fix" it by loosening the assertion.
 */

const REPO_ROOT = process.cwd();
const LONG_HORIZON_GLOB = 'simulation/long-horizon/**';
const LONG_HORIZON_DIR = resolve(REPO_ROOT, 'tests/simulation/long-horizon');

type ResolvedTest = NonNullable<ViteUserConfig['test']>;

function resolveTestConfig(
  config: typeof baseConfig | typeof longHorizonConfig,
): ResolvedTest {
  const resolved = (typeof config === 'function'
    ? config({
        mode: 'test',
        command: 'serve',
        isSsrBuild: false,
        isPreview: false,
      })
    : config) as ViteUserConfig;
  const test = resolved.test;
  if (!test) throw new Error('config has no `test` block');
  return test;
}

describe('#1005 long-horizon suite isolation', () => {
  it('the default config excludes the long-horizon directory', () => {
    const test = resolveTestConfig(baseConfig);
    expect(test.exclude).toContain(LONG_HORIZON_GLOB);
    // The exclusion must not have quietly moved the whole suite root.
    expect(String(test.dir)).toMatch(/[/\\]tests$/);
  });

  it('the dedicated long-horizon config is the one place that re-includes it', () => {
    const test = resolveTestConfig(longHorizonConfig);
    expect(test.include).toEqual(['simulation/long-horizon/**/*.test.ts']);
    // It must NOT carry the exclusion forward, or it would collect nothing.
    expect(test.exclude ?? []).not.toContain(LONG_HORIZON_GLOB);
    // Everything else must be inherited from the base config verbatim.
    const base = resolveTestConfig(baseConfig);
    expect(test.dir).toBe(base.dir);
    expect(test.environment).toBe(base.environment);
    expect(test.maxWorkers).toBe(base.maxWorkers);
  });

  it('the long-horizon directory actually contains campaign tests', () => {
    const entries = readdirSync(LONG_HORIZON_DIR);
    const campaignTests = entries.filter(name => name.endsWith('.test.ts'));
    expect(campaignTests.length).toBeGreaterThan(0);
  });

  it('no default test script, verification script, hook or CI workflow reaches the suite by name', () => {
    const forbidden = [/test:ai-long\b/, /run-ai-long-horizon/, /vitest\.long-horizon\.config/];
    const explicitFiles = [
      'package.json',
      'scripts/run-test-suite.sh',
      'scripts/run-tests-by-local-tier.sh',
      'scripts/verify-before-push.sh',
      'scripts/verify-pr.sh',
      'scripts/run-durable-test-suite.sh',
      '.githooks/pre-push',
      '.githooks/pre-commit',
    ];
    // Everything under these dirs is a potential gate, so scan the whole tree —
    // a NEW workflow or hook file is covered without editing this list.
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
    expect(gatingFiles).toContain('.github/workflows/deploy.yml'); // the tree scan actually found something

    for (const relPath of gatingFiles) {
      const contents = readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
      // package.json legitimately DEFINES the script — that one declaration is
      // the only allowed mention anywhere in the gating set.
      const lines = contents.split('\n').filter(line => {
        if (relPath !== 'package.json') return true;
        return !line.includes('"test:ai-long"');
      });
      for (const pattern of forbidden) {
        const offending = lines.find(line => pattern.test(line));
        expect(
          offending,
          `${relPath} references the long-horizon suite (${pattern}): ${offending?.trim()}`,
        ).toBeUndefined();
      }
    }
  });
});
