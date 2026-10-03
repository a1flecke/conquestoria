#!/usr/bin/env node
// Documentation lifecycle for docs/superpowers/{plans,specs} (#1024).
//
// Source of truth: docs/docs-lifecycle-manifest.json. Every markdown file in the active locations must be
// classified there; a file classified as delivered/superseded/abandoned must NOT exist (git history is the
// archive); durable references must still be referenced from the files that make them durable.
//
//   node scripts/docs-lifecycle.mjs check    [--root DIR]        offline, deterministic (the CI guard)
//   node scripts/docs-lifecycle.mjs propose  [--root DIR] [--issues FILE]   evidence + proposed category per file
//   node scripts/docs-lifecycle.mjs refresh  [--root DIR] [--issues FILE]   update issue-state snapshots + live refs
//
// `check` never touches the network. `propose`/`refresh` read GitHub issue states via `gh issue list`
// (or --issues FILE, a saved `gh issue list --state all --json number,state,title,stateReason` result).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', resolve(dirname(fileURLToPath(import.meta.url)), '..')));
const MANIFEST = 'docs/docs-lifecycle-manifest.json';
const ACTIVE_DIRS = ['docs/superpowers/plans', 'docs/superpowers/specs'];
// Meta files that govern the directories themselves and are not individual plans/specs.
const META = new Set(['docs/superpowers/plans/README.md']);
const KEEP_CATEGORIES = ['active', 'durable-reference'];
const GONE_CATEGORIES = ['delivered-stale', 'superseded', 'abandoned'];
// Files whose references to a plan/spec make it (or keep it) load-bearing.
const LIVE_SCAN_ROOTS = ['src', 'tests', 'scripts', '.claude', '.github', 'docs'];
const LIVE_SCAN_FILES = ['CLAUDE.md', 'AGENTS.md', 'README.md', 'package.json'];
const DOC_REF = /docs\/superpowers\/(?:plans|specs)\/[A-Za-z0-9_.\-]+\.md/g;

const abs = p => join(ROOT, p);
const rel = p => relative(ROOT, p).split('\\').join('/');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.verification', '.yarn', 'dist', '.vite', 'coverage', '.worktrees'].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function activeFiles() {
  const out = [];
  for (const d of ACTIVE_DIRS) for (const f of walk(abs(d))) if (f.endsWith('.md') && !META.has(rel(f))) out.push(rel(f));
  return out.sort();
}

function loadManifest() {
  if (!existsSync(abs(MANIFEST))) return { schema: 1, entries: {}, deleted: {} };
  return JSON.parse(readFileSync(abs(MANIFEST), 'utf8'));
}

/** Files OUTSIDE docs/superpowers (plus the superpowers meta README) that mention a plan/spec path. */
function scanReferences() {
  const hits = new Map(); // docPath -> Set(referencing file)
  const files = [];
  for (const r of LIVE_SCAN_ROOTS) for (const f of walk(abs(r))) files.push(rel(f));
  for (const f of LIVE_SCAN_FILES) if (existsSync(abs(f))) files.push(f);
  for (const f of files) {
    if (f === MANIFEST || f.startsWith('docs/superpowers/')) continue;
    if (!/\.(md|ts|tsx|mjs|js|sh|json|jsonc|yml|yaml|txt|css|html)$/.test(f)) continue;
    let text; try { text = readFileSync(abs(f), 'utf8'); } catch { continue; }
    if (!text.includes('docs/superpowers/')) continue;
    for (const m of text.matchAll(DOC_REF)) {
      if (!hits.has(m[0])) hits.set(m[0], new Set());
      hits.get(m[0]).add(f);
    }
  }
  return hits;
}

function liveMentions(needle) {
  for (const r of LIVE_SCAN_ROOTS) for (const f of walk(abs(r))) {
    const p = rel(f);
    if (p === MANIFEST || p.startsWith('docs/superpowers/')) continue;
    if (!/\.(md|ts|tsx|mjs|js|sh|json|jsonc|yml|yaml|txt)$/.test(p)) continue;
    try { if (readFileSync(f, 'utf8').includes(needle)) return true; } catch { /* unreadable */ }
  }
  return false;
}

function check() {
  const errors = [];
  const m = loadManifest();
  const files = activeFiles();
  const onDisk = new Set(files);
  for (const f of files) {
    const e = m.entries[f];
    if (!e) {
      const gone = m.deleted?.[f];
      errors.push(gone
        ? `${f}: classified ${gone.category} (delivered/superseded/abandoned) but still exists — git history is the archive; delete it`
        : `${f}: unclassified — add it to ${MANIFEST} (active with an open issue, or durable-reference with a live reference)`);
    }
  }
  for (const [f, e] of Object.entries(m.entries)) {
    if (!onDisk.has(f)) errors.push(`${f}: listed in the manifest but missing on disk — remove the entry (or restore the file)`);
    if (!KEEP_CATEGORIES.includes(e.category)) errors.push(`${f}: category "${e.category}" is not allowed for a file that exists (${KEEP_CATEGORIES.join(' | ')})`);
    if (!e.reason || String(e.reason).trim().length < 12) errors.push(`${f}: needs a reason (why this file earns a place in the active tree)`);
    if (e.category === 'active') {
      if (!Array.isArray(e.issues) || e.issues.length === 0) errors.push(`${f}: active plans/specs must name the issue that owns the work`);
      for (const [n, st] of Object.entries(e.issueStates ?? {})) {
        if (String(st).toUpperCase() === 'CLOSED' && (e.issues ?? []).map(String).includes(n) && !e.allowClosedIssue) {
          errors.push(`${f}: active but issue #${n} is recorded CLOSED — the plan is delivered: delete it, or reclassify as durable-reference with a live reference`);
        }
      }
    }
    if (e.category === 'durable-reference') {
      if (!Array.isArray(e.liveReferences) || e.liveReferences.length === 0) errors.push(`${f}: durable-reference must list the files that reference it (liveReferences)`);
      for (const ref of e.liveReferences ?? []) {
        if (!existsSync(abs(ref))) { errors.push(`${f}: broken canonical reference — ${ref} no longer exists`); continue; }
        if (!readFileSync(abs(ref), 'utf8').includes(f)) errors.push(`${f}: broken canonical reference — ${ref} no longer mentions it`);
      }
    }
  }
  for (const f of Object.keys(m.deleted ?? {})) {
    if (!GONE_CATEGORIES.includes(m.deleted[f].category)) errors.push(`${f}: deleted entry has category "${m.deleted[f].category}"`);
  }
  // Orphaned assets: a non-markdown file under docs/superpowers must be named by a surviving doc or live file.
  const assets = walk(abs('docs/superpowers')).map(rel).filter(f => !f.endsWith('.md'));
  if (assets.length) {
    const corpus = [...files, ...[...META].filter(m => existsSync(abs(m)))].map(f => readFileSync(abs(f), 'utf8')).join('\n');
    for (const a of assets) {
      const base = a.split('/').pop();
      if (!corpus.includes(base) && !liveMentions(base)) errors.push(`${a}: orphaned asset — nothing references it; delete it (git history is the archive)`);
    }
  }
  // Dangling references: anything that names a plan/spec must name one that exists.
  const refs = scanReferences();
  for (const [doc, by] of refs) {
    if (!existsSync(abs(doc))) errors.push(`${doc}: dangling reference from ${[...by].sort().join(', ')}`);
  }
  // ...including references inside the surviving plans/specs themselves.
  for (const f of [...files, ...[...META].filter(m => existsSync(abs(m)))]) {
    const text = readFileSync(abs(f), 'utf8');
    for (const mt of text.matchAll(DOC_REF)) if (!existsSync(abs(mt[0]))) errors.push(`${f}: dangling reference to ${mt[0]}`);
  }
  return errors;
}

function loadIssues() {
  const file = opt('issues', '');
  const raw = file ? readFileSync(file, 'utf8')
    : execFileSync('gh', ['issue', 'list', '--state', 'all', '--limit', '5000', '--json', 'number,state,title,stateReason'], { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  const by = new Map();
  for (const i of JSON.parse(raw)) by.set(i.number, i);
  return by;
}

function issuesIn(file, text) {
  const nums = new Set();
  const base = file.split('/').pop();
  for (const mt of base.matchAll(/issue-(\d{2,5})/g)) nums.add(+mt[1]);
  for (const mt of base.matchAll(/(?:^|[-_])(\d{3,5})(?:[-_.]|$)/g)) if (+mt[1] > 100 && +mt[1] < 9999 && !/^20\d\d/.test(mt[1])) nums.add(+mt[1]);
  const head = text.split('\n').slice(0, 40).join('\n');
  for (const mt of head.matchAll(/#(\d{2,5})\b/g)) nums.add(+mt[1]);
  return [...nums].filter(n => n >= 1);
}

function propose() {
  const issues = loadIssues();
  const refs = scanReferences();
  const rows = [];
  for (const f of activeFiles()) {
    const text = readFileSync(abs(f), 'utf8');
    const live = [...(refs.get(f) ?? [])].sort();
    const nums = issuesIn(f, text);
    const states = Object.fromEntries(nums.filter(n => issues.has(n)).map(n => [n, issues.get(n).state]));
    const open = Object.entries(states).filter(([, s]) => s === 'OPEN').map(([n]) => +n);
    const markers = [];
    if (/\bsuperseded\b/i.test(text.slice(0, 4000))) markers.push('superseded');
    if (/\b(abandon|not pursued|no longer (planned|pursued)|descoped|won't do)\b/i.test(text.slice(0, 4000))) markers.push('abandoned');
    let category;
    if (live.length) category = 'durable-reference?';
    else if (open.length) category = 'active?';
    else if (markers.includes('superseded')) category = 'superseded';
    else if (markers.includes('abandoned')) category = 'abandoned';
    else category = 'delivered-stale';
    rows.push({ path: f, category, issues: nums, issueStates: states, openIssues: open, liveReferences: live, markers, bytes: text.length, lines: text.split('\n').length });
  }
  return rows;
}

function refresh() {
  const issues = loadIssues();
  const refs = scanReferences();
  const m = loadManifest();
  for (const [f, e] of Object.entries(m.entries)) {
    e.issueStates = Object.fromEntries((e.issues ?? []).filter(n => issues.has(n)).map(n => [n, issues.get(n).state]));
    if (e.category === 'durable-reference') e.liveReferences = [...(refs.get(f) ?? [])].sort();
  }
  m.refreshedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(abs(MANIFEST), JSON.stringify(m, null, 1) + '\n');
}

if (cmd === 'check') {
  const errors = check();
  if (errors.length) { console.error(`docs lifecycle: ${errors.length} problem(s)\n` + errors.map(e => '  - ' + e).join('\n')); process.exit(1); }
  console.log(`docs lifecycle ok (${Object.keys(loadManifest().entries).length} classified files)`);
} else if (cmd === 'propose') {
  console.log(JSON.stringify(propose(), null, 1));
} else if (cmd === 'refresh') {
  refresh();
} else {
  console.error('usage: docs-lifecycle.mjs check|propose|refresh [--root DIR] [--issues FILE]');
  process.exit(2);
}
