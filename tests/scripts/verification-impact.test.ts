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
    diagnostics: Array<{ id: string; commands: string[]; when: string }>;
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
    expect(Object.keys(payload).sort()).toEqual(['base', 'changed', 'diagnostics', 'evidence', 'mirroredTests']);
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

  // --- #1362: verify:impact is the single executable verification contract -------------------------------------

  it('keeps ai-long a narrow requirement: broad AI, economy and orchestration edits do not require it', () => {
    for (const changed of ['M:src/ai/ai-diplomacy.ts', 'M:src/ai/basic-ai.ts', 'M:src/systems/economy-system.ts', 'M:src/core/turn-manager.ts', 'M:src/systems/faction-pressure.ts']) {
      expect(ids(impact('--changed', changed)), changed).not.toContain('ai-long');
    }
    expect(ids(impact('--changed', 'M:tests/simulation/long-horizon/campaign-scenarios.ts'))).toContain('ai-long');
    expect(ids(impact('--changed', 'M:scripts/run-ai-long-horizon.sh'))).toContain('ai-long');
  });

  it('lists the long-horizon suite only as an optional diagnostic, for AI source changes, never as required evidence', () => {
    const ai = impact('--changed', 'M:src/ai/ai-diplomacy.ts');
    expect(ai.diagnostics.map(entry => entry.id)).toEqual(['ai-long-campaign']);
    expect(ids(ai)).not.toContain('ai-long-campaign');
    expect(ai.diagnostics[0].when).toMatch(/NOT required/);
    expect(impact('--changed', 'M:src/systems/economy-system.ts').diagnostics).toEqual([]);
    const text = run('--changed', 'M:src/ai/ai-diplomacy.ts').stdout;
    expect(text).toContain('Optional diagnostics');
    expect(text.indexOf('Required evidence')).toBeLessThan(text.indexOf('Optional diagnostics'));
  });

  it('an unrelated file gains no unrelated evidence and no diagnostics', () => {
    const payload = impact('--changed', 'M:docs/some-note.md');
    expect(ids(payload)).toEqual(['build', 'durable-full']);
    expect(payload.diagnostics).toEqual([]);
  });

  it('reuses one proof when two rules require it, and pairs every durable runner with its :status readback', () => {
    const payload = impact('--changed', 'M:src/ai/ai-round-scheduler.ts', '--changed', 'M:src/storage/save-manager.ts');
    expect(ids(payload).filter(id => id === 'perf-report')).toHaveLength(1);
    expect(ids(payload).filter(id => id === 'durable-full')).toHaveLength(1);
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { evidence: Array<{ id: string; commands: string[] }>; diagnostics: Array<{ id: string; commands: string[] }> };
    for (const entry of [...config.evidence, ...config.diagnostics]) {
      for (const runner of ['test:durable', 'test:ai-long', 'test:ai-playability']) {
        if (entry.commands.some(command => new RegExp(`yarn\\s+${runner}(?!:)`).test(command))) {
          expect(entry.commands.some(command => command.includes(`${runner}:status`)), `${entry.id} needs ${runner}:status`).toBe(true);
        }
      }
    }
  });

  describe('a deliberately invalid contract is rejected', () => {
    const base = () => ({
      schema: 1,
      baseline: ['build'],
      evidence: [
        { id: 'build', commands: ['./scripts/run-with-mise.sh yarn build'], why: 'CLAUDE.md → Required Verification' },
        { id: 'extra', commands: ['./scripts/run-with-mise.sh yarn test:hooks'], why: 'AGENTS.md → hooks' },
      ],
      diagnostics: [] as Array<Record<string, unknown>>,
      rules: [{ id: 'r', match: ['src/**'], require: ['extra'], why: 'AGENTS.md → src' }] as Array<Record<string, unknown>>,
    });
    const reject = (mutate: (config: ReturnType<typeof base>) => void) => {
      const directory = mkdtempSync(join(tmpdir(), 'verification-contract-'));
      temporaryDirectories.push(directory);
      const config = base();
      mutate(config);
      const path = join(directory, 'map.json');
      writeFileSync(path, JSON.stringify(config));
      return run('--config', path, '--changed', 'M:src/ai/basic-ai.ts');
    };

    it('accepts the base fixture (so each rejection below is caused by its own mutation)', () => {
      expect(reject(() => {}).status).toBe(0);
    });

    it('evidence that no rule requires is an obsolete machine rule', () => {
      const result = reject(config => { config.rules = []; });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('obsolete machine rule');
    });

    it('a durable runner without its :status readback cannot be proven or reused', () => {
      const result = reject(config => { config.evidence[1].commands = ['./scripts/run-with-mise.sh yarn test:ai-playability']; });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('test:ai-playability:status');
    });

    it('a rule suggesting an unknown diagnostic, or a diagnostic reusing an evidence id, fails', () => {
      expect(reject(config => { config.rules[0].suggest = ['nope']; }).stderr).toContain('unknown diagnostic');
      expect(reject(config => { config.diagnostics = [{ id: 'extra', commands: [], when: 'x', source: 'AGENTS.md' }]; }).stderr).toContain('both required evidence and a diagnostic');
    });

    it('a rule citing a deleted or renamed policy surface fails', () => {
      const result = reject(config => { config.evidence[1].why = '.claude/rules/renamed-away.md → something'; });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('no longer exists');
    });

    it('a diagnostic whose cited section was removed from its prose fails', () => {
      const result = reject(config => {
        config.diagnostics = [{ id: 'd', commands: ['./scripts/run-with-mise.sh yarn test:hooks'], when: 'sometimes', source: 'AGENTS.md → A heading nobody wrote' }];
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('no longer contains the cited section');
    });
  });
});
