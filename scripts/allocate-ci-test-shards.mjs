#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_SHARD_NAMES = ['test-suite-shard-a', 'test-suite-shard-b'];

function fail(message) {
  throw new Error(message);
}

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function usage() {
  console.error('usage: allocate-ci-test-shards.mjs --default-manifest <path> --timings <path> --output <path> [--shard-names name,...] [--fixed-shard-manifest <path> --fixed-shards name,...] [--timing-source <label>]');
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

function names(value, flag) {
  const parsed = (value ?? '').split(',').map(name => name.trim()).filter(Boolean);
  if (parsed.length === 0 || new Set(parsed).size !== parsed.length || parsed.some(name => !name.startsWith('test-suite-shard-'))) {
    fail(`${flag} must be a comma-separated list of unique test-suite-shard names`);
  }
  return parsed;
}

function fixedAssignments(path, fixedShardNames, shardNames, manifest) {
  if (!path && fixedShardNames.length > 0) fail('--fixed-shards requires --fixed-shard-manifest');
  if (path && fixedShardNames.length === 0) fail('--fixed-shard-manifest requires --fixed-shards');
  const assignments = Object.fromEntries(fixedShardNames.map(name => [name, []]));
  if (!path) return { assignments, files: null };

  const source = JSON.parse(readFileSync(path, 'utf8'));
  if (!source?.shards || Array.isArray(source.shards) || !source.files || Array.isArray(source.files)) {
    fail('fixed shard manifest must contain files and a shards object');
  }
  for (const [file, duration] of Object.entries(source.files)) {
    if (!file.startsWith('tests/') || !Number.isFinite(duration) || duration < 0) {
      fail(`fixed shard manifest contains an invalid timing record: ${file}`);
    }
  }
  requireExactFileSet(manifest, source.files);
  const allowed = new Set(shardNames);
  const manifestFiles = new Set(manifest);
  const assigned = new Set();
  for (const shard of fixedShardNames) {
    if (!allowed.has(shard)) fail(`fixed shard is not an output shard: ${shard}`);
    const files = source.shards[shard];
    if (!Array.isArray(files)) fail(`fixed shard manifest is missing ${shard}`);
    for (const file of files) {
      if (typeof file !== 'string' || !manifestFiles.has(file) || assigned.has(file)) {
        fail(`fixed shard manifest contains an invalid or duplicate assignment: ${file}`);
      }
      assigned.add(file);
      assignments[shard].push(file);
    }
    assignments[shard].sort();
  }
  return { assignments, files: source.files };
}

const manifestPath = argument('--default-manifest');
const timingsPath = argument('--timings');
const output = argument('--output');
const shardNames = names(argument('--shard-names') ?? DEFAULT_SHARD_NAMES.join(','), '--shard-names');
const fixedShardNames = argument('--fixed-shards') ? names(argument('--fixed-shards'), '--fixed-shards') : [];
const fixedShardManifest = argument('--fixed-shard-manifest');
const timingSource = argument('--timing-source') ?? 'vitest-json';
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
  const fixed = fixedAssignments(fixedShardManifest, fixedShardNames, shardNames, manifest);
  const fixedFiles = new Set(Object.values(fixed.assignments).flat());
  const timedFiles = manifest.filter(path => !fixedFiles.has(path));
  requireExactFileSet(timedFiles, timings.files);
  const files = fixed.files ? { ...fixed.files, ...timings.files } : timings.files;
  const allocationTargets = shardNames.filter(name => !fixedShardNames.includes(name));
  if (allocationTargets.length === 0) fail('at least one output shard must remain available for allocation');
  const totals = Object.fromEntries(allocationTargets.map(name => [name, 0]));
  const shards = Object.fromEntries(shardNames.map(name => [name, fixed.assignments[name] ?? []]));
  const weightedFiles = timedFiles
    .map(path => ({ path, duration: files[path] }))
    .sort((left, right) => right.duration - left.duration || left.path.localeCompare(right.path));
  for (const file of weightedFiles) {
    const shard = allocationTargets.reduce((best, candidate) => totals[candidate] < totals[best] ? candidate : best);
    shards[shard].push(file.path);
    totals[shard] += file.duration;
  }
  for (const shard of shardNames) shards[shard].sort();

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!commit) fail('git rev-parse HEAD returned an empty commit');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    schemaVersion: 1,
    source: { commit, timingSource },
    files,
    shards,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`allocate-ci-test-shards failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
