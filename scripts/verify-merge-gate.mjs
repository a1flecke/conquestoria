#!/usr/bin/env node

const REQUIRED_JOBS = [
  'web-build',
  'test-suite-shard-a',
  'test-suite-shard-b',
  'test-suite-shard-c',
  'hooks',
  'web-smoke',
  'security-analysis',
  'desktop-change-check',
  'tauri-frontend-build',
];

function readNeeds() {
  try {
    const needs = JSON.parse(process.env.GATE_NEEDS_JSON ?? '');
    if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
      throw new Error('must be an object');
    }
    return needs;
  } catch (error) {
    console.error(`merge-gate rejected: invalid GATE_NEEDS_JSON (${error.message})`);
    process.exit(2);
  }
}

function resultOf(needs, jobId, failures) {
  const result = needs[jobId]?.result;
  if (typeof result !== 'string' || result.length === 0) {
    failures.push(`${jobId}: missing result`);
    return null;
  }
  return result;
}

function requireSuccess(needs, jobId, failures) {
  const result = resultOf(needs, jobId, failures);
  if (result !== null && result !== 'success') {
    failures.push(`${jobId}: expected success, received ${result}`);
  }
}

const needs = readNeeds();
const eventName = process.env.GATE_EVENT_NAME ?? '';
const ref = process.env.GATE_REF ?? '';
const desktopChanged = process.env.GATE_DESKTOP_CHANGED ?? '';
const failures = [];

for (const jobId of REQUIRED_JOBS) requireSuccess(needs, jobId, failures);

if (desktopChanged !== 'true' && desktopChanged !== 'false') {
  failures.push(`desktop-change-check: invalid desktop_changed output ${JSON.stringify(desktopChanged)}`);
}

const macosResult = resultOf(needs, 'tauri-macos-build', failures);
const macosRequired = ref === 'refs/heads/main' || desktopChanged === 'true';
if (macosResult !== null && macosResult !== 'success' && !(macosResult === 'skipped' && !macosRequired)) {
  failures.push(
    `tauri-macos-build: expected ${macosRequired ? 'success' : 'success or skipped'}, received ${macosResult}`,
  );
}

const pirateResult = resultOf(needs, 'pirate-audio-reproducibility', failures);
if (pirateResult !== null && pirateResult !== 'success' && !(pirateResult === 'skipped' && eventName !== 'pull_request')) {
  failures.push(
    `pirate-audio-reproducibility: expected ${eventName === 'pull_request' ? 'success' : 'success or skipped'}, received ${pirateResult}`,
  );
}

if (failures.length > 0) {
  console.error(`merge-gate rejected:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log('merge-gate accepted all required child results');
