import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VIEWER_BOUNDARY_RULES,
  findViewerBoundaryViolations,
} from '../helpers/viewer-safety-boundaries';

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

  it('binary-heap is a pure leaf; unit-pathfinding may depend on it', () => {
    // #1042 MR5: findPath's open set. Generic, not part of the #1010 movement decomposition,
    // so it is NOT in MOVEMENT_MODULES — it must import nothing at all (types are structural).
    // If it ever genuinely needs @/core/types, relax this to `.toEqual(['@/core/types'])` —
    // never to allow a @/systems / @/app import.
    expect(importsOf('binary-heap.ts')).toEqual([]);
    expect(importsOf('unit-pathfinding.ts')).toContain('binary-heap');
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

describe('#1012 — crisis-system decomposition boundaries', () => {
  const sys = resolve(__dirname, '../../src/systems');
  const read = (name: string) => readFileSync(resolve(sys, name), 'utf8');

  /** Named imports pulled from a given module specifier, e.g. namedImportsFrom('crisis-lifecycle.ts', './crisis-progression'). */
  function namedImportsFrom(file: string, specifier: string): string[] {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names: string[] = [];
    const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'${escaped}'`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      names.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
    }
    return names;
  }

  /** All local (`./…`) module specifiers a crisis-* file imports from, as bare basenames. */
  function localImportsOf(file: string): string[] {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...src.matchAll(/from\s+'\.\/([^']+)'/g)].map(m => m[1]);
  }

  const CRISIS_MODULES = [
    'crisis-scheduling',
    'crisis-effects',
    'crisis-progression',
    'crisis-lifecycle',
    'crisis-interventions',
  ];

  it('crisis-effects.ts (severity/queries) depends on no other crisis-* module', () => {
    const imports = localImportsOf('crisis-effects.ts');
    for (const m of CRISIS_MODULES) expect(imports).not.toContain(m);
  });

  it('crisis-scheduling.ts (eligibility/onset policy) depends on no turn-orchestration or intervention module', () => {
    const imports = localImportsOf('crisis-scheduling.ts');
    for (const m of ['crisis-progression', 'crisis-lifecycle', 'crisis-interventions']) {
      expect(imports, `crisis-scheduling must not import ${m}`).not.toContain(m);
    }
  });

  it('crisis-lifecycle.ts (reusable staged lifecycle) reaches archetype policy through exactly one seam', () => {
    // The lifecycle loop is generic ("tick this instance, keep or drop the result"); its
    // only crisis-specific coupling is calling the single dispatch function, never an
    // individual archetype tick body directly. This is the exact seam #990 must
    // generalize — see crisis-lifecycle.ts's header comment.
    const imports = localImportsOf('crisis-lifecycle.ts');
    expect(imports).not.toContain('crisis-scheduling');
    expect(imports).not.toContain('crisis-interventions');
    expect(imports).not.toContain('crisis-effects');
    expect(imports).toContain('crisis-progression');
    expect(namedImportsFrom('crisis-lifecycle.ts', './crisis-progression')).toEqual(['tickCrisisByArchetype']);
  });

  it('crisis-interventions.ts (player commands) does not import the turn-tick loop or scheduler', () => {
    const imports = localImportsOf('crisis-interventions.ts');
    expect(imports).not.toContain('crisis-lifecycle');
    expect(imports).not.toContain('crisis-scheduling');
    expect(imports).not.toContain('crisis-progression');
  });

  it('the crisis-* modules form an acyclic import graph', () => {
    const graph = new Map(CRISIS_MODULES.map(m => [m, localImportsOf(`${m}.ts`).filter(s => CRISIS_MODULES.includes(s))]));
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
    for (const n of CRISIS_MODULES) visit(n);
    expect(cycles, cycles.join('\n')).toEqual([]);
  });

  it('crisis-system.ts stays a barrel: re-exports the full pre-split public surface', async () => {
    const mod = await import('@/systems/crisis-system');
    const PRE_SPLIT_PUBLIC = [
      'CRISIS_PRESSURE_FLOOR', 'EXTERNAL_THREAT_RECENCY_TURNS', 'CONTAGION_GROUP_RANGE',
      'OUTBREAK_CURE_IMMUNITY_TURNS', 'OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL', 'cureImmunityWindow',
      'countUnrestGroups', 'countActiveCrisesForCiv', 'AI_CRISIS_WORLD_CAP', 'processCrisisScheduler',
      'getFamineFragility', 'getOutbreakSeverityMultiplier', 'getCatastropheRecoveryMultiplier',
      'getCrisisYieldMultiplier', 'FAMINE_CONTAINMENT_SURPLUS_TURNS', 'processCrisisTurn',
      'applyQuarantine', 'applyRemedy', 'applyEmpireContainment', 'resolveCrisis', 'handleCityLeftCiv',
    ];
    for (const name of PRE_SPLIT_PUBLIC) {
      expect(mod, `crisis-system barrel must re-export ${name}`).toHaveProperty(name);
    }
  });

  it('no UI/renderer file imports a crisis-* implementation module directly (barrel/controller only)', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });
    }
    const offenders: string[] = [];
    for (const dir of ['src/ui', 'src/renderer']) {
      for (const file of walk(resolve(__dirname, '../..', dir))) {
        const source = readFileSync(file, 'utf8');
        for (const m of CRISIS_MODULES) {
          if (new RegExp(`from '(@/systems/${m}|\\./${m})'`).test(source)) {
            offenders.push(`${file}: imports ${m} directly`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('#990 — event-chain engine boundaries', () => {
  const sys = resolve(__dirname, '../../src/systems');
  const read = (name: string) => readFileSync(resolve(sys, name), 'utf8');

  function localImportsOf(file: string): string[] {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...src.matchAll(/from\s+'\.\/([^']+)'/g)].map(m => m[1]);
  }

  function namedImportsFrom(file: string, specifier: string): string[] {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names: string[] = [];
    const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'${escaped}'`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) names.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
    return names;
  }

  const EVENT_CHAIN_MODULES = [
    'event-chain-definitions',
    'event-chain-scheduling',
    'event-chain-progression',
    'event-chain-lifecycle',
    'event-chain-choices',
    'event-chain-presentation',
  ];

  it('staged-lifecycle-engine.ts is domain-free: no crisis-* or event-chain-* import', () => {
    const imports = localImportsOf('staged-lifecycle-engine.ts');
    for (const m of [...EVENT_CHAIN_MODULES, 'crisis-scheduling', 'crisis-effects', 'crisis-progression', 'crisis-lifecycle', 'crisis-interventions']) {
      expect(imports, `staged-lifecycle-engine must not import ${m}`).not.toContain(m);
    }
  });

  it('both crisis-lifecycle.ts and event-chain-lifecycle.ts consume the one shared engine', () => {
    expect(localImportsOf('crisis-lifecycle.ts')).toContain('staged-lifecycle-engine');
    expect(localImportsOf('event-chain-lifecycle.ts')).toContain('staged-lifecycle-engine');
  });

  it('event-chain-lifecycle.ts reaches chain-kind policy through exactly one seam', () => {
    const imports = localImportsOf('event-chain-lifecycle.ts');
    expect(imports).not.toContain('event-chain-scheduling');
    expect(imports).not.toContain('event-chain-choices');
    expect(imports).not.toContain('event-chain-definitions');
    expect(imports).toContain('event-chain-progression');
    expect(namedImportsFrom('event-chain-lifecycle.ts', './event-chain-progression')).toEqual(['tickEventChainByKind']);
  });

  it('event-chain-definitions.ts and event-chain-presentation.ts depend on no turn-orchestration module', () => {
    for (const file of ['event-chain-definitions.ts', 'event-chain-presentation.ts']) {
      const imports = localImportsOf(file);
      for (const m of ['event-chain-scheduling', 'event-chain-progression', 'event-chain-lifecycle', 'event-chain-choices']) {
        expect(imports, `${file} must not import ${m}`).not.toContain(m);
      }
    }
  });

  it('the event-chain-* modules (plus the shared engine and crisis-*) form an acyclic import graph', () => {
    const nodes = [...EVENT_CHAIN_MODULES, 'staged-lifecycle-engine', 'crisis-scheduling', 'crisis-effects', 'crisis-progression', 'crisis-lifecycle', 'crisis-interventions'];
    const graph = new Map(nodes.map(n => [n, localImportsOf(`${n}.ts`).filter(s => nodes.includes(s))]));
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

  it('no UI/renderer file imports an event-chain engine module directly (presentation.ts is the sanctioned UI-facing surface)', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });
    }
    const ENGINE_MODULES = EVENT_CHAIN_MODULES.filter(m => m !== 'event-chain-presentation');
    const offenders: string[] = [];
    for (const dir of ['src/ui', 'src/renderer']) {
      for (const file of walk(resolve(__dirname, '../..', dir))) {
        const source = readFileSync(file, 'utf8');
        for (const m of ENGINE_MODULES) {
          if (new RegExp(`from '(@/systems/${m}|\\./${m})'`).test(source)) {
            offenders.push(`${file}: imports ${m} directly`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('#993 — big-moment queue engine boundaries', () => {
  const root = resolve(__dirname, '../..');
  function read(relPath: string): string {
    return readFileSync(resolve(root, relPath), 'utf8');
  }
  function importsModuleSpecifier(source: string, specifier: string): boolean {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`from\\s+'${escaped}'`).test(source);
  }

  it('big-moment-queue.ts is domain-free: no wonder/legendary/event-chain/victory/coordinator import', () => {
    const source = read('src/systems/big-moment-queue.ts');
    for (const specifier of [
      '@/ui/wonder-discovery-queue',
      '@/ui/legendary-wonder-completion-queue',
      '@/ui/event-chain-conclusion-ceremony',
      '@/ui/victory-panel',
      '@/systems/event-chain-presentation',
      '@/systems/wonder-discovery-reveal',
      '@/systems/legendary-wonder-completion-presentation',
      '@/app/controllers/ceremony-coordinator',
    ]) {
      expect(importsModuleSpecifier(source, specifier), `big-moment-queue.ts must not import ${specifier}`).toBe(false);
    }
  });

  it('every queue the ceremony coordinator owns consumes the one shared engine', () => {
    for (const file of [
      'src/ui/wonder-discovery-queue.ts',
      'src/ui/legendary-wonder-completion-queue.ts',
      'src/app/controllers/ceremony-coordinator.ts',
    ]) {
      expect(
        importsModuleSpecifier(read(file), '@/systems/big-moment-queue'),
        `${file} must import the shared big-moment-queue engine rather than re-implementing its own sequencing loop`,
      ).toBe(true);
    }
  });

  it('victory presentation is routed through the ceremony coordinator, not called directly', () => {
    // #993 fixed a real overlay-stacking race by moving victory presentation
    // behind the same isInteractionBlocked()-gated engine every other
    // ceremony uses -- a direct showVictoryPanel() call from turn-flow-
    // controller.ts would silently reintroduce it.
    const source = read('src/app/controllers/turn-flow-controller.ts');
    expect(
      importsModuleSpecifier(source, '@/ui/victory-panel'),
      'turn-flow-controller.ts must not import showVictoryPanel directly -- route through ceremonies.enqueueVictory instead',
    ).toBe(false);
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

describe('#1002 — player-facing modules stay behind the viewer projection', () => {
  const repoRoot = resolve(__dirname, '../..');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  const playerFacingFiles = [
    ...['src/ui', 'src/presentation', 'src/renderer', 'src/input', 'src/app'].flatMap(dir => walk(resolve(repoRoot, dir))),
    resolve(repoRoot, 'src/main.ts'),
  ].map(file => file.slice(repoRoot.length + 1));

  it('rejects realistic regressions (fixture sources)', () => {
    // A #989-style rival panel reading the AI's private intent straight off state.
    const rivalPanel = [
      "import type { GameState } from '@/core/types';",
      'export function rivalLine(state: GameState, rivalId: string): string {',
      '  const intent = state.opponentAI?.nationalIntentByCiv[rivalId]?.current;',
      "  return intent === 'dominate' ? 'Your rival is pursuing conquest.' : '';",
      '}',
    ].join('\n');
    expect(findViewerBoundaryViolations('src/ui/rival-panel.ts', rivalPanel))
      .toEqual([expect.objectContaining({ rule: 'ai-internals', line: 3 })]);

    // A renderer importing an AI module to decorate enemy armies.
    const overlay = "import { planTheaterOffensive } from '@/ai/ai-theater-planner';\n";
    expect(findViewerBoundaryViolations('src/renderer/war-overlay.ts', overlay))
      .toEqual([expect.objectContaining({ rule: 'ai-modules' })]);

    // An input handler surfacing the omniscient movement resolver's copy.
    const tapHandler = [
      "import { resolveUnitMoveIntent } from '@/systems/unit-movement-validation';",
      'export const why = (s: never, id: string, to: never) => {',
      "  const r = resolveUnitMoveIntent(s, id, to, { actor: 'player', civId: 'x' });",
      "  return r.ok ? '' : r.message;",
      '};',
    ].join('\n');
    expect(findViewerBoundaryViolations('src/input/quick-move.ts', tapHandler).map(v => v.rule))
      .toEqual(['raw-movement-resolver', 'raw-movement-resolver']);

    // Comments describing the rule are not violations; systems code is out of scope.
    expect(findViewerBoundaryViolations('src/ui/notes.ts', '// never read state.opponentAI here\n')).toEqual([]);
    expect(findViewerBoundaryViolations('src/systems/strategic-warning-system.ts', rivalPanel)).toEqual([]);
  });

  it('the current tree has no violations', () => {
    const violations = playerFacingFiles.flatMap(file =>
      findViewerBoundaryViolations(file, readFileSync(resolve(repoRoot, file), 'utf8')));
    expect(violations.map(v => `${v.file}:${v.line} [${v.rule}] ${v.text}`)).toEqual([]);
  });

  it('every allowlist entry is still needed (no stale exemptions)', () => {
    for (const spec of VIEWER_BOUNDARY_RULES) {
      for (const file of Object.keys(spec.allow)) {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(spec.pattern.test(source), `${spec.rule}: ${file} no longer needs its exemption`).toBe(true);
      }
    }
  });
});


describe('#1011 — diplomacy decomposition boundaries', () => {
  const srcRoot = resolve(__dirname, '../../src');
  const sys = resolve(srcRoot, 'systems');
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const readSys = (name: string) => strip(readFileSync(resolve(sys, `${name}.ts`), 'utf8'));

  /**
   * Explicit layering: each diplomacy domain module -> the diplomacy modules it
   * may import. Everything below `diplomacy-system` (the integration layer, which
   * may import all of them) may only point down this table.
   */
  const ALLOWED: Record<string, string[]> = {
    'diplomacy-queries': [],
    'diplomacy-state': [],
    'diplomacy-leagues': [],
    'diplomacy-embargoes': [],
    'diplomacy-requests': [],
    'diplomacy-treachery': ['diplomacy-state'],
    'diplomacy-vassal-rules': ['diplomacy-state', 'diplomacy-treachery', 'diplomacy-leagues', 'diplomacy-queries'],
    'diplomacy-war': ['diplomacy-state', 'diplomacy-treachery', 'diplomacy-queries', 'diplomacy-vassal-rules'],
    'diplomacy-treaties': ['diplomacy-state', 'diplomacy-queries'],
    'diplomacy-actions': ['diplomacy-queries', 'diplomacy-vassal-rules'],
    'diplomacy-vassalage': [
      'diplomacy-state', 'diplomacy-queries', 'diplomacy-treachery', 'diplomacy-requests',
      'diplomacy-vassal-rules', 'diplomacy-war',
    ],
  };
  const DOMAIN_MODULES = Object.keys(ALLOWED);

  /** Every diplomacy-* module a file imports (either `@/systems/x` or `./x`). */
  function diplomacyImportsOf(name: string): string[] {
    return [...readSys(name).matchAll(/from\s+'(?:@\/systems\/|\.\/)(diplomacy-[a-z-]+)'/g)].map(m => m[1]);
  }

  it('each domain module only imports diplomacy modules that sit below it', () => {
    for (const mod of DOMAIN_MODULES) {
      const bad = diplomacyImportsOf(mod).filter(dep => !ALLOWED[mod].includes(dep));
      expect(bad, `${mod} imports ${bad.join(', ')}`).toEqual([]);
    }
  });

  it('no domain module imports the diplomacy-system integration layer', () => {
    for (const mod of DOMAIN_MODULES) {
      expect(diplomacyImportsOf(mod), `${mod} must not import the integration module`).not.toContain('diplomacy-system');
    }
  });

  it('the domain modules (plus the integration layer) form an acyclic import graph', () => {
    const graph = new Map<string, string[]>([
      ...DOMAIN_MODULES.map(m => [m, diplomacyImportsOf(m)] as [string, string[]]),
      ['diplomacy-system', diplomacyImportsOf('diplomacy-system')],
    ]);
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
    for (const n of graph.keys()) visit(n);
    expect(cycles, cycles.join('\n')).toEqual([]);
  });

  it('the read-only query seam is a types-only leaf (movement/supply/AI consume it without the integration graph)', () => {
    const src = readSys('diplomacy-queries');
    const runtimeImports = [...src.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)].map(m => m[1]);
    expect(runtimeImports).toEqual([]);
    expect(diplomacyImportsOf('diplomacy-queries')).toEqual([]);
    // No state-writing function belongs in the query seam.
    expect(src).not.toMatch(/\bexport function (modify|declare|make|sign|break|commit|enqueue|apply)\w*/);
  });

  it('diplomacy-system.ts keeps exactly the audited public surface (single-side building blocks and every read are excluded)', async () => {
    const mod = await import('@/systems/diplomacy-system');
    expect(Object.keys(mod).sort()).toEqual([
      'acceptDiplomaticRequest',
      'applyDiplomaticAction',
      'applyVassalageWarConsequences',
      'canReabsorbBreakaway',
      'declareMajorWar',
      'getAvailableActions',
      'makeMajorPeace',
      'proposeTreatyAgreement',
      'rejectDiplomaticRequest',
    ]);
  });

  /** Names a src file (outside the diplomacy-* modules) imports from a given diplomacy module. */
  function externalNamedImports(moduleName: string): Map<string, string[]> {
    const byName = new Map<string, string[]>();
    const walkTs = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walkTs(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
    const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'(?:@/systems/|\\./)${moduleName}'`, 'g');
    for (const file of walkTs(srcRoot)) {
      const rel = file.slice(srcRoot.length + 1);
      if (rel.startsWith('systems/diplomacy-')) continue;
      const source = strip(readFileSync(file, 'utf8'));
      for (const m of source.matchAll(re)) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (!name) continue;
          byName.set(name, [...(byName.get(name) ?? []), rel]);
        }
      }
    }
    return byName;
  }

  it('single-side war/peace/treaty building blocks are imported only by their sanctioned callers (#995 / #1003, structural)', () => {
    const war = externalNamedImports('diplomacy-war');
    const sanctionedMinorCivWar = ['systems/minor-civ-actions.ts', 'systems/minor-civ-coalition-system.ts'];
    for (const name of ['declareWar', 'makePeace']) {
      const importers = (war.get(name) ?? []).sort();
      for (const importer of importers) expect(sanctionedMinorCivWar, `${name} imported by ${importer}`).toContain(importer);
    }
    expect(war.get('addWarPair') ?? [], 'addWarPair is diplomacy-internal').toEqual([]);
    const treaties = externalNamedImports('diplomacy-treaties');
    for (const importer of treaties.get('signTreaty') ?? []) {
      expect(importer).toBe('testing/scenario-steps/diplomacy-step.ts');
    }
  });

  it('only the integration layer and diplomacy-vassalage import addWarPair', () => {
    for (const mod of DOMAIN_MODULES) {
      const src = readSys(mod);
      const importsIt = /import\s*\{[^}]*\baddWarPair\b[^}]*\}\s*from/.test(src);
      if (mod !== 'diplomacy-vassalage') expect(importsIt, `${mod} must not import addWarPair`).toBe(false);
    }
    expect(/\baddWarPair\b/.test(readSys('diplomacy-system'))).toBe(false);
  });
});

describe('#871 — territorial access is one peer rule, consumed everywhere movement lands', () => {
  const readSrc = (rel: string) =>
    readFileSync(resolve(__dirname, '../../src', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const importsTerritorial = (rel: string) => /from\s+'(?:@\/systems\/|\.\/)territorial-access'/.test(readSrc(rel));

  it('the layering holds: pathfinding takes plain data, legality stays about map entities', () => {
    // findPath receives `deniedOwnerIds` as a plain set (like `blockedHexKeys`); it never imports the rule.
    expect(importsTerritorial('systems/unit-pathfinding.ts')).toBe(false);
    expect(importsTerritorial('systems/unit-movement-legality.ts')).toBe(false);
    expect(importsTerritorial('systems/unit-movement-cost.ts')).toBe(false);
  });

  it('territorial-access.ts is a leaf: no movement-subsystem, integration-layer or UI import', () => {
    const imports = [...readSrc('systems/territorial-access.ts').matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
    const allowed = new Set([
      '@/core/types', '@/core/event-bus', '@/core/owner-kind', '@/systems/hex-utils',
      '@/systems/diplomacy-queries', '@/systems/unit-definitions', '@/systems/unit-modifier-definitions',
    ]);
    expect(imports.filter(spec => !allowed.has(spec)), 'unexpected import in territorial-access.ts').toEqual([]);
  });

  it('every consumer of "may this land here?" asks it: resolver, range, unload, airborne, auto-explore, tap intent', () => {
    for (const rel of [
      'systems/unit-movement-validation.ts',
      'systems/unit-movement-queries.ts',
      'systems/transport-system.ts',
      'systems/airborne-system.ts',
      'systems/auto-explore-system.ts',
      'input/selected-unit-tap-intent.ts',
    ]) {
      expect(importsTerritorial(rel), `${rel} must consume territorial-access`).toBe(true);
    }
  });

  it('no movement module re-derives access from treaties: only territorial-access reads open_borders', () => {
    for (const rel of [
      'systems/unit-movement-validation.ts', 'systems/unit-movement-queries.ts', 'systems/unit-pathfinding.ts',
      'systems/unit-movement-cost.ts', 'systems/unit-movement-explainer.ts', 'systems/transport-system.ts',
      'systems/airborne-system.ts', 'systems/auto-explore-system.ts', 'input/selected-unit-tap-intent.ts',
    ]) {
      expect(readSrc(rel), `${rel} must not read treaty types itself`).not.toMatch(/open_borders|['"]alliance['"]/);
    }
    expect(readSrc('systems/territorial-access.ts')).toMatch(/open_borders/);
  });
});
