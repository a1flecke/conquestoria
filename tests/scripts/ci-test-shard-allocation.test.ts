import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const COLLECT_TIMINGS = resolve(REPO_ROOT, 'scripts/collect-vitest-file-timings.mjs');
const ALLOCATE_SHARDS = resolve(REPO_ROOT, 'scripts/allocate-ci-test-shards.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'conquestoria-ci-shard-allocation-'));
  temporaryDirectories.push(directory);
  return directory;
}

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe('#1075 Vitest file-timing ingestion', () => {
  it('normalizes successful root-relative and repository-rooted reporter paths', () => {
    const directory = workspace();
    const input = join(directory, 'vitest.json');
    const output = join(directory, 'timings.json');
    writeJson(input, {
      success: true,
      testResults: [
        { name: 'tests/alpha.test.ts', status: 'passed', startTime: 100, endTime: 140 },
        {
          name: join(REPO_ROOT, 'tests/beta.test.ts'), status: 'passed', startTime: 200, endTime: 275,
        },
      ],
    });

    const result = run(COLLECT_TIMINGS, [
      '--input', input, '--output', output, '--repo-root', REPO_ROOT,
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      schemaVersion: 1,
      files: {
        'tests/alpha.test.ts': 40,
        'tests/beta.test.ts': 75,
      },
    });
  });

  it('normalizes a successful GitHub workspace reporter path only when its reporter root is explicit', () => {
    const directory = workspace();
    const input = join(directory, 'vitest.json');
    const output = join(directory, 'timings.json');
    const githubWorkspace = '/home/runner/work/conquestoria/conquestoria';
    writeJson(input, {
      success: true,
      testResults: [{
        name: `${githubWorkspace}/tests/scripts/ci-test-shard-allocation.test.ts`,
        status: 'passed',
        startTime: 100,
        endTime: 140,
      }],
    });

    const result = run(COLLECT_TIMINGS, [
      '--input', input,
      '--output', output,
      '--repo-root', REPO_ROOT,
      '--reporter-repo-root', githubWorkspace,
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8')).files)
      .toEqual({ 'tests/scripts/ci-test-shard-allocation.test.ts': 40 });
  });

  it('keeps an intentionally skipped file in a successful timing profile', () => {
    const directory = workspace();
    const input = join(directory, 'vitest.json');
    const output = join(directory, 'timings.json');
    writeJson(input, {
      success: true,
      testResults: [
        { name: 'tests/scripts/ci-test-shard-selection.test.ts', status: 'skipped', startTime: 100, endTime: 105 },
      ],
    });

    const result = run(COLLECT_TIMINGS, [
      '--input', input, '--output', output, '--repo-root', REPO_ROOT,
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8')).files)
      .toEqual({ 'tests/scripts/ci-test-shard-selection.test.ts': 5 });
  });

  it.each([
    ['failed reporter run', { success: false, testResults: [] }, 'reporter did not succeed'],
    ['failed file', {
      success: true,
      testResults: [{ name: 'tests/alpha.test.ts', status: 'failed', startTime: 1, endTime: 2 }],
    }, 'is not passed'],
    ['non-finite timing', {
      success: true,
      testResults: [{ name: 'tests/alpha.test.ts', status: 'passed', startTime: 1, endTime: null }],
    }, 'finite'],
    ['duplicate normalized path', {
      success: true,
      testResults: [
        { name: 'tests/alpha.test.ts', status: 'passed', startTime: 1, endTime: 2 },
        { name: join(REPO_ROOT, 'tests/alpha.test.ts'), status: 'passed', startTime: 3, endTime: 4 },
      ],
    }, 'duplicate'],
  ])('rejects a %s', (_label, reporter, expectedDiagnostic) => {
    const directory = workspace();
    const input = join(directory, 'vitest.json');
    const output = join(directory, 'timings.json');
    writeJson(input, reporter);

    const result = run(COLLECT_TIMINGS, [
      '--input', input, '--output', output, '--repo-root', REPO_ROOT,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedDiagnostic);
  });
});

describe('#1075 deterministic duration-balanced allocation', () => {
  it('uses lexical ordering and shard-a ties while preserving complete disjoint coverage', () => {
    const directory = workspace();
    const manifest = join(directory, 'default.txt');
    const timings = join(directory, 'timings.json');
    const output = join(directory, 'shards.json');
    writeFileSync(manifest, 'tests/beta.test.ts\ntests/alpha.test.ts\ntests/gamma.test.ts\n');
    writeJson(timings, {
      schemaVersion: 1,
      files: {
        'tests/alpha.test.ts': 10,
        'tests/beta.test.ts': 10,
        'tests/gamma.test.ts': 5,
      },
    });

    const result = run(ALLOCATE_SHARDS, [
      '--default-manifest', manifest, '--timings', timings, '--output', output,
    ]);

    expect(result.status, result.stderr).toBe(0);
    const allocation = JSON.parse(readFileSync(output, 'utf8'));
    expect(allocation).toMatchObject({
      schemaVersion: 1,
      source: { timingSource: 'vitest-json' },
      files: {
        'tests/alpha.test.ts': 10,
        'tests/beta.test.ts': 10,
        'tests/gamma.test.ts': 5,
      },
      shards: {
        'test-suite-shard-a': ['tests/alpha.test.ts', 'tests/gamma.test.ts'],
        'test-suite-shard-b': ['tests/beta.test.ts'],
      },
    });
    expect(typeof allocation.source.commit).toBe('string');
    expect(allocation.source.commit.length).toBeGreaterThan(0);
    const assigned = Object.values(allocation.shards).flat() as string[];
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([
      'tests/alpha.test.ts', 'tests/beta.test.ts', 'tests/gamma.test.ts',
    ]);
  });

  it('rejects a timing set that is not exactly the default manifest', () => {
    const directory = workspace();
    const manifest = join(directory, 'default.txt');
    const timings = join(directory, 'timings.json');
    const output = join(directory, 'shards.json');
    writeFileSync(manifest, 'tests/alpha.test.ts\n');
    writeJson(timings, {
      schemaVersion: 1,
      files: { 'tests/beta.test.ts': 10 },
    });

    const result = run(ALLOCATE_SHARDS, [
      '--default-manifest', manifest, '--timings', timings, '--output', output,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('timing files differ from default manifest');
  });

  it('keeps a measured shard fixed while deterministically splitting its critical peer in two', () => {
    const directory = workspace();
    const manifest = join(directory, 'default.txt');
    const timings = join(directory, 'timings.json');
    const fixedManifest = join(directory, 'fixed-shards.json');
    const output = join(directory, 'shards.json');
    writeFileSync(manifest, [
      'tests/alpha.test.ts',
      'tests/beta.test.ts',
      'tests/delta.test.ts',
      'tests/gamma.test.ts',
    ].join('\n'));
    writeJson(timings, {
      schemaVersion: 1,
      files: {
        'tests/alpha.test.ts': 10,
        'tests/delta.test.ts': 5,
        'tests/gamma.test.ts': 5,
      },
    });
    writeJson(fixedManifest, {
      schemaVersion: 1,
      files: {
        'tests/alpha.test.ts': 10,
        'tests/beta.test.ts': 1,
        'tests/delta.test.ts': 5,
        'tests/gamma.test.ts': 5,
      },
      shards: {
        'test-suite-shard-a': ['tests/alpha.test.ts', 'tests/gamma.test.ts'],
        'test-suite-shard-b': ['tests/beta.test.ts'],
      },
    });

    const result = run(ALLOCATE_SHARDS, [
      '--default-manifest', manifest,
      '--timings', timings,
      '--output', output,
      '--shard-names', 'test-suite-shard-a,test-suite-shard-b,test-suite-shard-c',
      '--fixed-shard-manifest', fixedManifest,
      '--fixed-shards', 'test-suite-shard-b',
    ]);

    expect(result.status, result.stderr).toBe(0);
    const allocation = JSON.parse(readFileSync(output, 'utf8'));
    expect(allocation.shards).toEqual({
      'test-suite-shard-a': ['tests/alpha.test.ts'],
      'test-suite-shard-b': ['tests/beta.test.ts'],
      'test-suite-shard-c': ['tests/delta.test.ts', 'tests/gamma.test.ts'],
    });
  });
});
