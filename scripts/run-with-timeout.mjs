#!/usr/bin/env node

import { spawn } from 'node:child_process';

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

child.on('error', error => {
  clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  console.error(`ERROR: could not start ${label}: ${error.message}`);
  process.exitCode = 127;
});

child.on('exit', (code, signal) => {
  clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (timedOut) {
    process.exitCode = 124;
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
