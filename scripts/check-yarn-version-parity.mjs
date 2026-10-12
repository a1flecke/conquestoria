#!/usr/bin/env node
// #1460: one cheap, offline structural check that the Yarn version named by
// package.json ("packageManager"), mise.toml ([tools] yarn) and the checked-in
// yarnPath artifact (.yarnrc.yml -> .yarn/releases/yarn-<version>.cjs) all agree.
//
// Why: package.json and mise.toml declared yarn@4.17.0 while .yarnrc.yml executed
// the checked-in yarn-4.13.0.cjs, so the declared tooling and the CLI that actually
// ran could disagree. CI still passed, which is exactly what made the drift silent.
// This check fails the moment any one of those places is upgraded alone, and it
// also fails a configured yarnPath whose release file is missing on disk.
//
// Usage:
//   node scripts/check-yarn-version-parity.mjs [--root DIR]
//
// Exit 0 when every declaration agrees; exit 1 with one line per problem; exit 2 on
// bad usage. It reads files only, never touches the network or the lockfile.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
// The version Yarn's own bundle embeds (process.env.YARN_IS_TEST_ENV ? "0.0.0" : "<version>"),
// with the `@yarnpkg/cli` package marker as a fallback for a differently bundled release.
const ARTIFACT_VERSION_MARKERS = [
  /YARN_IS_TEST_ENV\?"0\.0\.0":"(\d+\.\d+\.\d+)"/,
  /@yarnpkg\/cli",version:"(\d+\.\d+\.\d+)"/,
];
// The `yarn set version` naming convention: .yarn/releases/yarn-<version>.cjs.
const ARTIFACT_NAME = /^yarn-(\d+\.\d+\.\d+)\.(?:cjs|js)$/;

const argv = process.argv.slice(2);
let root;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--root' && argv[i + 1]) {
    root = argv[i + 1];
    i += 1;
    continue;
  }
  console.error(`usage: check-yarn-version-parity.mjs [--root DIR]\nunknown argument: ${arg}`);
  process.exit(2);
}
const ROOT = resolve(root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));

const problems = [];

function readText(relative) {
  const path = join(ROOT, relative);
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return readFileSync(path, 'utf8');
}

// `yarn@<version>` / `yarn@<version>+sha512.…` are the two Corepack forms.
function readPackageManager() {
  const text = readText('package.json');
  if (text === null) {
    problems.push('package.json is missing');
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    problems.push('package.json is not valid JSON');
    return null;
  }
  const raw = parsed?.packageManager;
  if (typeof raw !== 'string' || raw.length === 0) {
    problems.push('package.json has no "packageManager" field');
    return null;
  }
  const match = raw.match(/^yarn@(\d+\.\d+\.\d+)(?:\+[^\s]+)?$/);
  if (!match) {
    problems.push(`package.json "packageManager" is "${raw}", not a yarn@<major>.<minor>.<patch> declaration`);
    return null;
  }
  return match[1];
}

// Only the [tools] table's `yarn` entry is the runtime pin; another table's `yarn` is not it.
function readMiseYarn() {
  const text = readText('mise.toml');
  if (text === null) {
    problems.push('mise.toml is missing');
    return null;
  }
  let section = '';
  for (const line of text.split('\n')) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (table) {
      section = table[1].trim();
      continue;
    }
    if (section !== 'tools') continue;
    const entry = line.match(/^\s*yarn\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))/);
    if (!entry) continue;
    const raw = entry[1] ?? entry[2] ?? entry[3] ?? '';
    if (!SEMVER.test(raw)) {
      problems.push(`mise.toml yarn version "${raw}" is not <major>.<minor>.<patch>`);
      return null;
    }
    return raw;
  }
  problems.push('mise.toml [tools] does not declare a yarn version');
  return null;
}

function readYarnPath() {
  const text = readText('.yarnrc.yml');
  if (text === null) return null;
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*yarnPath\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    let value = match[1].replace(/\s+#.*$/, '').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

const declaredPackageManager = readPackageManager();
const declaredMise = readMiseYarn();

if (declaredPackageManager && declaredMise && declaredPackageManager !== declaredMise) {
  problems.push(`declared yarn versions disagree: package.json yarn@${declaredPackageManager}, mise.toml ${declaredMise}`);
}

const yarnPath = readYarnPath();
if (yarnPath) {
  const artifactPath = isAbsolute(yarnPath) ? yarnPath : join(ROOT, yarnPath);
  if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    problems.push(`configured yarnPath does not exist: ${yarnPath}`);
  } else {
    const basename = artifactPath.split(/[\\/]/).pop() ?? '';
    const nameVersion = basename.match(ARTIFACT_NAME)?.[1] ?? null;
    if (!nameVersion) {
      problems.push(`configured yarnPath file name "${basename}" does not encode a yarn <major>.<minor>.<patch> version`);
    }
    const content = readFileSync(artifactPath, 'utf8');
    let contentVersion = null;
    for (const marker of ARTIFACT_VERSION_MARKERS) {
      const match = content.match(marker);
      if (match) {
        contentVersion = match[1];
        break;
      }
    }
    if (!contentVersion) {
      problems.push(`could not read a yarn version from configured yarnPath artifact: ${yarnPath}`);
    } else {
      if (nameVersion && nameVersion !== contentVersion) {
        problems.push(`yarnPath artifact "${basename}" contains yarn ${contentVersion}`);
      }
      if (declaredPackageManager && contentVersion !== declaredPackageManager) {
        problems.push(`yarnPath artifact is yarn ${contentVersion}, but package.json declares yarn@${declaredPackageManager}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`yarn version parity: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`yarn version parity ok (yarn ${declaredPackageManager})`);
