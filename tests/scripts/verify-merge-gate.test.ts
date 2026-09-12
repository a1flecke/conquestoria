import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const VERIFY_GATE = resolve(REPO_ROOT, 'scripts/verify-merge-gate.mjs');

type JobResult = {
  result: string;
  outputs?: Record<string, string>;
};

type Needs = Record<string, JobResult>;

const REQUIRED_JOBS = [
  'web-build',
  'test-suite-shard-a',
  'test-suite-shard-b',
  'hooks',
  'web-smoke',
  'security-analysis',
  'desktop-change-check',
  'tauri-frontend-build',
] as const;

function successfulNeeds(desktopChanged = 'true'): Needs {
  return {
    'web-build': { result: 'success' },
    'test-suite-shard-a': { result: 'success' },
    'test-suite-shard-b': { result: 'success' },
    hooks: { result: 'success' },
    'web-smoke': { result: 'success' },
    'security-analysis': { result: 'success' },
    'desktop-change-check': { result: 'success', outputs: { desktop_changed: desktopChanged } },
    'tauri-frontend-build': { result: 'success' },
    'tauri-macos-build': { result: desktopChanged === 'true' ? 'success' : 'skipped' },
    'pirate-audio-reproducibility': { result: 'success' },
  };
}

function runGate(
  needs: Needs,
  { eventName = 'pull_request', ref = 'refs/pull/1075/merge', desktopChanged }: {
    eventName?: string;
    ref?: string;
    desktopChanged?: string;
  } = {},
) {
  return spawnSync(process.execPath, [VERIFY_GATE], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      GATE_NEEDS_JSON: JSON.stringify(needs),
      GATE_EVENT_NAME: eventName,
      GATE_REF: ref,
      GATE_DESKTOP_CHANGED: desktopChanged ?? needs['desktop-change-check']?.outputs?.desktop_changed ?? '',
    },
  });
}

describe('#1075 merge gate', () => {
  it('accepts a complete successful PR whose desktop build is applicable', () => {
    const result = runGate(successfulNeeds());
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(['failure', 'cancelled', 'timed_out', 'neutral', 'action_required', 'skipped'])(
    'rejects a mandatory %s result',
    status => {
      const needs = successfulNeeds();
      needs['test-suite-shard-a'] = { result: status };
      const result = runGate(needs);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('test-suite-shard-a');
      expect(result.stderr).toContain(status);
    },
  );

  it('rejects a missing mandatory child', () => {
    const needs = successfulNeeds();
    delete needs.hooks;
    const result = runGate(needs);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('hooks');
    expect(result.stderr).toContain('missing');
  });

  it('allows a skipped macOS job only when a PR has no desktop changes', () => {
    const result = runGate(successfulNeeds('false'), { desktopChanged: 'false' });
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a skipped macOS job when desktop changes require it', () => {
    const needs = successfulNeeds('true');
    needs['tauri-macos-build'] = { result: 'skipped' };
    const result = runGate(needs);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('tauri-macos-build');
  });

  it('allows the pirate-audio job to skip outside pull requests', () => {
    const needs = successfulNeeds('false');
    needs['pirate-audio-reproducibility'] = { result: 'skipped' };
    const result = runGate(needs, {
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/codex/issue-1075-ci-merge-gate',
      desktopChanged: 'false',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a skipped pirate-audio job on a pull request', () => {
    const needs = successfulNeeds();
    needs['pirate-audio-reproducibility'] = { result: 'skipped' };
    const result = runGate(needs);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pirate-audio-reproducibility');
  });
});
