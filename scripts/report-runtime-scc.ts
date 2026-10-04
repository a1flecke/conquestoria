/**
 * #1248: the evidence report for reducing the src/ runtime import cycles, from the same graph the
 * declarative architecture rules use (type-only edges excluded, like the #1013 audit baseline).
 *
 *   bash scripts/run-with-mise.sh yarn architecture:scc
 *
 * Prints, for every runtime strongly connected component: its members, its internal edge count, the
 * edges whose single removal shrinks the largest one (with the bindings each carries, which is what tells
 * you whether it is a barrel-mediated edge or a real ownership problem), and a greedy cut sequence — the
 * smallest set of edges it can find that dissolves the component. It reads, never writes: use it to pick the
 * next bounded cut, then regenerate docs/maintainability-audit-baseline.json after the cut lands.
 */
import { findCycleComponents, loadRepoImportGraph, type ImportGraph } from '../tests/app/architecture/import-graph';

const graph = loadRepoImportGraph();
const production = new Set(
  graph.modules.filter(id => id.startsWith('src/') && graph.pathOf(id).endsWith('.ts') && !/-map-data$/.test(id)),
);
const short = (id: string) => id.replace(/^src\//, '');
const components = findCycleComponents(graph, production, 'runtime');

console.log(`runtime SCC count: ${components.length}`);
console.log(`component sizes: ${components.map(component => component.length).join(', ') || 'none'}`);
if (components.length === 0) process.exit(0);

const largest = components.reduce((a, b) => (b.length > a.length ? b : a));
const inside = new Set(largest);
const pair = (from: string, to: string) => `${from}>${to}`;

interface InternalEdge { from: string; to: string; names: string[] }
const byPair = new Map<string, InternalEdge>();
for (const edge of graph.edges) {
  if (edge.typeOnly || edge.from === edge.to || !inside.has(edge.from) || !inside.has(edge.to)) continue;
  const entry = byPair.get(pair(edge.from, edge.to)) ?? { from: edge.from, to: edge.to, names: [] };
  for (const name of edge.names) if (!entry.names.includes(name)) entry.names.push(name);
  byPair.set(pair(edge.from, edge.to), entry);
}
const edges = [...byPair.values()].sort((a, b) => pair(a.from, a.to).localeCompare(pair(b.from, b.to)));

const largestWithout = (dropped: ReadonlySet<string>): number => {
  const view: ImportGraph = {
    ...graph,
    targetsOf: (id, scope) => graph.targetsOf(id, scope).filter(target => !dropped.has(pair(id, target))),
  };
  const remaining = findCycleComponents(view, inside, 'runtime');
  return remaining.length === 0 ? 1 : Math.max(...remaining.map(component => component.length));
};

console.log(`\nlargest component: ${largest.length} modules, ${edges.length} internal runtime edges`);
console.log(largest.map(short).join('\n  ').replace(/^/, '  '));

console.log('\ninternal runtime edges (importer -> imported {bindings}):');
for (const edge of edges) console.log(`  ${short(edge.from)} -> ${short(edge.to)} {${edge.names.sort().join(', ')}}`);

console.log('\nsingle-edge cuts that shrink it (edge -> largest component afterwards):');
const single = edges
  .map(edge => ({ edge, after: largestWithout(new Set([pair(edge.from, edge.to)])) }))
  .filter(row => row.after < largest.length)
  .sort((a, b) => a.after - b.after);
for (const { edge, after } of single) {
  console.log(`  ${short(edge.from)} -> ${short(edge.to)} {${edge.names.sort().join(', ')}} => ${after}`);
}
if (single.length === 0) console.log('  (none — every cut leaves redundant paths; see the greedy sequence)');

console.log('\ngreedy cut sequence (smallest set found that dissolves the largest component):');
const dropped = new Set<string>();
let current = largest.length;
for (let step = 1; current > 1 && step <= 20; step += 1) {
  let best: { edge: InternalEdge; size: number } | undefined;
  for (const edge of edges) {
    if (dropped.has(pair(edge.from, edge.to))) continue;
    const size = largestWithout(new Set([...dropped, pair(edge.from, edge.to)]));
    if (!best || size < best.size) best = { edge, size };
  }
  if (!best || best.size >= current) break;
  dropped.add(pair(best.edge.from, best.edge.to));
  current = best.size;
  console.log(`  ${step}. ${short(best.edge.from)} -> ${short(best.edge.to)} {${best.edge.names.sort().join(', ')}} => ${current}`);
}
