#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';

const [secondsText, label, separator, command, ...args] = process.argv.slice(2);
const timeoutSeconds = Number(secondsText);

if (
  !Number.isFinite(timeoutSeconds)
  || timeoutSeconds <= 0
  || !label
  || separator !== '--'
  || !command
) {
  console.error('Usage: run-with-timeout.mjs <seconds> <label> -- <command> [args...]');
  process.exit(2);
}

const detached = process.platform !== 'win32';
const child = spawn(command, args, {
  detached,
  stdio: 'inherit',
});

let timedOut = false;
let stalled = false;
let forceKillTimer;

function signalChild(signal) {
  if (child.pid === undefined) return;
  try {
    if (detached) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  console.error(`ERROR: ${label} timed out after ${timeoutSeconds}s.`);
  signalChild('SIGTERM');
  forceKillTimer = setTimeout(() => signalChild('SIGKILL'), 1_000);
  forceKillTimer.unref();
}, timeoutSeconds * 1_000);

// Stall watchdog: every caller of this script (a Vitest run or a production build) is
// CPU-bound once it actually starts, so a process group producing genuinely ZERO CPU
// progress for a sustained stretch cannot be legitimate slow work the way "no new
// stdout" can be (Vitest's default reporter is silent for the whole duration of a
// single long-running test, so a stdout-based heartbeat would false-positive on
// real work). Observed once on this host: an `ai-long-horizon` run launched moments
// after two heavy `yarn test` runs sat at 0.0% CPU, having never spawned a worker
// process, for over an hour -- well under this script's own absolute ceiling above --
// before anyone noticed. This turns that silent, ambiguous wait into a fast, clearly
// labeled failure instead. Disable per-invocation with STALL_WATCHDOG_DISABLE=1.
const stallWatchdogDisabled = process.env.STALL_WATCHDOG_DISABLE === '1';
const stallBootGraceSeconds = Number(process.env.STALL_BOOT_GRACE_SECONDS ?? 20);
const stallGraceSeconds = Number(process.env.STALL_GRACE_SECONDS ?? 90);
const stallCheckIntervalSeconds = Number(process.env.STALL_CHECK_INTERVAL_SECONDS ?? 15);

function parseTimeToSeconds(timeText) {
  if (!timeText) return null;
  const [daysPart, rest] = timeText.includes('-') ? timeText.split('-') : [null, timeText];
  const segments = rest.split(':').map(Number);
  if (segments.length === 0 || segments.some(Number.isNaN)) return null;
  let seconds = 0;
  for (const segment of segments) seconds = seconds * 60 + segment;
  if (daysPart !== null) {
    const days = Number(daysPart);
    if (Number.isNaN(days)) return null;
    seconds += days * 86400;
  }
  return seconds;
}

// Samples accumulated CPU time per pid for every process sharing `pgid` (the whole
// detached process group -- `detached: true` gives the child a pgid equal to its own
// pid, and any further descendants it forks, such as a Vitest worker pool, inherit
// that same pgid). Returns a Map<pid, cpuSeconds>, or null on any sampling failure so
// the watchdog can skip a cycle rather than ever risk a false kill from a transient
// `ps` hiccup.
//
// Progress is judged per pid (see `hasCpuProgress`), never from a group-wide sum: a
// Vitest pool recycles its workers, and an exited worker's CPU time vanishes from
// `ps`, so a group sum can sit below its earlier high-water mark for minutes while
// fresh workers are doing real work -- observed on a 4-core container, where that
// dip outlasted the 90s grace and a healthy `yarn test:regular` was killed as stalled.
function sampleProcessGroupCpu(pgid) {
  let output;
  try {
    output = execFileSync('ps', ['-eo', 'pid=,pgid=,time='], { encoding: 'utf8' });
  } catch {
    return null;
  }
  const sample = new Map();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pidText, pgidText, timeText] = trimmed.split(/\s+/);
    if (Number(pgidText) !== pgid) continue;
    const seconds = parseTimeToSeconds(timeText);
    if (seconds === null) continue;
    sample.set(Number(pidText), seconds);
  }
  return sample.size > 0 ? sample : null;
}

// True when any process present in both samples gained CPU time, or a process
// appeared that was not there before (a fork is activity; a genuinely stalled run
// never spawns anything).
function hasCpuProgress(previous, current) {
  for (const [pid, seconds] of current) {
    const before = previous.get(pid);
    if (before === undefined || seconds > before + 0.01) return true;
  }
  return false;
}

let stallTimer;
if (!stallWatchdogDisabled && detached
  && Number.isFinite(stallBootGraceSeconds) && Number.isFinite(stallGraceSeconds)
  && Number.isFinite(stallCheckIntervalSeconds) && stallCheckIntervalSeconds > 0) {
  const startedAt = Date.now();
  let lastSample = null;
  let lastProgressAt = startedAt;
  stallTimer = setInterval(() => {
    if (child.pid === undefined || timedOut) return;
    if ((Date.now() - startedAt) / 1000 < stallBootGraceSeconds) return;
    const sample = sampleProcessGroupCpu(child.pid);
    if (sample === null) return;
    const progressed = lastSample === null || hasCpuProgress(lastSample, sample);
    lastSample = sample;
    if (progressed) {
      lastProgressAt = Date.now();
      return;
    }
    const stalledForSeconds = (Date.now() - lastProgressAt) / 1000;
    if (stalledForSeconds >= stallGraceSeconds) {
      timedOut = true;
      stalled = true;
      console.error(
        `STALL: ${label} produced zero CPU progress across its process group for `
        + `${Math.round(stalledForSeconds)}s (after a ${stallBootGraceSeconds}s startup `
        + 'grace) -- likely OS/tooling resource contention from a preceding heavy '
        + `invocation, not legitimate slow work. Safe to retry immediately rather than `
        + `waiting for the full ${timeoutSeconds}s ceiling.`,
      );
      signalChild('SIGTERM');
      forceKillTimer = setTimeout(() => signalChild('SIGKILL'), 1_000);
      forceKillTimer.unref();
    }
  }, stallCheckIntervalSeconds * 1_000);
  stallTimer.unref();
}

child.on('error', error => {
  clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (stallTimer) clearInterval(stallTimer);
  console.error(`ERROR: could not start ${label}: ${error.message}`);
  process.exitCode = 127;
});

child.on('exit', (code, signal) => {
  clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (stallTimer) clearInterval(stallTimer);
  if (timedOut) {
    process.exitCode = stalled ? 125 : 124;
    return;
  }
  if (code !== null) {
    process.exitCode = code;
    return;
  }
  console.error(`ERROR: ${label} ended from signal ${signal ?? 'unknown'}.`);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => signalChild(signal));
}
