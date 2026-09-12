#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SHARDS = [
  'test-suite-shard-a',
  'test-suite-shard-b',
  'test-suite-shard-c',
  'test-suite-shard-d',
];

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function fail(message) {
  throw new Error(message);
}

function usage(message) {
  if (message) console.error(message);
  console.error(`usage: run-ci-test-shard.mjs --shard ${SHARDS.join('|')} [--list-files] [--report-json <path>]`);
  process.exit(2);
}

function defaultDiscovery() {
  const result = spawnSync('yarn', ['test:manifest'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    fail(`could not discover default Vitest tests: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.split('\n').map(line => line.trim()).filter(path => path.startsWith('tests/')).sort();
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !manifest.files || Array.isArray(manifest.files) || !manifest.shards) {
    fail('CI shard manifest has an unsupported schema');
  }
  const assignments = [];
  for (const shard of SHARDS) {
    const files = manifest.shards[shard];
    if (!Array.isArray(files)) fail(`CI shard manifest is missing ${shard}`);
    assignments.push(...files);
  }
  const uniqueAssignments = new Set(assignments);
  if (assignments.some(path => typeof path !== 'string' || !path.startsWith('tests/')) || uniqueAssignments.size !== assignments.length) {
    fail('CI shard manifest contains an invalid or duplicate assignment');
  }
  const assigned = [...uniqueAssignments].sort();
  const weightedFiles = Object.keys(manifest.files).sort();
  const discovered = defaultDiscovery();
  if (
    assigned.length !== discovered.length
    || assigned.some((path, index) => path !== discovered[index])
    || weightedFiles.length !== discovered.length
    || weightedFiles.some((path, index) => path !== discovered[index])
  ) {
    fail('CI shard manifest does not match default discovery; regenerate it after adding, removing, or renaming tests');
  }
  return manifest.shards;
}

const shard = argument('--shard');
const manifestPath = argument('--manifest') ?? resolve('scripts/ci-test-shards.json');
const listFiles = process.argv.includes('--list-files');
const reportJson = argument('--report-json');
if (!shard || !SHARDS.includes(shard)) usage(`unknown CI shard: ${shard ?? '<missing>'}`);
if (listFiles && reportJson) usage('--list-files cannot be combined with --report-json');

try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const shards = validateManifest(manifest);
  const files = shards[shard];
  if (listFiles) {
    process.stdout.write(`${files.join('\n')}\n`);
    process.exit(0);
  }

  const vitestArgs = ['vitest', 'run', ...files];
  if (reportJson) {
    mkdirSync(dirname(reportJson), { recursive: true });
    vitestArgs.push('--reporter=default', '--reporter=json', `--outputFile.json=${reportJson}`);
  }
  const result = spawnSync('yarn', vitestArgs, { stdio: 'inherit' });
  process.exit(typeof result.status === 'number' ? result.status : 1);
} catch (error) {
  console.error(`run-ci-test-shard failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
