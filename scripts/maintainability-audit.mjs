#!/usr/bin/env node
// #1013 maintainability audit — a reproducible, deterministic measurement of the
// production `src/` module graph. It replaces the one-off audit in the issue with a
// script whose output can be regenerated and diffed.
//
// What it measures (no line-count merge gate):
//   * per-module: lines, export count, export density, direct production fan-in
//     (runtime and including type-only), and the layers it imports across.
//   * responsibility signals: a documented, deterministic heuristic over export
//     names (definitions / queries / validation / commands / turn-processing /
//     presentation). It is a *screening* signal to be confirmed by reading, not a
//     verdict.
//   * runtime import cycles (type-only edges excluded) and all-edge cycles.
//   * cross-layer runtime edges by layer pair.
//
// Generated data (`*-map-data.ts`) is excluded explicitly; `src/core/types.ts` is
// reported separately (a shared type module is legitimately large).
//
// Usage:
//   node scripts/maintainability-audit.mjs             # markdown report to stdout
//   node scripts/maintainability-audit.mjs --json      # machine-readable metrics
//   node scripts/maintainability-audit.mjs --report    # write the checked-in markdown report
//   node scripts/maintainability-audit.mjs --baseline  # write the drift baseline file
//   node scripts/maintainability-audit.mjs --check     # exit 1 if the graph drifted from the baseline
//
// Regenerate the checked-in report with:
//   ./scripts/run-with-mise.sh yarn node scripts/maintainability-audit.mjs --report

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = resolve(REPO_ROOT, 'src');
const REPORT_PATH = 'docs/maintainability-audit-report.md';
const OVER_500 = 500;

const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const optionValue = flag => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : undefined;
};
// `--baseline-path` lets the #1013 guard point at a synthetic baseline to prove
// the drift check bites, without editing the checked-in one.
const BASELINE_PATH = optionValue('--baseline-path') ?? 'docs/maintainability-audit-baseline.json';

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
    })
    .sort();
}

const allFiles = walk(SRC_ROOT);
const rel = file => relative(REPO_ROOT, file).split('\\').join('/');
const fileSet = new Set(allFiles);

/** Generated map data is excluded from responsibility scoring (issue #1013). */
const isGeneratedData = file => /-map-data\.ts$/.test(file);
const isProductionModule = file => !isGeneratedData(file);
const productionFiles = allFiles.filter(isProductionModule);
const generatedDataFiles = allFiles.filter(isGeneratedData);

// ---------------------------------------------------------------------------
// Module edges (type-only vs runtime)
// ---------------------------------------------------------------------------

function resolveSpec(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = resolve(SRC_ROOT, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, resolve(base, 'index.ts')]) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

/** True when every named specifier in a `{ ... }` clause is `type`-qualified. */
function braceClauseIsTypeOnly(clause) {
  const names = clause
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return names.length > 0 && names.every(name => /^type\s/.test(name));
}

function edgesOf(file) {
  const stripped = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const out = [];
  const namedRe = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = namedRe.exec(stripped))) {
    const kind = match[1];
    const clause = match[2].trim();
    const resolved = resolveSpec(file, match[3]);
    if (!resolved) continue;
    const brace = clause.match(/\{([\s\S]*)\}/);
    const startsType = /^type\b/.test(clause);
    const typeOnly = startsType || (brace ? braceClauseIsTypeOnly(brace[1]) : false) || (kind === 'export' && startsType);
    out.push({ target: resolved, typeOnly });
  }
  const bareRe = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  while ((match = bareRe.exec(stripped))) {
    const resolved = resolveSpec(file, match[1]);
    if (resolved) out.push({ target: resolved, typeOnly: false });
  }
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRe.exec(stripped))) {
    const resolved = resolveSpec(file, match[1]);
    if (resolved) out.push({ target: resolved, typeOnly: false });
  }
  return out;
}

const runtimeOut = new Map();
const allOut = new Map();
const reverseRuntime = new Map();
for (const file of productionFiles) {
  const edges = edgesOf(file);
  const runtimeTargets = [...new Set(edges.filter(edge => !edge.typeOnly).map(edge => edge.target))];
  const allTargets = [...new Set(edges.map(edge => edge.target))];
  runtimeOut.set(file, runtimeTargets);
  allOut.set(file, allTargets);
  for (const target of runtimeTargets) {
    if (!reverseRuntime.has(target)) reverseRuntime.set(target, new Set());
    reverseRuntime.get(target).add(file);
  }
}

// ---------------------------------------------------------------------------
// Exports and responsibility signals
// ---------------------------------------------------------------------------

function exportNames(file) {
  const stripped = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const names = [];
  const declRe = /(?:^|\n)\s*export\s+(?:async\s+)?(function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
  let match;
  while ((match = declRe.exec(stripped))) names.push({ name: match[2], kind: match[1] });
  const listRe = /(?:^|\n)\s*export\s+(?:type\s+)?\{([\s\S]*?)\}/g;
  while ((match = listRe.exec(stripped))) {
    for (const part of match[1].split(',')) {
      const cleaned = part.replace(/^\s*type\s+/, '').trim();
      const alias = cleaned.split(/\s+as\s+/).pop()?.trim();
      if (alias) names.push({ name: alias, kind: 'list' });
    }
  }
  return names;
}

const RESPONSIBILITY_PATTERNS = {
  definitions: /(_DEFINITIONS$|_CATALOG$|_BALANCE$|_TABLE$|_RECIPES$|_STATS$|_ROSTER$|_MAP$|_LABELS$|_TEXT$|_RADIUS$|^[A-Z][A-Z0-9_]+$)/,
  queries: /^(get|find|list|select|query|compute|summari[sz]e|count|describe|resolve|choose|rank|score|evaluate|assess|pick|decide|plan|is|has|can|should)[A-Z_]/,
  validation: /^(validate|assert|ensure|verify|may[A-Z]|cannot|canFound|canConstruct|canAttack|canMove|canTrain|hasAccess|hasPrereq)[A-Z_]/,
  commands: /^(apply|set|add|remove|create|update|execute|start|build|found|train|launch|assign|recall|sign|declare|make|commit|resolveMove|endTurn|run)[A-Z_]/,
  turnProcessing: /^(process|advance|tick|runCurrent|advanceTurn|beginTurn|resolveTurn|simulate|runCompleted)[A-Z_]/,
  presentation: /^(render|format|draw|paint|present|label|route|buildPresentation|toView|resolveVisual)[A-Z_]/,
  other: null,
};

function responsibilitySignals(names) {
  const signals = {};
  for (const key of Object.keys(RESPONSIBILITY_PATTERNS)) signals[key] = 0;
  for (const { name, kind } of names) {
    if (kind === 'interface' || kind === 'type' || kind === 'enum') {
      signals.definitions += 1;
      continue;
    }
    let matched = false;
    for (const [key, pattern] of Object.entries(RESPONSIBILITY_PATTERNS)) {
      if (!pattern) continue;
      if (pattern.test(name)) { signals[key] += 1; matched = true; break; }
    }
    if (!matched) signals.other += 1;
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Layers and cross-layer edges
// ---------------------------------------------------------------------------

function layerOf(file) {
  const parts = rel(file).split('/');
  if (parts[0] !== 'src') return parts[0];
  return parts[1] ?? 'root';
}

const ALLOWED_CROSS_LAYER = new Set([
  // presentation/app/ui/etc. may depend downward; we only *report* here.
]);

function moduleMetrics(file) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n').length;
  const names = exportNames(file);
  const exportCount = names.length;
  const signals = responsibilitySignals(names);
  const runtimeTargets = runtimeOut.get(file) ?? [];
  const crossLayerImports = [...new Set(runtimeTargets.filter(target => layerOf(target) !== layerOf(file)).map(layerOf))].sort();
  return {
    path: rel(file),
    layer: layerOf(file),
    lines,
    exports: exportCount,
    exportDensity: lines > 0 ? Number(((exportCount / lines) * 100).toFixed(2)) : 0,
    fanInRuntime: (reverseRuntime.get(file) ?? new Set()).size,
    over500: lines > OVER_500,
    responsibilitySignals: signals,
    responsibilityCount: Object.values(signals).filter(count => count > 0).length,
    crossLayerImports,
  };
}

const modules = productionFiles.map(moduleMetrics);

// ---------------------------------------------------------------------------
// Cycles (Tarjan SCC, iterative)
// ---------------------------------------------------------------------------

function stronglyConnectedComponents(graph) {
  const indexByNode = new Map();
  const lowLink = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  // Iterative Tarjan so deep graphs cannot overflow the call stack.
  for (const root of graph.keys()) {
    if (indexByNode.has(root)) continue;
    const work = [{ node: root, edgeIndex: 0 }];
    indexByNode.set(root, counter);
    lowLink.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbours = (graph.get(frame.node) ?? []).filter(node => graph.has(node));
      if (frame.edgeIndex < neighbours.length) {
        const next = neighbours[frame.edgeIndex];
        frame.edgeIndex += 1;
        if (!indexByNode.has(next)) {
          indexByNode.set(next, counter);
          lowLink.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, edgeIndex: 0 });
        } else if (onStack.has(next)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node), indexByNode.get(next)));
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1];
          lowLink.set(parent.node, Math.min(lowLink.get(parent.node), lowLink.get(frame.node)));
        }
        if (lowLink.get(frame.node) === indexByNode.get(frame.node)) {
          const component = [];
          let node;
          do {
            node = stack.pop();
            onStack.delete(node);
            component.push(node);
          } while (node !== frame.node);
          if (component.length > 1) components.push(component.map(rel).sort());
        }
      }
    }
  }
  return components.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
}

function graphFor(files, useRuntimeOnly) {
  const graph = new Map();
  for (const file of files) {
    graph.set(file, useRuntimeOnly ? (runtimeOut.get(file) ?? []) : (allOut.get(file) ?? []));
  }
  return graph;
}

const runtimeCycles = stronglyConnectedComponents(graphFor(productionFiles, true));
const allEdgeCycles = stronglyConnectedComponents(graphFor(productionFiles, false));

// --drop a.ts b.ts (repeatable): simulate removing an edge, for "what would fix this" queries.
for (let i = 0; i + 2 < argv.length + 1; i += 1) {
  if (argv[i] !== '--drop') continue;
  const from = resolve(SRC_ROOT, argv[i + 1]);
  const to = resolve(SRC_ROOT, argv[i + 2]);
  runtimeOut.set(from, (runtimeOut.get(from) ?? []).filter(target => target !== to));
  allOut.set(from, (allOut.get(from) ?? []).filter(target => target !== to));
}

// ---------------------------------------------------------------------------
// Cross-layer runtime edges
// ---------------------------------------------------------------------------

const crossLayerEdgeCounts = new Map();
for (const file of productionFiles) {
  for (const target of runtimeOut.get(file) ?? []) {
    const from = layerOf(file);
    const to = layerOf(target);
    if (from === to) continue;
    const key = `${from} -> ${to}`;
    crossLayerEdgeCounts.set(key, (crossLayerEdgeCounts.get(key) ?? 0) + 1);
  }
}
const crossLayerEdges = [...crossLayerEdgeCounts.entries()]
  .map(([pair, count]) => ({ pair, count }))
  .sort((a, b) => (a.pair < b.pair ? -1 : 1));

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

const baseline = {
  schema: 1,
  note: 'Runtime import cycles and cross-layer runtime edges. Regenerate with `node scripts/maintainability-audit.mjs --baseline`. The #1013 guard fails when this drifts.',
  runtimeCycles,
  allEdgeCycles,
  crossLayerEdges,
};

if (has('--baseline')) {
  writeFileSync(resolve(REPO_ROOT, BASELINE_PATH), `${JSON.stringify(baseline, null, 1)}\n`);
  console.log(`wrote ${BASELINE_PATH} (${runtimeCycles.length} runtime cycles, ${allEdgeCycles.length} all-edge cycles)`);
  process.exit(0);
}

if (has('--check')) {
  const baselineFile = resolve(REPO_ROOT, BASELINE_PATH);
  if (!existsSync(baselineFile)) {
    console.error(`missing baseline ${BASELINE_PATH}; run --baseline`);
    process.exit(2);
  }
  const saved = JSON.parse(readFileSync(baselineFile, 'utf8'));
  const problems = [];
  const compare = (label, current, expected) => {
    const currentKeys = current.map(entry => (typeof entry === 'string' ? entry : entry.pair));
    const expectedKeys = expected.map(entry => (typeof entry === 'string' ? entry : entry.pair));
    const added = currentKeys.filter(key => !expectedKeys.includes(key));
    const removed = expectedKeys.filter(key => !currentKeys.includes(key));
    for (const key of added) problems.push(`NEW ${label}: ${key}`);
    for (const key of removed) problems.push(`REMOVED ${label}: ${key}`);
  };
  compare('runtime cycle', runtimeCycles, saved.runtimeCycles ?? []);
  compare('all-edge cycle', allEdgeCycles, saved.allEdgeCycles ?? []);
  compare('cross-layer edge', crossLayerEdges, saved.crossLayerEdges ?? []);
  if (problems.length > 0) {
    console.error(`maintainability audit drifted from ${BASELINE_PATH}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('If the change is intended, regenerate with: node scripts/maintainability-audit.mjs --baseline');
    process.exit(1);
  }
  console.log(`maintainability audit matches ${BASELINE_PATH} (${runtimeCycles.length} runtime cycles, ${allEdgeCycles.length} all-edge cycles)`);
  process.exit(0);
}

if (has('--json')) {
  console.log(JSON.stringify({
    schema: 1,
    totals: {
      srcFiles: allFiles.length,
      productionModules: productionFiles.length,
      excludedGeneratedData: generatedDataFiles.length,
    },
    modules,
    runtimeCycles,
    allEdgeCycles,
    crossLayerEdges,
  }, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

// Rank by fan-in-weighted API surface (criteria 2 + 3): export density × direct
// runtime fan-in. A cohesive data catalog has near-zero density and does not get
// penalized for its size; a widely imported module with a large public surface
// ranks high. This is deterministic; the qualitative "responsibility count"
// (criterion 1) is assessed by reading in docs/maintainability-audit.md.
const scored = modules
  .filter(module => module.over500 && module.path !== 'src/core/types.ts')
  .map(module => ({
    ...module,
    surfaceRisk: Number((module.exportDensity * module.fanInRuntime).toFixed(1)),
  }))
  .sort((a, b) => b.surfaceRisk - a.surfaceRisk || b.exportDensity - a.exportDensity || (a.path < b.path ? -1 : 1));

const lines = [];
lines.push('# Maintainability audit — measured report (#1013)');
lines.push('');
lines.push('> Generated by `scripts/maintainability-audit.mjs`. Do not edit by hand.');
lines.push('> Regenerate with `./scripts/run-with-mise.sh yarn node scripts/maintainability-audit.mjs --report`.');
lines.push('');
lines.push(`Production modules: ${productionFiles.length} · generated map-data excluded: ${generatedDataFiles.length} · runtime cycles: ${runtimeCycles.length} · all-edge cycles: ${allEdgeCycles.length}`);
lines.push('');
lines.push(`## Modules over ${OVER_500} lines`);
lines.push('');
lines.push('Ranked by fan-in-weighted API surface (export density × direct runtime fan-in). Export categories are a name-prefix heuristic — confirm by reading; `other` means the name matched no prefix.');
lines.push('');
lines.push('| Module | Surface (density×fan-in) | Lines | Exports | Density/100 | Fan-in (runtime) | Export categories | Cross-layer imports |');
lines.push('|---|---:|---:|---:|---:|---:|---|---|');
for (const module of scored) {
  const signals = Object.entries(module.responsibilitySignals)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ') || '—';
  lines.push(`| \`${module.path}\` | ${module.surfaceRisk} | ${module.lines} | ${module.exports} | ${module.exportDensity} | ${module.fanInRuntime} | ${signals} | ${module.crossLayerImports.join(', ') || '—'} |`);
}
lines.push('');
lines.push('`src/core/types.ts` is reported separately (shared type module, excluded from the ranking by issue #1013):');
lines.push('');
const typesModule = modules.find(module => module.path === 'src/core/types.ts');
if (typesModule) {
  lines.push(`- \`${typesModule.path}\`: ${typesModule.lines} lines, ${typesModule.exports} exports, density ${typesModule.exportDensity}, runtime fan-in ${typesModule.fanInRuntime}.`);
}
lines.push('');
lines.push(`## Runtime import cycles (${runtimeCycles.length})`);
lines.push('');
if (runtimeCycles.length === 0) lines.push('None.');
for (const component of runtimeCycles) {
  lines.push(`- ${component.map(path => `\`${path}\``).join(' ↔ ')}`);
}
lines.push('');
lines.push(`## All-edge cycles, including type-only (${allEdgeCycles.length})`);
lines.push('');
if (allEdgeCycles.length === 0) lines.push('None.');
for (const component of allEdgeCycles) {
  lines.push(`- ${component.map(path => `\`${path}\``).join(' ↔ ')}`);
}
lines.push('');
lines.push('## Cross-layer runtime edges');
lines.push('');
lines.push('| Layer pair | Runtime edges |');
lines.push('|---|---:|');
for (const edge of crossLayerEdges) lines.push(`| ${edge.pair} | ${edge.count} |`);
lines.push('');

if (has('--report')) {
  writeFileSync(resolve(REPO_ROOT, REPORT_PATH), `${lines.join('\n')}\n`);
  console.log(`wrote ${REPORT_PATH}`);
} else {
  console.log(lines.join('\n'));
}
