#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

function usage() {
  console.error('usage: ci-record-phase-timing.mjs --output <file> --phase <name> -- <command> [args...]');
  process.exit(2);
}

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const outputIndex = args.indexOf('--output');
const phaseIndex = args.indexOf('--phase');
if (
  separator < 0 || outputIndex < 0 || phaseIndex < 0
  || !args[outputIndex + 1] || !args[phaseIndex + 1] || !args[separator + 1]
) usage();

const output = args[outputIndex + 1];
const phase = args[phaseIndex + 1];
const command = args.slice(separator + 1);
const startedAt = Date.now();
const child = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
const completedAt = Date.now();
const exitStatus = typeof child.status === 'number' ? child.status : 1;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({
  phase,
  commit: process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? 'unknown',
  startedAtEpochMs: startedAt,
  completedAtEpochMs: completedAt,
  exitStatus,
  elapsedMs: completedAt - startedAt,
}, null, 2)}\n`);

process.exit(exitStatus);
