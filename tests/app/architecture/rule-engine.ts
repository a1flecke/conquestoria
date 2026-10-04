/**
 * Declarative architecture rules (#1241): the vocabulary and the evaluator.
 *
 * A rule is data — a stable id, a kind, scope matchers and a `why`. `evaluateRules` runs a list of
 * them over an `ImportGraph` and returns violations that name the rule id, the offending edge or
 * module, and the `why`, so a failure explains itself without opening the test.
 *
 * Two properties are built in, because every hand-written check before this layer lacked them:
 *  - **No silent rot.** A matcher pattern that matches no module, an exception for an edge that no
 *    longer exists, and an allowed importer that imports nothing are all violations. A rule cannot
 *    pass vacuously because a file was renamed.
 *  - **Explicit scope.** Every rule states whether it constrains `runtime` edges or `all` edges
 *    (type-only included); there is no default.
 *
 * Matchers are globs over module ids (repo path without extension): `*` is one path segment's
 * characters, `**` crosses directories. `src/ui/**`, `src/systems/crisis-*`, `src/systems/unit-system`.
 *
 * Barrel/export-surface and other semantic checks are NOT import-graph facts and stay in
 * `architecture-boundaries.test.ts`.
 */
import { describeCycle, findCycleComponents, inScope, type EdgeScope, type ImportGraph } from './import-graph';

export type ModuleMatcher = string | readonly string[];

export interface RuleException {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

interface RuleBase {
  /** Stable, unique, kebab-case. Shown in every failure. */
  readonly id: string;
  /** The design reason the constraint exists. */
  readonly why: string;
}

/** No module matching `from` may import a module matching `to` (except listed, still-needed exceptions). */
export interface ForbiddenImportRule extends RuleBase {
  readonly kind: 'forbidden-import';
  readonly from: ModuleMatcher;
  readonly to: ModuleMatcher;
  readonly edges: EdgeScope;
  readonly exceptions?: readonly RuleException[];
}

/** Every module matching `from` imports from `to` exactly the bindings in `names` — one narrow seam. */
export interface ImportSeamRule extends RuleBase {
  readonly kind: 'import-seam';
  readonly from: ModuleMatcher;
  readonly to: string;
  readonly names: readonly string[];
  readonly edges: EdgeScope;
}

/** The modules matching `members` form no import cycle among themselves. */
export interface AcyclicGroupRule extends RuleBase {
  readonly kind: 'acyclic-group';
  readonly members: ModuleMatcher;
  readonly edges: EdgeScope;
}

/** Modules matching `target` are imported only by `importers` (imports among the targets themselves are ignored). */
export interface OnlyImportedByRule extends RuleBase {
  readonly kind: 'only-imported-by';
  readonly target: ModuleMatcher;
  readonly importers: readonly string[];
  readonly edges: EdgeScope;
}

export type ArchitectureRule = ForbiddenImportRule | ImportSeamRule | AcyclicGroupRule | OnlyImportedByRule;

export interface RuleViolation {
  readonly ruleId: string;
  readonly why: string;
  readonly message: string;
}

export const formatViolation = (violation: RuleViolation): string =>
  `[${violation.ruleId}] ${violation.message}\n    why: ${violation.why}`;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const escapeRegExp = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const patternCache = new Map<string, RegExp>();

export function matchesModule(pattern: string, id: string): boolean {
  let regex = patternCache.get(pattern);
  if (!regex) {
    regex = new RegExp(`^${pattern.split('**').map(part => part.split('*').map(escapeRegExp).join('[^/]*')).join('.*')}$`);
    patternCache.set(pattern, regex);
  }
  return regex.test(id);
}

const patternsOf = (matcher: ModuleMatcher): readonly string[] => (typeof matcher === 'string' ? [matcher] : matcher);

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateRules(graph: ImportGraph, rules: readonly ArchitectureRule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const seenIds = new Set<string>();

  for (const rule of rules) {
    const report = (message: string) => violations.push({ ruleId: rule.id, why: rule.why, message });
    if (seenIds.has(rule.id)) report('duplicate rule id');
    seenIds.add(rule.id);
    if (rule.why.trim().length < 20) report('`why` must state the design reason (at least 20 characters)');

    /** Modules matched by `matcher`; reports every pattern that matches nothing. */
    const select = (matcher: ModuleMatcher, role: string): Set<string> => {
      const selected = new Set<string>();
      for (const pattern of patternsOf(matcher)) {
        const matched = graph.modules.filter(id => matchesModule(pattern, id));
        if (matched.length === 0) report(`${role} pattern "${pattern}" matches no module (renamed or deleted? update or remove the rule)`);
        for (const id of matched) selected.add(id);
      }
      return selected;
    };

    switch (rule.kind) {
      case 'forbidden-import': {
        const from = select(rule.from, 'from');
        const to = select(rule.to, 'to');
        const excepted = new Set((rule.exceptions ?? []).map(e => `${e.from} -> ${e.to}`));
        const reported = new Set<string>();
        const present = new Set<string>();
        for (const edge of graph.edges) {
          if (!inScope(edge, rule.edges) || edge.from === edge.to || !from.has(edge.from) || !to.has(edge.to)) continue;
          const key = `${edge.from} -> ${edge.to}`;
          present.add(key);
          if (excepted.has(key) || reported.has(key)) continue;
          reported.add(key);
          report(`${edge.from} imports ${edge.to} (${edge.specifier})`);
        }
        for (const exception of rule.exceptions ?? []) {
          const key = `${exception.from} -> ${exception.to}`;
          if (exception.reason.trim().length < 10) report(`exception ${key} needs a real reason`);
          if (!from.has(exception.from) || !to.has(exception.to)) report(`exception ${key} is outside this rule's from/to scope`);
          else if (!present.has(key)) report(`stale exception: ${exception.from} no longer imports ${exception.to} — delete the exception`);
        }
        break;
      }
      case 'import-seam': {
        const from = select(rule.from, 'from');
        const to = select(rule.to, 'to');
        const expected = [...new Set(rule.names)].sort();
        for (const source of [...from].sort()) {
          for (const target of [...to].sort()) {
            const taken = new Set<string>();
            for (const edge of graph.edgesFrom(source)) {
              if (edge.to === target && inScope(edge, rule.edges)) for (const name of edge.names) taken.add(name);
            }
            const actual = [...taken].sort();
            if (actual.length === 0) report(`${source} no longer imports ${target}; the seam is gone — update or remove the rule`);
            else if (actual.join(',') !== expected.join(',')) {
              report(`${source} takes {${actual.join(', ')}} from ${target}; the only allowed seam is {${expected.join(', ')}}`);
            }
          }
        }
        break;
      }
      case 'acyclic-group': {
        const members = select(rule.members, 'members');
        for (const component of findCycleComponents(graph, members, rule.edges)) {
          report(`import cycle: ${describeCycle(graph, component, rule.edges)}`);
        }
        break;
      }
      case 'only-imported-by': {
        const target = select(rule.target, 'target');
        const used = new Set<string>();
        const reported = new Set<string>();
        for (const edge of graph.edges) {
          if (!inScope(edge, rule.edges) || !target.has(edge.to) || target.has(edge.from)) continue;
          const allowedBy = rule.importers.filter(pattern => matchesModule(pattern, edge.from));
          for (const pattern of allowedBy) used.add(pattern);
          const key = `${edge.from} -> ${edge.to}`;
          if (allowedBy.length === 0 && !reported.has(key)) {
            reported.add(key);
            report(`${edge.from} imports ${edge.to}, which only ${rule.importers.join(', ')} may import`);
          }
        }
        for (const pattern of rule.importers) {
          if (!used.has(pattern)) report(`stale allowed importer "${pattern}": it imports none of the target modules — delete it`);
        }
        break;
      }
    }
  }
  return violations;
}
