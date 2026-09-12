import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const THIS_TEST = 'tests/scripts/local-test-tier-selection.test.ts';
const EXPLICITLY_NON_DEFAULT_PREFIXES = [
  'tests/e2e/',
  'tests/simulation/long-horizon/',
];
const TIER_SCRIPT = resolve(REPO_ROOT, 'scripts/run-tests-by-local-tier.sh');
// CI observed the three real discovery processes taking 25.417s under load;
// 60s preserves more than 2x headroom without raising Vitest's global limit (#1075).
const REAL_DISCOVERY_TIMEOUT_MS = 60_000;

type Tier = 'default' | 'regular' | 'intensive-simulations';

function listManifest(tier: Tier, args: string[] = []): string[] {
  const script = tier === 'default' ? 'test:manifest' : `test:manifest:${tier}`;
  const result = spawnSync('yarn', [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, VITEST_MAX_WORKERS: '1' },
  });

  expect(result.error, `${script} did not start: ${result.error?.message}`).toBeUndefined();
  expect(result.status, `${script} failed:\n${result.stderr}`).toBe(0);

  return result.stdout
    .split('\n')
    .map(path => path.trim())
    .filter(path => path.startsWith('tests/') && path.endsWith('.test.ts'))
    .map(path => relative(REPO_ROOT, resolve(REPO_ROOT, path)).replaceAll('\\', '/'))
    .sort();
}

function declaredIntensiveSimulationFiles(): string[] {
  const contents = readFileSync(TIER_SCRIPT, 'utf8');
  const match = contents.match(/SLOW_TEST_FILES="([\s\S]*?)"/);
  expect(match, 'SLOW_TEST_FILES must remain a quoted manifest').not.toBeNull();
  return match![1].split('\n').filter(Boolean).sort();
}

describe('#1075 real Vitest local-tier selection', () => {
  it('partitions default discovery exactly once without leaking explicit-run suites', () => {
    const defaultFiles = listManifest('default');
    const regularFiles = listManifest('regular');
    const intensiveSimulationFiles = listManifest('intensive-simulations');
    const regular = new Set(regularFiles);
    const intensiveSimulations = new Set(intensiveSimulationFiles);
    const overlap = regularFiles.filter(file => intensiveSimulations.has(file));
    const union = [...new Set([...regularFiles, ...intensiveSimulationFiles])].sort();

    expect(defaultFiles).toContain(THIS_TEST);
    expect(declaredIntensiveSimulationFiles()).toContain(THIS_TEST);
    expect(overlap).toEqual([]);
    expect(union).toEqual(defaultFiles);
    expect(regularFiles).toHaveLength(regular.size);
    expect(intensiveSimulationFiles).toHaveLength(intensiveSimulations.size);

    for (const file of defaultFiles) {
      expect(Number(regular.has(file)) + Number(intensiveSimulations.has(file)), file).toBe(1);
    }
    for (const file of declaredIntensiveSimulationFiles()) {
      expect(intensiveSimulations.has(file), `${file} must be selected by the intensive-simulations manifest`).toBe(true);
      expect(regular.has(file), `${file} must be excluded from the regular manifest`).toBe(false);
    }
    for (const prefix of EXPLICITLY_NON_DEFAULT_PREFIXES) {
      expect(defaultFiles.some(file => file.startsWith(prefix)), prefix).toBe(false);
      expect(regularFiles.some(file => file.startsWith(prefix)), prefix).toBe(false);
      expect(intensiveSimulationFiles.some(file => file.startsWith(prefix)), prefix).toBe(false);
    }
  }, REAL_DISCOVERY_TIMEOUT_MS);

  it('keeps root-relative focused filters valid for an intensive-simulations file', () => {
    expect(listManifest('intensive-simulations', ['tests/ai/ai-prepared-turn.test.ts']))
      .toEqual(['tests/ai/ai-prepared-turn.test.ts']);
  }, REAL_DISCOVERY_TIMEOUT_MS);
});
