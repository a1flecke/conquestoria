#!/usr/bin/env node
// #1232: "I changed these files — what evidence does the repository require?"
//
// The required evidence for a change is scattered across CLAUDE.md, AGENTS.md and
// .claude/rules/*. This tool reads scripts/data/verification-impact.json (ordered,
// reviewable rules that each cite the canonical policy source in `why`) and prints
// the de-duplicated union of required evidence with concrete commands.
//
// It reports requirements; it never runs them, never launches heavy tests, and
// does not bypass the host scheduler (#1166). Durable proof reuse is #1233.
//
// Usage:
//   yarn verify:impact [files...]        # changed files; omit for the git change set
//   node scripts/verification-impact.mjs [--base origin/main] [--json] [files...]
//
// Test/CLI overrides (used by tests/scripts/verification-impact.test.ts):
//   --root DIR                 repository root for existence checks (default: this repo)
//   --config PATH              impact-map JSON (default scripts/data/verification-impact.json)
//   --changed STATUS:PATH      explicit change entry, STATUS in A/M/D/R (repeatable)
//   --file PATH                explicit changed file; status derived from git (repeatable)
//   --json                     stable machine-readable output

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const option = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};
const optionList = name => {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]);
  return out;
};
const has = name => argv.includes(`--${name}`);

const REPO_ROOT = resolve(option('root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const BASE = option('base') ?? 'origin/main';
const CONFIG_PATH = option('config') ?? join(REPO_ROOT, 'scripts/data/verification-impact.json');
const JSON_OUT = has('json');

const STATUS_CODES = new Set(['A', 'M', 'D', 'R', 'C']);

// Positional args (after the flags) are treated as explicit changed files.
const FLAG_WITH_VALUE = new Set(['--base', '--root', '--config', '--changed', '--file']);
function positionalFiles() {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (FLAG_WITH_VALUE.has(token)) { i += 1; continue; }
    if (token.startsWith('--')) continue;
    out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error(`missing impact map: ${CONFIG_PATH}`);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!Array.isArray(config.evidence) || !Array.isArray(config.rules) || !Array.isArray(config.baseline)) {
    throw new Error(`${CONFIG_PATH}: expect evidence[], rules[] and baseline[]`);
  }
  const ids = new Set(config.evidence.map(entry => entry.id));
  if (ids.size !== config.evidence.length) throw new Error(`${CONFIG_PATH}: duplicate evidence id`);
  const referenced = [...config.baseline, ...config.rules.flatMap(rule => rule.require ?? [])];
  for (const id of referenced) if (!ids.has(id)) throw new Error(`${CONFIG_PATH}: unknown evidence id "${id}"`);
  return config;
}

function packageScripts() {
  const path = join(REPO_ROOT, 'package.json');
  if (!existsSync(path)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(path, 'utf8')).scripts ?? {}));
  } catch {
    return new Set();
  }
}

function evidenceProblems(config) {
  const scripts = packageScripts();
  const problems = [];
  for (const entry of config.evidence) {
    for (const command of entry.commands ?? []) {
      const withoutPlaceholders = command.replace(/<[^>]*>/g, '');
      for (const match of withoutPlaceholders.matchAll(/(?<![\w./-])scripts\/[A-Za-z0-9._/-]+/g)) {
        if (!existsSync(join(REPO_ROOT, match[0]))) problems.push(`${entry.id}: command references missing repo script "${match[0]}"`);
      }
      for (const match of withoutPlaceholders.matchAll(/\byarn\s+([A-Za-z0-9:_-]+)/g)) {
        if (!scripts.has(match[1])) problems.push(`${entry.id}: command references missing package script "yarn ${match[1]}"`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Change set
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function trackedAtBase(path) {
  try {
    git(['cat-file', '-e', `${BASE}:${path}`]);
    return true;
  } catch {
    return false;
  }
}

/** Prefer a create/delete/rename status over a plain modification for the same path. */
function addChange(changes, path, status) {
  const current = changes.get(path);
  if (current && current !== 'M' && status === 'M') return;
  changes.set(path, status);
}

function committedChanges(changes) {
  const output = git(['diff', '--name-status', '-M', `${BASE}...HEAD`]);
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    const status = fields[0][0];
    if (status === 'R' || status === 'C') addChange(changes, fields[2], status);
    else addChange(changes, fields[1], status);
  }
}

function uncommittedChanges(changes) {
  const output = git(['status', '--porcelain=v1', '--untracked-files=all']);
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    if (code === '??') { addChange(changes, rest, 'A'); continue; }
    if (code.includes('R') || code.includes('C')) {
      const parts = rest.split(' -> ');
      addChange(changes, parts[parts.length - 1], 'R');
      continue;
    }
    if (code.includes('D')) addChange(changes, rest, 'D');
    else if (code.includes('A')) addChange(changes, rest, 'A');
    else addChange(changes, rest, 'M');
  }
}

function explicitChanges(changes) {
  for (const entry of optionList('changed')) {
    const sep = entry.indexOf(':');
    const status = entry.slice(0, sep).toUpperCase();
    const path = entry.slice(sep + 1);
    if (sep < 1 || !STATUS_CODES.has(status) || !path) throw new Error(`--changed expects STATUS:PATH, got "${entry}"`);
    changes.set(path, status);
  }
  const files = [...optionList('file'), ...positionalFiles()];
  for (const path of files) changes.set(path, trackedAtBase(path) ? 'M' : 'A');
}

function changeSet() {
  const changes = new Map();
  if (optionList('changed').length > 0 || optionList('file').length > 0 || positionalFiles().length > 0) {
    explicitChanges(changes);
  } else {
    committedChanges(changes);
    uncommittedChanges(changes);
  }
  return [...changes.entries()].map(([path, status]) => ({ path, status })).sort((a, b) => (a.path < b.path ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i += 1; } else out += '[^/]*';
    } else if (char === '?') out += '[^/]';
    else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${out}$`);
}

function ruleApplies(rule, change) {
  if (rule.status && !rule.status.includes(change.status)) return false;
  return (rule.match ?? []).some(pattern => globToRegExp(pattern).test(change.path));
}

function requiredEvidenceIds(config, changed) {
  const required = new Set();
  for (const rule of config.rules) {
    if (changed.some(change => ruleApplies(rule, change))) for (const id of rule.require ?? []) required.add(id);
  }
  for (const id of config.baseline) required.add(id);
  return required;
}

// ---------------------------------------------------------------------------
// Mirrored tests
// ---------------------------------------------------------------------------

function mirrorFor(path) {
  if (!path.startsWith('src/') || !path.endsWith('.ts')) return null;
  const candidate = `tests/${path.slice('src/'.length).replace(/\.ts$/, '.test.ts')}`;
  return existsSync(join(REPO_ROOT, candidate)) ? candidate : null;
}

function mirroredTests(changed) {
  return changed
    .map(change => ({ source: change.path, test: mirrorFor(change.path) }))
    .filter(entry => entry.test)
    .sort((a, b) => (a.source < b.source ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function concreteCommands(entry, changed, mirrors) {
  const srcFiles = changed.filter(change => change.path.startsWith('src/')).map(change => change.path).sort();
  const mirrorFiles = mirrors.map(entry => entry.test).sort();
  return (entry.commands ?? []).map(command =>
    command
      .replace('<changed src files>', srcFiles.length ? srcFiles.join(' ') : '<changed src files>')
      .replace('<mirrored test files>', mirrorFiles.length ? mirrorFiles.join(' ') : '<smallest relevant test>'));
}

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`verify:impact: ${error.message}`);
    process.exit(2);
  }

  const validation = evidenceProblems(config);
  if (validation.length > 0) {
    console.error(`verify:impact: impact map references commands that do not exist:`);
    for (const problem of validation) console.error(`  - ${problem}`);
    process.exit(2);
  }

  const changed = changeSet();
  const mirrors = mirroredTests(changed);
  const required = requiredEvidenceIds(config, changed);
  const evidence = config.evidence
    .filter(entry => required.has(entry.id))
    .map(entry => ({ id: entry.id, commands: concreteCommands(entry, changed, mirrors), why: entry.why }));

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, changed, evidence, mirroredTests: mirrors }, null, 2));
    return;
  }

  console.log(`verify:impact — base ${BASE} — ${changed.length} changed file(s)`);
  for (const change of changed) console.log(`  ${change.status} ${change.path}`);
  console.log('');
  if (mirrors.length > 0) {
    console.log('Mirrored tests (exist):');
    for (const entry of mirrors) console.log(`  ${entry.source} -> ${entry.test}`);
    console.log('');
  }
  console.log(`Required evidence (${evidence.length}):`);
  for (const entry of evidence) {
    console.log(`  [${entry.id}]`);
    for (const command of entry.commands) console.log(`      ${command}`);
    console.log(`      why: ${entry.why}`);
  }
}

main();
