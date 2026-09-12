#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function fail(message) {
  throw new Error(message);
}

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function usage() {
  console.error('usage: collect-vitest-file-timings.mjs --input <vitest-json> --output <timings-json> --repo-root <path>');
  process.exit(2);
}

function normalizePath(name, repoRoot) {
  if (typeof name !== 'string' || name.length === 0) fail('reporter test result is missing a name');
  const absolutePath = isAbsolute(name) ? resolve(name) : resolve(repoRoot, name);
  const normalized = relative(repoRoot, absolutePath).split(sep).join('/');
  if (normalized === '' || normalized === '..' || normalized.startsWith('../') || !normalized.startsWith('tests/')) {
    fail(`reporter test path is outside the repository tests directory: ${name}`);
  }
  return normalized;
}

const input = argument('--input');
const output = argument('--output');
const repoRootArgument = argument('--repo-root');
if (!input || !output || !repoRootArgument) usage();

try {
  const repoRoot = resolve(repoRootArgument);
  const reporter = JSON.parse(readFileSync(input, 'utf8'));
  if (reporter?.success !== true) fail('reporter did not succeed');
  if (!Array.isArray(reporter.testResults)) fail('reporter testResults must be an array');

  const files = {};
  for (const result of reporter.testResults) {
    if (result?.status !== 'passed') fail(`reporter result for ${result?.name ?? '<unknown>'} is not passed`);
    const startTime = result.startTime;
    const endTime = result.endTime;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
      fail(`reporter timing for ${result.name ?? '<unknown>'} must be finite and nondecreasing`);
    }
    const path = normalizePath(result.name, repoRoot);
    if (Object.hasOwn(files, path)) fail(`duplicate normalized reporter path: ${path}`);
    files[path] = endTime - startTime;
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`);
} catch (error) {
  console.error(`collect-vitest-file-timings failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
