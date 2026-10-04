/**
 * The import graph the declarative architecture rules (`rules.ts`) are evaluated over (#1241).
 *
 * Parsing uses the TypeScript compiler's own parser rather than a regex, so comments, template
 * strings, `import type`, inline `type` specifiers, `export … from`, `export *`, dynamic
 * `import('…')` and `typeof import('…')` are all classified by the language, not by pattern
 * matching. Every string a module imports is resolved the way `tsc` resolves it for this repo
 * (`@/…` → `src/…`, relative paths, `index` modules), so an alias import and a relative import of
 * the same file are the same edge.
 *
 * A module is identified by its repo-relative path without extension (`src/systems/crisis-effects`).
 *
 * "Runtime" means "not syntactically type-only" — the same definition `scripts/maintainability-audit.mjs`
 * uses for its cycle baseline (`rules.test.ts` cross-checks the two agree).
 *
 * Output is deterministic: modules and edges are sorted, nothing depends on directory-read order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export type EdgeScope = 'runtime' | 'all';

export interface ImportEdge {
  readonly from: string;
  readonly to: string;
  /** `import type …`, `export type … from`, `import { type A }` (all specifiers), `typeof import('x')`. */
  readonly typeOnly: boolean;
  /** Bindings taken from `to`: the imported name, `default`, or `*` (namespace import / `export *`). Empty for side-effect and dynamic imports. */
  readonly names: readonly string[];
  /** The specifier exactly as written. */
  readonly specifier: string;
  /** `import('…')` / `typeof import('…')` rather than a static declaration. */
  readonly dynamic: boolean;
}

export interface ImportGraph {
  /** Every module id, sorted. */
  readonly modules: readonly string[];
  /** Every resolved edge, sorted by (from, to, specifier). */
  readonly edges: readonly ImportEdge[];
  /** Repo-relative path *with* extension for a module id. */
  pathOf(id: string): string;
  edgesFrom(id: string): readonly ImportEdge[];
  edgesTo(id: string): readonly ImportEdge[];
  /** Distinct targets `id` imports, sorted. */
  targetsOf(id: string, scope: EdgeScope): string[];
  /** Distinct modules importing `id`, sorted. */
  importersOf(id: string, scope: EdgeScope): string[];
}

export const inScope = (edge: ImportEdge, scope: EdgeScope): boolean => scope === 'all' || !edge.typeOnly;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface RawImport {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly names: readonly string[];
  readonly dynamic: boolean;
}

const nameOf = (id: ts.ModuleExportName): string => id.text;

function rawImportsOf(path: string, source: string): RawImport[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ false,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: RawImport[] = [];

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const specifier = statement.moduleSpecifier.text;
      if (!clause) {
        out.push({ specifier, typeOnly: false, names: [], dynamic: false });
        continue;
      }
      const names: string[] = [];
      if (clause.name) names.push('default');
      const bindings = clause.namedBindings;
      let everySpecifierTypeOnly = false;
      if (bindings && ts.isNamespaceImport(bindings)) names.push('*');
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) names.push(nameOf(element.propertyName ?? element.name));
        everySpecifierTypeOnly = bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly);
      }
      const typeOnly = clause.isTypeOnly || (!clause.name && everySpecifierTypeOnly);
      out.push({ specifier, typeOnly, names, dynamic: false });
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.exportClause;
      const names: string[] = [];
      let everySpecifierTypeOnly = false;
      if (!clause || ts.isNamespaceExport(clause)) names.push('*');
      else {
        for (const element of clause.elements) names.push(nameOf(element.propertyName ?? element.name));
        everySpecifierTypeOnly = clause.elements.length > 0 && clause.elements.every(element => element.isTypeOnly);
      }
      out.push({
        specifier: statement.moduleSpecifier.text,
        typeOnly: statement.isTypeOnly || everySpecifierTypeOnly,
        names,
        dynamic: false,
      });
    } else if (
      ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      out.push({ specifier: statement.moduleReference.expression.text, typeOnly: statement.isTypeOnly, names: ['='], dynamic: false });
    }
  }

  // A dynamic `import('…')` can sit anywhere in a file; only pay for a full walk when the text could contain one.
  if (source.includes('import(')) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length > 0
        && ts.isStringLiteralLike(node.arguments[0]!)
      ) {
        out.push({ specifier: (node.arguments[0] as ts.StringLiteralLike).text, typeOnly: false, names: [], dynamic: true });
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        out.push({ specifier: node.argument.literal.text, typeOnly: true, names: [], dynamic: true });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolution and graph construction
// ---------------------------------------------------------------------------

const MODULE_EXTENSION = /\.(?:tsx?|js)$/;
const idOfPath = (path: string): string => path.replace(/\.tsx?$/, '');

/** Resolve a specifier written in module `fromId` to a module id in `ids`, or `null` for externals/unknowns. */
function resolveSpecifier(fromId: string, specifier: string, ids: ReadonlySet<string>): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = posix.normalize(posix.join(posix.dirname(fromId), specifier));
  else return null;
  base = base.replace(MODULE_EXTENSION, '');
  if (ids.has(base)) return base;
  const index = `${base}/index`;
  return ids.has(index) ? index : null;
}

/**
 * Build a graph from `{ 'src/a.ts': 'source…' }`. Keys are repo-relative posix paths with an extension.
 * Hermetic: `rules.test.ts` builds fixture graphs this way to prove each rule kind fails when it should.
 */
export function buildImportGraph(files: Readonly<Record<string, string>>): ImportGraph {
  const paths = Object.keys(files).sort();
  const pathById = new Map(paths.map(path => [idOfPath(path), path] as const));
  const ids = new Set(pathById.keys());
  const modules = [...ids].sort();

  const edges: ImportEdge[] = [];
  for (const path of paths) {
    const from = idOfPath(path);
    for (const raw of rawImportsOf(path, files[path]!)) {
      const to = resolveSpecifier(from, raw.specifier, ids);
      if (to === null) continue;
      edges.push({ from, to, typeOnly: raw.typeOnly, names: raw.names, specifier: raw.specifier, dynamic: raw.dynamic });
    }
  }
  edges.sort((a, b) =>
    compare(a.from, b.from) || compare(a.to, b.to) || compare(a.specifier, b.specifier) || compare(a.names.join(','), b.names.join(',')));

  const outgoing = new Map<string, ImportEdge[]>();
  const incoming = new Map<string, ImportEdge[]>();
  for (const edge of edges) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge);
  }
  const distinct = (list: readonly ImportEdge[], pick: (edge: ImportEdge) => string, scope: EdgeScope) =>
    [...new Set(list.filter(edge => inScope(edge, scope)).map(pick))].sort();

  return {
    modules,
    edges,
    pathOf: id => pathById.get(id) ?? id,
    edgesFrom: id => outgoing.get(id) ?? [],
    edgesTo: id => incoming.get(id) ?? [],
    targetsOf: (id, scope) => distinct(outgoing.get(id) ?? [], edge => edge.to, scope),
    importersOf: (id, scope) => distinct(incoming.get(id) ?? [], edge => edge.from, scope),
  };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Loading the repository
// ---------------------------------------------------------------------------

// import.meta.url (not __dirname) so the same module loads under vitest and under `tsx` scripts.
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const DEFAULT_GRAPH_ROOTS: readonly string[] = ['src', 'tests'];

function walkSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return walkSources(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

/** Repo-relative path → source for every `.ts`/`.tsx` under the given roots. */
export function loadRepoSources(roots: readonly string[] = DEFAULT_GRAPH_ROOTS): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const root of roots) {
    for (const file of walkSources(resolve(REPO_ROOT, root))) {
      sources[file.slice(REPO_ROOT.length + 1).split(sep).join('/')] = readFileSync(file, 'utf8');
    }
  }
  return sources;
}

let repoGraph: ImportGraph | undefined;
/** The working tree's graph (`src/` and `tests/`), built once per test worker. */
export function loadRepoImportGraph(): ImportGraph {
  repoGraph ??= buildImportGraph(loadRepoSources());
  return repoGraph;
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

/**
 * Strongly connected components with more than one member (or a self-import) among `members`, over
 * edges in `scope`. Iterative Tarjan, so a deep graph cannot overflow the stack. Components and their
 * members are sorted.
 */
export function findCycleComponents(graph: ImportGraph, members: ReadonlySet<string>, scope: EdgeScope): string[][] {
  const neighbours = (node: string) => graph.targetsOf(node, scope).filter(target => members.has(target));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of [...members].sort()) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; next: number; adjacent: string[] }> = [];
    const open = (node: string) => {
      index.set(node, counter);
      low.set(node, counter);
      counter += 1;
      stack.push(node);
      onStack.add(node);
      work.push({ node, next: 0, adjacent: neighbours(node) });
    };
    open(root);
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      if (frame.next < frame.adjacent.length) {
        const target = frame.adjacent[frame.next]!;
        frame.next += 1;
        if (!index.has(target)) open(target);
        else if (onStack.has(target)) low.set(frame.node, Math.min(low.get(frame.node)!, index.get(target)!));
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) !== index.get(frame.node)) continue;
      const component: string[] = [];
      let node: string;
      do {
        node = stack.pop()!;
        onStack.delete(node);
        component.push(node);
      } while (node !== frame.node);
      const selfImport = component.length === 1 && neighbours(component[0]!).includes(component[0]!);
      if (component.length > 1 || selfImport) components.push(component.sort());
    }
  }
  return components.sort((a, b) => compare(a.join('|'), b.join('|')));
}

/** One shortest concrete cycle through the component's first module, e.g. `a → b → c → a`. */
export function describeCycle(graph: ImportGraph, component: readonly string[], scope: EdgeScope): string {
  const inside = new Set(component);
  const start = component[0]!;
  const previous = new Map<string, string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head]!;
    for (const target of graph.targetsOf(node, scope).filter(candidate => inside.has(candidate))) {
      if (target === start) {
        const path = [node];
        for (let cursor = node; cursor !== start; cursor = previous.get(cursor)!) path.unshift(previous.get(cursor)!);
        return [...path, start].join(' → ');
      }
      if (!previous.has(target)) {
        previous.set(target, node);
        queue.push(target);
      }
    }
  }
  return component.join(' ↔ ');
}
