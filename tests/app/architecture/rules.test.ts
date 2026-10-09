import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildImportGraph,
  findCycleComponents,
  loadRepoImportGraph,
  loadRepoSources,
} from './import-graph';
import { evaluateRules, formatViolation, matchesModule, type ArchitectureRule } from './rule-engine';
import { ARCHITECTURE_RULES } from './rules';
import { simTimeout } from '../../helpers/sim-timeout';

const messages = (graph: ReturnType<typeof buildImportGraph>, rules: readonly ArchitectureRule[]) =>
  evaluateRules(graph, rules).map(violation => violation.message);

describe('#1241 — the repository satisfies its declarative architecture rules', () => {
  it('has no violations (each failure names the rule id, the edge and the why)', () => {
    expect(evaluateRules(loadRepoImportGraph(), ARCHITECTURE_RULES).map(formatViolation)).toEqual([]);
    // Parses the whole of src/ into an import graph: ~2-3 s solo, 5015 ms on a loaded CI shard (main run 37995723134
    // timed out on the 5 s default with no violation). Explicit headroom per .claude/rules/hooks-and-tooling.md (#608).
  }, simTimeout(3_000));

  it('every rule id is unique and carries a real why', () => {
    const ids = ARCHITECTURE_RULES.map(rule => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ARCHITECTURE_RULES) {
      expect(rule.id, rule.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(rule.why.trim().length, rule.id).toBeGreaterThanOrEqual(20);
    }
  });

  it('bites on the real tree: an injected edge into a crisis leaf reports the rule id and its why', () => {
    // Hermetic sabotage of the real sources — the working tree is never edited.
    const sources = loadRepoSources(['src']);
    sources['src/systems/crisis-effects.ts'] += "\nimport { tickCrisisByArchetype } from '@/systems/crisis-progression';\n";
    const violations = evaluateRules(buildImportGraph(sources), ARCHITECTURE_RULES);
    const hit = violations.find(violation => violation.ruleId === 'crisis-effects-is-a-leaf');
    expect(hit?.message).toContain('src/systems/crisis-effects imports src/systems/crisis-progression');
    expect(formatViolation(hit!)).toContain(`why: ${ARCHITECTURE_RULES.find(rule => rule.id === hit!.ruleId)!.why}`);
  });

  it('closes the alias hole the hand-written #1012 checks had: an @/ import is the same edge as a relative one', () => {
    const sources = loadRepoSources(['src']);
    sources['src/systems/crisis-interventions.ts'] += "\nimport { processCrisisTurn } from '@/systems/crisis-lifecycle';\n";
    expect(evaluateRules(buildImportGraph(sources), ARCHITECTURE_RULES).map(v => v.ruleId))
      .toContain('crisis-interventions-not-tick-or-schedule');
  });
});

describe('#1241 — the graph parser', () => {
  const graph = buildImportGraph({
    'src/a.ts': [
      "import { x } from './b';",
      "import type { T } from './c';",
      "import { type U, type V } from './d';",
      "import { type W, y } from './e';",
      "export * from './f';",
      "export type { G } from './g';",
      "import '@/side';",
      "import def, * as ns from '@/h';",
      "const lazy = () => import('./i');",
      "type Dyn = typeof import('./j');",
      "import { z } from 'vitest';",
      "// import { nope } from './nope';",
      "const s = \"import { nope } from './nope'\";",
    ].join('\n'),
    'src/b.ts': '', 'src/c.ts': '', 'src/d.ts': '', 'src/e.ts': '', 'src/f.ts': '', 'src/g.ts': '',
    'src/side.ts': '', 'src/h.ts': '', 'src/i.ts': '', 'src/j.ts': '', 'src/nope.ts': '',
    'src/pkg/index.ts': '',
    'src/k.tsx': "import '../src/pkg';",
  });
  const edge = (to: string) => graph.edgesFrom('src/a').find(e => e.to === `src/${to}`)!;

  it('resolves aliases, relatives, index modules and ignores externals', () => {
    expect(graph.targetsOf('src/a', 'all')).toEqual(
      ['src/b', 'src/c', 'src/d', 'src/e', 'src/f', 'src/g', 'src/h', 'src/i', 'src/j', 'src/side'],
    );
    expect(graph.targetsOf('src/k', 'all')).toEqual(['src/pkg/index']);
  });

  it('classifies type-only versus runtime edges', () => {
    const typeOnly = Object.fromEntries(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'side'].map(m => [m, edge(m).typeOnly]));
    expect(typeOnly).toEqual({ b: false, c: true, d: true, e: false, f: false, g: true, h: false, i: false, j: true, side: false });
    expect(graph.targetsOf('src/a', 'runtime')).not.toContain('src/c');
  });

  it('records the bindings taken and ignores comments and string literals', () => {
    expect(edge('b').names).toEqual(['x']);
    expect(edge('h').names).toEqual(['default', '*']);
    expect(edge('f').names).toEqual(['*']);
    expect(edge('i').dynamic).toBe(true);
    expect(graph.targetsOf('src/a', 'all')).not.toContain('src/nope');
  });

  it('is deterministic regardless of the order files are supplied', () => {
    const files = { 'src/z.ts': "import './y';", 'src/y.ts': "import './x';", 'src/x.ts': '' };
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    expect(buildImportGraph(reversed)).toEqual(expect.objectContaining({ modules: buildImportGraph(files).modules, edges: buildImportGraph(files).edges }));
  });

  it('agrees with the #1013 maintainability audit on every runtime cycle', () => {
    const baseline = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/maintainability-audit-baseline.json'), 'utf8')) as {
      runtimeCycles: string[][];
    };
    const repo = loadRepoImportGraph();
    // The audit covers production .ts under src/ minus generated map data.
    const production = new Set(repo.modules.filter(id => id.startsWith('src/') && repo.pathOf(id).endsWith('.ts') && !/-map-data$/.test(id)));
    const mine = findCycleComponents(repo, production, 'runtime')
      .map(component => component.map(id => repo.pathOf(id)).sort())
      .sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
    expect(mine).toEqual(baseline.runtimeCycles);
  });
});

describe('#1241 — each rule kind fails when it should (fixture graphs)', () => {
  const why = 'fixture rule: states a real design reason for the constraint';

  describe('forbidden-import', () => {
    const files = { 'src/ui/a.ts': "import '@/systems/core';", 'src/systems/core.ts': '', 'src/systems/other.ts': '' };
    const rule = (extra: Partial<ArchitectureRule> = {}): ArchitectureRule =>
      ({ id: 'ui-not-core', kind: 'forbidden-import', from: 'src/ui/**', to: 'src/systems/core', edges: 'all', why, ...extra }) as ArchitectureRule;

    it('reports the edge with the rule id and why', () => {
      const violations = evaluateRules(buildImportGraph(files), [rule()]);
      expect(violations).toEqual([{ ruleId: 'ui-not-core', why, message: 'src/ui/a imports src/systems/core (@/systems/core)' }]);
      expect(formatViolation(violations[0]!)).toBe(`[ui-not-core] src/ui/a imports src/systems/core (@/systems/core)\n    why: ${why}`);
    });
    it('honours edge scope: a type-only import is invisible to a runtime rule but not an all-edges rule', () => {
      const typed = { ...files, 'src/ui/a.ts': "import type { T } from '@/systems/core';" };
      expect(messages(buildImportGraph(typed), [rule({ edges: 'runtime' } as never)])).toEqual([]);
      expect(messages(buildImportGraph(typed), [rule()])).toHaveLength(1);
    });
    it('accepts a listed exception, and rejects it once the edge is gone (stale)', () => {
      const exceptions = [{ from: 'src/ui/a', to: 'src/systems/core', reason: 'legacy panel, tracked in #0000' }];
      expect(messages(buildImportGraph(files), [rule({ exceptions } as never)])).toEqual([]);
      const gone = { ...files, 'src/ui/a.ts': '' };
      expect(messages(buildImportGraph(gone), [rule({ exceptions } as never)])).toEqual([
        'stale exception: src/ui/a no longer imports src/systems/core — delete the exception',
      ]);
    });
    it('rejects an exception with a throwaway reason or outside the rule scope', () => {
      const thin = [{ from: 'src/ui/a', to: 'src/systems/core', reason: 'ok' }];
      expect(messages(buildImportGraph(files), [rule({ exceptions: thin } as never)])).toEqual(['exception src/ui/a -> src/systems/core needs a real reason']);
      const outside = [{ from: 'src/systems/other', to: 'src/systems/core', reason: 'not under this rule at all' }];
      expect(messages(buildImportGraph(files), [rule({ exceptions: outside } as never)]).join()).toContain('outside this rule');
    });
    it('fails a matcher that matches no module instead of passing vacuously', () => {
      expect(messages(buildImportGraph(files), [rule({ to: 'src/systems/renamed' } as never)]))
        .toEqual(['to pattern "src/systems/renamed" matches no module (renamed or deleted? update or remove the rule)']);
    });
  });

  describe('import-seam', () => {
    const rule = (names: string[]): ArchitectureRule =>
      ({ id: 'one-seam', kind: 'import-seam', from: 'src/a', to: 'src/b', names, edges: 'all', why }) as ArchitectureRule;
    it('accepts exactly the named seam', () => {
      expect(messages(buildImportGraph({ 'src/a.ts': "import { tick } from './b';", 'src/b.ts': '' }), [rule(['tick'])])).toEqual([]);
    });
    it('rejects an extra binding and a vanished seam', () => {
      const wide = buildImportGraph({ 'src/a.ts': "import { tick, helper } from './b';", 'src/b.ts': '' });
      expect(messages(wide, [rule(['tick'])])).toEqual(['src/a takes {helper, tick} from src/b; the only allowed seam is {tick}']);
      const none = buildImportGraph({ 'src/a.ts': '', 'src/b.ts': '' });
      expect(messages(none, [rule(['tick'])])[0]).toContain('the seam is gone');
    });
  });

  describe('acyclic-group', () => {
    const rule: ArchitectureRule = { id: 'no-loop', kind: 'acyclic-group', members: 'src/g/*', edges: 'all', why };
    it('reports a concrete cycle path', () => {
      const looped = buildImportGraph({ 'src/g/a.ts': "import './b';", 'src/g/b.ts': "import './c';", 'src/g/c.ts': "import './a';" });
      expect(messages(looped, [rule])).toEqual(['import cycle: src/g/a → src/g/b → src/g/c → src/g/a']);
    });
    it('passes a DAG, and ignores a cycle that leaves the group', () => {
      const dag = buildImportGraph({ 'src/g/a.ts': "import './b';", 'src/g/b.ts': '' });
      expect(messages(dag, [rule])).toEqual([]);
      const viaOutside = buildImportGraph({ 'src/g/a.ts': "import '../x';", 'src/x.ts': "import './g/a';", 'src/g/b.ts': '' });
      expect(messages(viaOutside, [rule])).toEqual([]);
    });
    it('treats a type-only cycle as acyclic for a runtime rule only', () => {
      const typed = buildImportGraph({ 'src/g/a.ts': "import type { T } from './b';", 'src/g/b.ts': "import './a';" });
      expect(messages(typed, [{ ...rule, edges: 'runtime' } as ArchitectureRule])).toEqual([]);
      expect(messages(typed, [rule])).toHaveLength(1);
    });
  });

  describe('only-imported-by', () => {
    const rule = (importers: string[]): ArchitectureRule =>
      ({ id: 'guarded', kind: 'only-imported-by', target: 'src/low', importers, edges: 'all', why }) as ArchitectureRule;
    const files = { 'src/low.ts': '', 'src/ok.ts': "import './low';", 'src/bad.ts': "import './low';" };
    it('reports an importer outside the allowlist', () => {
      expect(messages(buildImportGraph(files), [rule(['src/ok'])])).toEqual(['src/bad imports src/low, which only src/ok may import']);
    });
    it('reports an allowlist entry that imports nothing (stale)', () => {
      expect(messages(buildImportGraph(files), [rule(['src/ok', 'src/bad', 'src/gone'])]))
        .toEqual(['stale allowed importer "src/gone": it imports none of the target modules — delete it']);
    });
  });

  describe('allowed-imports', () => {
    const rule = (allowed: string[]): ArchitectureRule =>
      ({ id: 'closed-leaf', kind: 'allowed-imports', from: 'src/leaf', allowed, edges: 'all', why }) as ArchitectureRule;
    const files = { 'src/leaf.ts': "import type { T } from '@/core/types';\nimport { k } from './util';", 'src/core/types.ts': '', 'src/util.ts': '', 'src/heavy.ts': '' };
    it('accepts exactly the declared set', () => {
      expect(messages(buildImportGraph(files), [rule(['src/core/types', 'src/util'])])).toEqual([]);
    });
    it('rejects an import outside the set, naming the edge and the set', () => {
      const wide = { ...files, 'src/leaf.ts': files['src/leaf.ts'] + "\nimport './heavy';" };
      expect(messages(buildImportGraph(wide), [rule(['src/core/types', 'src/util'])]))
        .toEqual(["src/leaf imports src/heavy (./heavy), outside its allowed set [src/core/types, src/util]"]);
    });
    it('rejects a stale allowance that nothing imports', () => {
      expect(messages(buildImportGraph(files), [rule(['src/core/types', 'src/util', 'src/heavy'])]))
        .toEqual(['stale allowance "src/heavy": no module in scope imports it — delete it']);
    });
    it('honours edge scope: a runtime rule ignores a type-only import', () => {
      const runtimeRule = { ...rule(['src/util']), edges: 'runtime' } as ArchitectureRule;
      expect(messages(buildImportGraph(files), [runtimeRule])).toEqual([]);
    });
  });

  it('rejects duplicate ids and a throwaway why', () => {
    const rule: ArchitectureRule = { id: 'dup', kind: 'acyclic-group', members: 'src/a', edges: 'all', why: 'short' };
    const result = messages(buildImportGraph({ 'src/a.ts': '' }), [rule, rule]);
    expect(result).toContain('duplicate rule id');
    expect(result.some(message => message.startsWith('`why` must state'))).toBe(true);
  });

  it('globs: * stays inside a path segment, ** crosses directories', () => {
    expect(matchesModule('src/systems/crisis-*', 'src/systems/crisis-effects')).toBe(true);
    expect(matchesModule('src/systems/crisis-*', 'src/systems/sub/crisis-effects')).toBe(false);
    expect(matchesModule('src/ui/**', 'src/ui/panels/deep/x')).toBe(true);
    expect(matchesModule('src/ui/**', 'src/uix/y')).toBe(false);
  });
});

describe('#1361 — core type leaves sit below the compatibility barrel', () => {
  const rule = ARCHITECTURE_RULES.filter(candidate => candidate.id === 'core-type-leaves-do-not-import-the-barrel');

  it('reports a leaf (or a persisted core-state module) that imports the barrel back, type-only included', () => {
    const graph = buildImportGraph({
      'src/core/types.ts': "export type { HexCoord } from './types/hex';\nexport interface GameState { a: number }",
      'src/core/types/hex.ts': 'export interface HexCoord { q: number; r: number }',
      'src/core/types/bad.ts': "import type { GameState } from '../types';\nexport type Bad = GameState;",
      'src/core/pirate-state.ts': "import type { HexCoord } from './types';\nexport type P = HexCoord;",
    });
    expect(messages(graph, rule).join('\n')).toMatch(/types\/bad[\s\S]*pirate-state|pirate-state[\s\S]*types\/bad/);
  });

  it('accepts leaves that import only other leaves', () => {
    const graph = buildImportGraph({
      'src/core/types.ts': "export type { HexCoord } from './types/hex';",
      'src/core/types/hex.ts': 'export interface HexCoord { q: number; r: number }',
      'src/core/pirate-state.ts': "import type { HexCoord } from './types/hex';\nexport type P = HexCoord;",
      'src/core/autonomy-state.ts': 'export const a = 1;',
      'src/core/notification-log.ts': 'export const n = 1;',
    });
    expect(messages(graph, rule)).toEqual([]);
  });
});
