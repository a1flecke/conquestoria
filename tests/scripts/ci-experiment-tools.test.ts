import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const RECORD_TIMING = resolve(REPO_ROOT, 'scripts/ci-record-phase-timing.mjs');
const COLLECT_EXPERIMENT = resolve(REPO_ROOT, 'scripts/collect-ci-experiment.mjs');

describe('#1075 CI experiment tools', () => {
  it('records a failed phase with its commit, elapsed time, and exit status', () => {
    const output = join(mkdtempSync(join(tmpdir(), 'conquestoria-ci-timing-')), 'test-fast.json');
    const result = spawnSync(process.execPath, [
      RECORD_TIMING,
      '--output', output,
      '--phase', 'test-fast',
      '--', process.execPath, '-e', 'process.exit(7)',
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_SHA: 'timing-fixture-sha' },
    });

    expect(result.status, result.stderr).toBe(7);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
      phase: 'test-fast',
      commit: 'timing-fixture-sha',
      exitStatus: 7,
    });
  });

  it('turns a fixed workflow and jobs response into an experiment ledger row', () => {
    const result = spawnSync(process.execPath, [COLLECT_EXPERIMENT, '--repo', 'owner/repo', '--run', '42'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_EXPERIMENT_RUN_JSON: JSON.stringify({
          id: 42,
          event: 'workflow_dispatch',
          head_sha: 'experiment-fixture-sha',
          created_at: '2026-09-11T10:00:00Z',
          run_started_at: '2026-09-11T10:01:00Z',
          updated_at: '2026-09-11T10:07:00Z',
        }),
        CI_EXPERIMENT_JOBS_JSON: JSON.stringify({ jobs: [
          {
            name: 'test-fast', conclusion: 'success',
            started_at: '2026-09-11T10:01:30Z', completed_at: '2026-09-11T10:04:30Z',
          },
          {
            name: 'merge-gate', conclusion: 'success',
            started_at: '2026-09-11T10:05:00Z', completed_at: '2026-09-11T10:06:00Z',
          },
        ] }),
        CI_EXPERIMENT_ARTIFACTS_JSON: JSON.stringify({ artifacts: [
          { name: 'ci-timing-fast', archive_download_url: 'https://example.test/timing.zip' },
        ] }),
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      runId: 42,
      event: 'workflow_dispatch',
      commit: 'experiment-fixture-sha',
      workflowStartedAt: '2026-09-11T10:01:00Z',
      workflowCompletedAt: '2026-09-11T10:07:00Z',
      queueDelayMs: 90_000,
      aggregateWallTimeMs: 300_000,
      jobDurationsMs: { 'test-fast': 180_000, 'merge-gate': 60_000 },
      childResults: { 'test-fast': 'success', 'merge-gate': 'success' },
      runnerMinutes: 4,
      artifactUrls: { 'ci-timing-fast': 'https://example.test/timing.zip' },
    });
  });
});
