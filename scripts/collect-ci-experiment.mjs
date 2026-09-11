#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function usage() {
  console.error('usage: collect-ci-experiment.mjs --repo <owner/repo> --run <workflow-run-id>');
  process.exit(2);
}

function parseArgument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function readJson(envName, endpoint) {
  const fixture = process.env[envName];
  if (fixture) return JSON.parse(fixture);
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
}

function epoch(value, label) {
  const parsed = Date.parse(value ?? '');
  if (Number.isNaN(parsed)) throw new Error(`missing or invalid ${label}`);
  return parsed;
}

const repo = parseArgument('--repo');
const runId = parseArgument('--run');
if (!repo || !runId) usage();

try {
  const base = `repos/${repo}/actions/runs/${runId}`;
  const run = readJson('CI_EXPERIMENT_RUN_JSON', base);
  const jobs = readJson('CI_EXPERIMENT_JOBS_JSON', `${base}/jobs?per_page=100`).jobs;
  const artifacts = readJson('CI_EXPERIMENT_ARTIFACTS_JSON', `${base}/artifacts?per_page=100`).artifacts;
  if (!Array.isArray(jobs) || !Array.isArray(artifacts)) throw new Error('jobs and artifacts must be arrays');

  const createdAt = epoch(run.created_at, 'run created_at');
  const startedAt = epoch(run.run_started_at, 'run run_started_at');
  const completedAt = epoch(run.updated_at, 'run updated_at');
  const completedJobs = jobs.filter(job => job.started_at && job.completed_at);
  const earliestJobStart = Math.min(...completedJobs.map(job => epoch(job.started_at, `job ${job.name} started_at`)));
  if (!Number.isFinite(earliestJobStart)) throw new Error('no completed jobs to measure');

  const jobDurationsMs = Object.fromEntries(completedJobs.map(job => [
    job.name,
    epoch(job.completed_at, `job ${job.name} completed_at`) - epoch(job.started_at, `job ${job.name} started_at`),
  ]));
  const childResults = Object.fromEntries(jobs.map(job => [job.name, job.conclusion ?? job.status ?? 'unknown']));
  const mergeGate = completedJobs.find(job => job.name === 'merge-gate');
  if (!mergeGate) throw new Error('missing completed merge-gate job');

  console.log(JSON.stringify({
    runId: run.id,
    event: run.event,
    commit: run.head_sha,
    workflowStartedAt: run.run_started_at,
    workflowCompletedAt: run.updated_at,
    queueDelayMs: earliestJobStart - createdAt,
    aggregateWallTimeMs: epoch(mergeGate.completed_at, 'merge-gate completed_at') - startedAt,
    jobDurationsMs,
    childResults,
    runnerMinutes: Object.values(jobDurationsMs).reduce((sum, duration) => sum + duration, 0) / 60_000,
    artifactUrls: Object.fromEntries(artifacts.map(artifact => [artifact.name, artifact.archive_download_url])),
  }));
} catch (error) {
  console.error(`collect-ci-experiment failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
