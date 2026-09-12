import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const RUN_CI_SHARD = resolve(REPO_ROOT, 'scripts/run-ci-test-shard.mjs');
const SHARD_MANIFEST = resolve(REPO_ROOT, 'scripts/ci-test-shards.json');
const SHARD_A = 'test-suite-shard-a';
const SHARD_B = 'test-suite-shard-b';
const temporaryDirectories: string[] = [];
const PROFILE_MODE = process.env.CI_SHARD_PROFILE === '1';

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function defaultDiscovery(): string[] {
  const result = spawnSync('yarn', ['test:manifest'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, VITEST_MAX_WORKERS: '1' },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.split('\n').map(line => line.trim()).filter(path => path.startsWith('tests/')).sort();
}

function listShard(shard: string, manifest = SHARD_MANIFEST) {
  return spawnSync(process.execPath, [
    RUN_CI_SHARD, '--shard', shard, '--list-files', '--manifest', manifest,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
}

(PROFILE_MODE ? describe.skip : describe)('#1075 checked-in CI shard selection', () => {
  it('assigns every default-discovered test exactly once and prints each checked-in shard', () => {
    const expectedFiles = defaultDiscovery();
    const manifest = JSON.parse(readFileSync(SHARD_MANIFEST, 'utf8'));
    const shardA = manifest.shards[SHARD_A] as string[];
    const shardB = manifest.shards[SHARD_B] as string[];
    const resultA = listShard(SHARD_A);
    const resultB = listShard(SHARD_B);

    expect(resultA.status, resultA.stderr).toBe(0);
    expect(resultB.status, resultB.stderr).toBe(0);
    expect(shardA).not.toHaveLength(0);
    expect(shardB).not.toHaveLength(0);
    expect(shardA).toEqual([...shardA].sort());
    expect(shardB).toEqual([...shardB].sort());
    expect(shardA.every(path => path.startsWith('tests/'))).toBe(true);
    expect(shardB.every(path => path.startsWith('tests/'))).toBe(true);
    expect(new Set([...shardA, ...shardB]).size).toBe(shardA.length + shardB.length);
    expect([...shardA, ...shardB].sort()).toEqual(expectedFiles);
    expect(resultA.stdout.trim().split('\n')).toEqual(shardA);
    expect(resultB.stdout.trim().split('\n')).toEqual(shardB);
  }, 60_000);

  it('rejects stale or unassigned files before it lists a shard', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conquestoria-ci-shard-selection-'));
    temporaryDirectories.push(directory);
    const invalidManifest = join(directory, 'invalid-shards.json');
    writeFileSync(invalidManifest, `${JSON.stringify({
      schemaVersion: 1,
      source: { commit: 'fixture', timingSource: 'vitest-json' },
      files: { 'tests/not-a-real-test.test.ts': 1 },
      shards: {
        [SHARD_A]: ['tests/not-a-real-test.test.ts'],
        [SHARD_B]: [],
      },
    }, null, 2)}\n`);

    const result = listShard(SHARD_A, invalidManifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CI shard manifest does not match default discovery');
  }, 60_000);

  it('rejects an unknown shard name before launching Vitest', () => {
    const result = listShard('not-a-ci-shard');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown CI shard');
  });
});
