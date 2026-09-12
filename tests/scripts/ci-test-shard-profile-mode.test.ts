import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('#1075 CI shard profile mode', () => {
  it('skips the shard contract while collecting a timing profile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conquestoria-ci-shard-profile-'));
    temporaryDirectories.push(directory);
    const reporter = join(directory, 'vitest.json');
    const result = spawnSync('yarn', [
      'vitest', 'run', 'tests/scripts/ci-test-shard-selection.test.ts', '--reporter=json', `--outputFile.json=${reporter}`,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, CI_SHARD_PROFILE: '1', VITEST_MAX_WORKERS: '1' },
    });

    expect(result.status, result.stderr).toBe(0);
    const profileResult = JSON.parse(readFileSync(reporter, 'utf8')).testResults[0];
    expect(profileResult.status).toBe('passed');
    expect(profileResult.assertionResults.every((result: { status: string }) => result.status === 'skipped')).toBe(true);
  }, 60_000);
});
