#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SHARD_A = 'test-suite-shard-a';
const SHARD_B = 'test-suite-shard-b';

function fail(message) {
  throw new Error(message);
}

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function usage() {
  console.error('usage: allocate-ci-test-shards.mjs --default-manifest <path> --timings <path> --output <path>');
  process.exit(2);
}

function readManifest(path) {
  const files = readFileSync(path, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
  const seen = new Set();
  for (const file of files) {
    if (!file.startsWith('tests/') || file.includes('..') || seen.has(file)) {
      fail(`default manifest contains an invalid or duplicate test path: ${file}`);
    }
    seen.add(file);
  }
  return files.sort();
}

function requireExactFileSet(manifest, files) {
  const timingPaths = Object.keys(files).sort();
  if (manifest.length !== timingPaths.length || manifest.some((path, index) => path !== timingPaths[index])) {
    fail('timing files differ from default manifest');
  }
}

const manifestPath = argument('--default-manifest');
const timingsPath = argument('--timings');
const output = argument('--output');
if (!manifestPath || !timingsPath || !output) usage();

try {
  const manifest = readManifest(manifestPath);
  const timings = JSON.parse(readFileSync(timingsPath, 'utf8'));
  if (timings?.schemaVersion !== 1 || !timings.files || Array.isArray(timings.files)) {
    fail('timings must contain schemaVersion 1 and a files object');
  }
  for (const [path, duration] of Object.entries(timings.files)) {
    if (!path.startsWith('tests/') || !Number.isFinite(duration) || duration < 0) {
      fail(`invalid timing record: ${path}`);
    }
  }
  requireExactFileSet(manifest, timings.files);

  const totals = { [SHARD_A]: 0, [SHARD_B]: 0 };
  const shards = { [SHARD_A]: [], [SHARD_B]: [] };
  const weightedFiles = manifest
    .map(path => ({ path, duration: timings.files[path] }))
    .sort((left, right) => right.duration - left.duration || left.path.localeCompare(right.path));
  for (const file of weightedFiles) {
    const shard = totals[SHARD_A] <= totals[SHARD_B] ? SHARD_A : SHARD_B;
    shards[shard].push(file.path);
    totals[shard] += file.duration;
  }
  shards[SHARD_A].sort();
  shards[SHARD_B].sort();

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!commit) fail('git rev-parse HEAD returned an empty commit');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    schemaVersion: 1,
    source: { commit, timingSource: 'vitest-json' },
    files: timings.files,
    shards,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`allocate-ci-test-shards failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
