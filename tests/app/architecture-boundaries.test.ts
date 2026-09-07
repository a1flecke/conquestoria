import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');

describe('composition root boundaries', () => {
  it('main.ts stays a composition root, not an application', () => {
    expect(main.split('\n').length).toBeLessThan(150);
  });

  it('main.ts registers no event handlers and owns no mutable state', () => {
    expect(main).not.toMatch(/\bbus\.on\(/);
    expect(main).not.toMatch(/^let /m);
    expect(main).not.toMatch(/window\.addEventListener\(/);
  });

  it('only main.ts constructs concrete platform services', () => {
    expect(main).toContain('new AudioContext()');
    expect(main).toContain('new RenderLoop(');
  });
});

/**
 * Strips `//` and `/* *​/` comments so the checks below match real code, not
 * prose describing it. Two of the eight controller files (as of #787 phase
 * 11) have a docblock literally explaining "substitutes for N distinct
 * `document.getElementById(...)` calls" -- without stripping, the plan's
 * original raw-text regex would flag that sentence as a violation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

it('controllers depend on ports, not on RenderLoop/AudioSystem/document', () => {
  // #787 phase 11: the plan's original regex (`.not.toMatch(/from '@\/renderer\/render-loop'/)`)
  // also doesn't distinguish `import type { RenderLoop } from ...` from a
  // value import of the same path -- every one of these files legitimately
  // has a *type-only* RenderLoop/AudioSystem import for a narrow `Pick<>`
  // dep (established since Phase 8/9), so the plan's literal regex would
  // have failed on all eight files immediately. This checks per-line
  // instead: any line mentioning either module must start with `import type`.
  const dir = resolve(__dirname, '../../src/app/controllers');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const line of source.split('\n')) {
      if (line.includes("from '@/renderer/render-loop'") || line.includes("from '@/audio/audio-system'")) {
        expect(line, `${file}: ${line}`).toMatch(/^import type /);
      }
    }
    expect(stripComments(source), file).not.toMatch(/\bdocument\.getElementById\(/);
  }
});

it('the movement family has exactly one low-level position executor (#1025)', () => {
  // resolveUnitMoveIntent + executeValidatedUnitMove is the canonical movement
  // contract (see .claude/rules/movement-actions.md). The low-level movers
  // (moveUnitWithZoneOfControl / moveUnit) may only be called from the module
  // that defines them and the module that owns the executor -- anything else is
  // an alternate executor and must either route through the resolver or carry a
  // `movement-contract-exempt: <reason>` marker on the call line.
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }
  const srcRoot = resolve(__dirname, '../../src');
  const sanctioned = new Set([
    resolve(srcRoot, 'systems/unit-system.ts'),
    resolve(srcRoot, 'systems/unit-movement-system.ts'),
  ]);
  const callPattern = /moveUnitWithZoneOfControl\(|(^|[^.A-Za-z_])moveUnit\(/;
  const offenders: string[] = [];
  for (const file of walk(srcRoot)) {
    if (sanctioned.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    source.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (!callPattern.test(code)) return;
      if (line.includes('movement-contract-exempt')) return;
      offenders.push(`${file.slice(srcRoot.length + 1)}:${i + 1}  ${line.trim()}`);
    });
  }
  expect(offenders, offenders.join('\n')).toEqual([]);
});

describe('#1010 — unit-system movement decomposition boundaries', () => {
  const sys = resolve(__dirname, '../../src/systems');
  const read = (name: string) => readFileSync(resolve(sys, name), 'utf8');

  /** All `from '…'` module specifiers in a source file, resolved to a bare basename. */
  function importsOf(name: string): string[] {
    const src = read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)]
      .map(m => m[1]!)
      .map(spec => spec.replace(/^@\/systems\//, './').replace(/^\.\//, '').replace(/\.ts$/, ''));
  }

  const MOVEMENT_MODULES = [
    'unit-definitions',
    'unit-movement-cost',
    'unit-movement-legality',
    'unit-pathfinding',
    'unit-movement-validation',
    'unit-movement-queries',
    'unit-movement-explainer',
    'unit-system',
  ];

  it('validation is leaf-ward: it imports no execution, barrel, or query module', () => {
    const validation = importsOf('unit-movement-validation.ts');
    for (const forbidden of ['unit-system', 'unit-movement-system', 'unit-movement-queries', 'unit-movement-explainer']) {
      expect(validation, `validation must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the tap explainer is NOT re-exported through the unit-system barrel (it would cycle)', () => {
    // unit-movement-explainer → unit-movement-validation → unit-occupancy → air-operations-system
    // → unit-system barrel. Re-exporting the explainer from the barrel closes that loop and
    // leaves TRAINABLE_UNITS / BUILDINGS undefined at import time in downstream modules.
    expect(importsOf('unit-system.ts')).not.toContain('unit-movement-explainer');
    const explainer = importsOf('unit-movement-explainer.ts');
    expect(explainer).not.toContain('unit-system');
    expect(explainer).toContain('unit-movement-validation');
  });

  it('unit-movement-system still re-exports the validation API (barrel compat)', async () => {
    const mod = await import('@/systems/unit-movement-system');
    for (const name of ['validateUnitMove', 'resolveUnitMoveIntent', 'executeValidatedUnitMove', 'executeUnitMove']) {
      expect(mod, `unit-movement-system must export ${name}`).toHaveProperty(name);
    }
  });

  it('the movement modules form an acyclic import graph (incl. zone-of-control-system)', () => {
    const nodes = [...MOVEMENT_MODULES, 'zone-of-control-system'];
    const graph = new Map(nodes.map(n => [n, importsOf(`${n}.ts`).filter(s => nodes.includes(s))]));
    const state = new Map<string, 'visiting' | 'done'>();
    const stack: string[] = [];
    const cycles: string[] = [];
    const visit = (n: string) => {
      if (state.get(n) === 'done') return;
      if (state.get(n) === 'visiting') { cycles.push([...stack.slice(stack.indexOf(n)), n].join(' → ')); return; }
      state.set(n, 'visiting');
      stack.push(n);
      for (const dep of graph.get(n) ?? []) visit(dep);
      stack.pop();
      state.set(n, 'done');
    };
    for (const n of nodes) visit(n);
    expect(cycles, cycles.join('\n')).toEqual([]);
  });

  it('fog-of-war and unit-occupancy import the catalog leaf, not the unit-system barrel', () => {
    // #1025 MR4: unit-movement-validation depends on both. If they reach UNIT_DEFINITIONS
    // through the barrel (which re-exports unit-movement-queries, which imports validation),
    // that closes a cycle. Point them at the leaf instead — same fix MR3 made for
    // zone-of-control-system.
    for (const file of ['fog-of-war.ts', 'unit-occupancy.ts']) {
      expect(importsOf(file), file).not.toContain('unit-system');
      expect(importsOf(file), file).toContain('unit-definitions');
    }
  });

  it('layering: cost imports neither pathfinding nor queries nor legality; legality imports none of them', () => {
    const cost = importsOf('unit-movement-cost.ts');
    expect(cost).not.toContain('unit-pathfinding');
    expect(cost).not.toContain('unit-movement-queries');
    expect(cost).not.toContain('unit-movement-legality');
    expect(cost.some(s => s.startsWith('@/app') || s.startsWith('@/ui') || s.startsWith('@/renderer'))).toBe(false);

    const legality = importsOf('unit-movement-legality.ts');
    for (const forbidden of ['unit-pathfinding', 'unit-movement-queries', 'unit-movement-cost']) {
      expect(legality, `legality must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(legality.some(s => s.startsWith('@/app') || s.startsWith('@/ui'))).toBe(false);

    expect(importsOf('unit-pathfinding.ts')).not.toContain('unit-movement-queries');

    // The catalog leaf pulls in no other system module (types + two data leaves only).
    expect(importsOf('unit-definitions.ts').filter(s =>
      !['@/core/types', 'pirate-definitions', 'barbarian-roster'].includes(s))).toEqual([]);
  });

  it('unit-system.ts is a barrel: pre-split public surface preserved, sibling internals excluded', async () => {
    const mod = await import('@/systems/unit-system');
    const PRE_SPLIT_PUBLIC = [
      'UNIT_DEFINITIONS', 'UNIT_DESCRIPTIONS',
      'createUnit', 'moveUnit', 'moveUnitWithZoneOfControl', 'resetUnitTurn',
      'HEAL_PASSIVE', 'HEAL_RESTING', 'HEAL_IN_CITY', 'HEAL_IN_TERRITORY',
      'canHeal', 'healUnit', 'restUnit', 'getUnmovedUnits', 'isUnitAwaitingOrders',
      'getMovementCost', 'getMovementCostForUnit', 'canHullEnterOcean',
      'getMovementCostForUnitInContext', 'getMovementStepCostFor',
      'movementStepCostParamsForType', 'getMovementStepCost',
      'BLOCKING_MAP_ENTITY_MESSAGES', 'isBlockingCityFor', 'getBlockingMapEntityAt',
      'getBlockingMapEntityKeys', 'findPath', 'findPathToCity',
      'getMovementRange', 'getMovementRangeDetails',
    ];
    for (const name of PRE_SPLIT_PUBLIC) {
      expect(mod, `unit-system barrel must re-export ${name}`).toHaveProperty(name);
    }
    // The four sibling-only cost helpers must NOT leak into the barrel.
    for (const internal of ['terrainCostForParams', 'isPassableForParams', 'hasRoadMovementDiscount', 'isPassableForUnitInContext']) {
      expect(mod, `${internal} must stay internal to unit-movement-cost`).not.toHaveProperty(internal);
    }
    // #1025 MR4: getMovementBlockerReason moved OUT of the barrel (cycle) to its own module;
    // the MovementBlockerReason *type* is still re-exported here.
    expect(mod, 'getMovementBlockerReason must NOT be on the barrel post-#1025-MR4').not.toHaveProperty('getMovementBlockerReason');
    const explainer = await import('@/systems/unit-movement-explainer');
    expect(explainer).toHaveProperty('getMovementBlockerReason');
  });

  it('unit-system.ts sheds the coupling that moved with the movement subsystem', () => {
    const imp = importsOf('unit-system.ts');
    for (const gone of ['diplomacy-system', 'owner-hostility', './river-system', 'river-system']) {
      expect(imp, `unit-system.ts should no longer import ${gone}`).not.toContain(gone.replace('./', ''));
    }
    expect(imp).not.toContain('@/core/owner-kind');
  });

  it('exactly one implementation of the blocking predicate and the road-discount predicate', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walk(full) : e.name.endsWith('.ts') ? [full] : [];
      });
    }
    const files = walk(resolve(__dirname, '../../src'));
    const defsOf = (re: RegExp) => files.filter(f => re.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(resolve(__dirname, '../../src').length + 1));
    expect(defsOf(/function getBlockingMapEntityAt\(/)).toEqual(['systems/unit-movement-legality.ts']);
    expect(defsOf(/function hasRoadMovementDiscount\(/)).toEqual(['systems/unit-movement-cost.ts']);
    // the pre-#1010 dead duplicate is gone
    expect(defsOf(/function getRoadMovementDiscount\(/)).toEqual([]);
  });

  it('the low-level position movers stay in unit-system.ts (keeps the #1025 guard valid)', () => {
    expect(read('unit-system.ts')).toMatch(/export function moveUnitWithZoneOfControl\(/);
    expect(read('unit-system.ts')).toMatch(/export function moveUnit\(/);
  });
});

it('no app/presentation/ui file mutates the object returned by session.getState() directly', () => {
  // GameSession.commit()/update() are the only sanctioned publish path (see
  // src/app/ports.ts's GameSession doc comment). Mutating getState()'s return
  // value in place bypasses both subscribers (renderLoop, hud) that only fire
  // through commit/update -- see docs/superpowers/specs/2026-08-15-gamesession-state-mutation-audit-design.md.
  const dirs = [
    resolve(__dirname, '../../src/app'),
    resolve(__dirname, '../../src/presentation'),
    resolve(__dirname, '../../src/ui'),
  ];
  const excluded = new Set(['game-session.ts', 'ports.ts']);
  const mutationPatterns = [
    /getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^\]]+\])+\s*=[^=]/,
    /delete [A-Za-z0-9_.]*getState\(\)/,
    /getState\(\)(\.[A-Za-z0-9_]+|\[[^\]]+\])+\.(push|splice|pop|shift|unshift|sort|reverse)\(/,
  ];

  function walk(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') && !excluded.has(entry.name) ? [full] : [];
    });
  }

  for (const dir of dirs) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        for (const pattern of mutationPatterns) {
          expect(pattern.test(line), `${file}: ${line}`).toBe(false);
        }
      }
    }
  }
});
