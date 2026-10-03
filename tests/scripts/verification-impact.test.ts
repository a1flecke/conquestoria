import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());
const SCRIPT = resolve(ROOT, 'scripts/verification-impact.mjs');
const CONFIG = resolve(ROOT, 'scripts/data/verification-impact.json');
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function impact(...args: string[]) {
  const result = run('--json', ...args);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    base: string;
    changed: Array<{ path: string; status: string }>;
    evidence: Array<{ id: string; commands: string[]; why: string }>;
    mirroredTests: Array<{ source: string; test: string }>;
  };
}

const ids = (payload: ReturnType<typeof impact>) => payload.evidence.map(entry => entry.id);
const mirrorFor = (source: string) => `tests/${source.slice('src/'.length).replace(/\.ts$/, '.test.ts')}`;

describe('#1232 verification impact map', () => {
  it('maps a single AI source file to the current-policy evidence', () => {
    const payload = impact('--changed', 'M:src/ai/basic-ai.ts');
    expect(ids(payload)).toEqual(['src-rules', 'mirrored-tests', 'ai-playability', 'build', 'durable-full']);
    expect(payload.mirroredTests).toEqual([{ source: 'src/ai/basic-ai.ts', test: 'tests/ai/basic-ai.test.ts' }]);
    expect(payload.changed).toEqual([{ path: 'src/ai/basic-ai.ts', status: 'M' }]);
  });

  it('unions multiple files without duplicating evidence', () => {
    const payload = impact('--changed', 'M:src/ai/basic-ai.ts', '--changed', 'M:src/storage/save-manager.ts');
    const list = ids(payload);
    expect(list).toContain('src-rules');
    expect(list).toContain('ai-playability');
    expect(list).toContain('perf-report'); // src/storage/** is in performance-budgets frontmatter
    expect(list).toContain('build-tauri'); // save import/export per AGENTS.md
    expect(new Set(list).size).toBe(list.length);
  });

  it('is deterministic and ordered with baseline last', () => {
    const first = run('--json', '--changed', 'M:src/ai/basic-ai.ts').stdout;
    const second = run('--json', '--changed', 'M:src/ai/basic-ai.ts').stdout;
    expect(first).toBe(second);
    const list = ids(impact('--changed', 'M:src/ai/basic-ai.ts'));
    expect(list.indexOf('build')).toBeLessThan(list.indexOf('durable-full'));
  });

  it('lists only mirrored tests that actually exist', () => {
    const sources = ['src/ai/basic-ai.ts', 'src/systems/diplomacy-requests.ts'];
    const args = sources.flatMap(source => ['--changed', `M:${source}`]);
    const payload = impact(...args);
    const expected = sources.filter(source => existsSync(join(ROOT, mirrorFor(source)))).map(mirrorFor).sort();
    expect(payload.mirroredTests.map(entry => entry.test).sort()).toEqual(expected);
    for (const entry of payload.mirroredTests) expect(existsSync(join(ROOT, entry.test))).toBe(true);
  });

  it('requires only the baseline for an unknown path', () => {
    expect(ids(impact('--changed', 'M:docs/notes/unknown.md'))).toEqual(['build', 'durable-full']);
  });

  it('flags added, removed and renamed tests (but not edited tests) for shard allocation', () => {
    expect(ids(impact('--changed', 'A:tests/scripts/brand-new.test.ts'))).toContain('ci-shard-allocation');
    expect(ids(impact('--changed', 'R:tests/scripts/renamed.test.ts'))).toContain('ci-shard-allocation');
    expect(ids(impact('--changed', 'D:tests/scripts/removed.test.ts'))).toContain('ci-shard-allocation');
    expect(ids(impact('--changed', 'M:tests/scripts/ci-test-shard-selection.test.ts'))).not.toContain('ci-shard-allocation');
  });

  it('emits a stable JSON schema', () => {
    const payload = impact('--changed', 'M:src/ai/basic-ai.ts');
    expect(Object.keys(payload).sort()).toEqual(['base', 'changed', 'evidence', 'mirroredTests']);
    for (const entry of payload.evidence) {
      expect(Object.keys(entry).sort()).toEqual(['commands', 'id', 'why']);
      expect(entry.commands.length).toBeGreaterThan(0);
      expect(entry.why.length).toBeGreaterThan(0);
    }
  });

  it('exercises every declared rule', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as {
      rules: Array<{ id: string; require: string[] }>;
    };
    const fixtures: Record<string, string> = {
      'src-files': 'M:src/ai/basic-ai.ts',
      'ai-behavior': 'M:src/ai/basic-ai.ts',
      'ai-long-horizon': 'M:tests/simulation/long-horizon/campaign-matrix.test.ts',
      'performance-paths': 'M:src/core/turn-manager.ts',
      'wonder-content': 'M:src/systems/wonder-definitions.ts',
      'dual-release': 'M:src/platform/browser-save-file-adapter.ts',
      'audio-sfx': 'M:public/audio/sfx/example.ogg',
      'docs-lifecycle': 'M:docs/superpowers/plans/README.md',
      hooks: 'M:tests/hooks/run.sh',
      'shard-manifest': 'M:scripts/ci-test-shards.json',
      'new-or-renamed-tests': 'A:tests/scripts/brand-new.test.ts',
    };
    expect(Object.keys(fixtures).sort()).toEqual(config.rules.map(rule => rule.id).sort());
    for (const rule of config.rules) {
      const list = ids(impact('--changed', fixtures[rule.id]));
      for (const id of rule.require) expect(list, `${rule.id} should require ${id}`).toContain(id);
    }
  });

  it('rejects an impact map whose commands do not exist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'verification-impact-'));
    temporaryDirectories.push(directory);
    const write = (name: string, command: string) => {
      const path = join(directory, name);
      writeFileSync(path, JSON.stringify({
        schema: 1,
        baseline: ['build'],
        evidence: [{ id: 'build', commands: [command], why: 'fixture' }],
        rules: [],
      }));
      return path;
    };

    const badScript = run('--config', write('bad-package.json', './scripts/run-with-mise.sh yarn not-a-real-script'), '--changed', 'M:src/ai/basic-ai.ts');
    expect(badScript.status).toBe(2);
    expect(badScript.stderr).toContain('missing package script');

    const badFile = run('--config', write('bad-file.json', 'scripts/does-not-exist.sh'), '--changed', 'M:src/ai/basic-ai.ts');
    expect(badFile.status).toBe(2);
    expect(badFile.stderr).toContain('missing repo script');
  });
});
