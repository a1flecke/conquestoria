import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findAttackContractViolations,
  EXPECTED_EXEMPTIONS,
} from '../helpers/attack-contract-boundaries';
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
    resolve(srcRoot, 'systems/unit-low-level-move.ts'),
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

describe('#1010 — unit-system decomposition boundaries', () => {
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
    'unit-descriptions',
    'unit-lifecycle',
    'unit-healing',
    'unit-order-state',
    'unit-low-level-move',
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

  it('unit-system.ts is a shrink-only deprecated facade: exact export list, guarded movers and cycle-prone modules excluded', async () => {
    const mod = await import('@/systems/unit-system');
    // The list may only ever shrink. Adding an export here is what #1010 removed.
    expect(Object.keys(mod).sort()).toEqual([
      'BLOCKING_MAP_ENTITY_MESSAGES', 'HEAL_IN_CITY', 'HEAL_IN_TERRITORY', 'HEAL_PASSIVE', 'HEAL_RESTING',
      'UNIT_DEFINITIONS', 'UNIT_DESCRIPTIONS', 'canHeal', 'canHullEnterOcean', 'createUnit',
      'findPath', 'findPathToCity', 'getBlockingMapEntityAt', 'getBlockingMapEntityKeys',
      'getBlockingMapEntityKeysForOwner', 'getMovementCost', 'getMovementCostForUnit',
      'getMovementCostForUnitInContext', 'getMovementRange', 'getMovementRangeDetails',
      'getMovementStepCost', 'getMovementStepCostFor', 'getUnmovedUnits', 'healUnit',
      'isBlockingCityFor', 'isUnitAwaitingOrders', 'movementStepCostParamsForType', 'resetUnitTurn', 'restUnit',
    ]);
    // The guarded low-level movers are NOT reachable through the facade.
    for (const guarded of ['moveUnit', 'moveUnitWithZoneOfControl']) {
      expect(mod, `${guarded} must not be re-exported`).not.toHaveProperty(guarded);
    }
    // The four sibling-only cost helpers must NOT leak into the facade.
    for (const internal of ['terrainCostForParams', 'isPassableForParams', 'hasRoadMovementDiscount', 'isPassableForUnitInContext']) {
      expect(mod, `${internal} must stay internal to unit-movement-cost`).not.toHaveProperty(internal);
    }
    // #1025 MR4: getMovementBlockerReason lives in its own module (cycle); the type is still re-exported.
    expect(mod, 'getMovementBlockerReason must NOT be on the facade').not.toHaveProperty('getMovementBlockerReason');
    const explainer = await import('@/systems/unit-movement-explainer');
    expect(explainer).toHaveProperty('getMovementBlockerReason');
  });

  it('nothing in src/ or tests/ imports the unit-system facade: every importer names its owning module', () => {
    function walkTs(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
      });
    }
    const root = resolve(__dirname, '../..');
    const offenders: string[] = [];
    for (const file of [...walkTs(resolve(root, 'src')), ...walkTs(resolve(root, 'tests'))]) {
      if (file.endsWith('src/systems/unit-system.ts') || file.endsWith('tests/app/architecture-boundaries.test.ts')) continue;
      const source = readFileSync(file, 'utf8');
      if (/(?:from|import\()\s*['"](?:@\/systems\/|\.\/|\.\.\/systems\/)unit-system['"]/.test(source)) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(offenders, `import the owning unit-* module instead of the deprecated facade:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the split modules keep their single responsibility: leaves stay leaves, nothing imports the facade', () => {
    const TYPE_LEAVES = ['unit-descriptions', 'unit-healing', 'unit-order-state'];
    for (const leaf of TYPE_LEAVES) {
      // Pure data / pure rules: types only, no other system module at all.
      expect(importsOf(`${leaf}.ts`).filter(s => s !== '@/core/types'), `${leaf} must be a types-only leaf`).toEqual([]);
    }
    // Lifecycle depends on the catalog leaf and the naval-endurance leaf (#883: the depleted-fleet movement
    // penalty feeds the one per-turn allowance) and nothing else.
    expect(importsOf('unit-lifecycle.ts').filter(s => !['@/core/types', 'unit-definitions', 'naval-endurance'].includes(s))).toEqual([]);
    // #883: the endurance leaf must stay light enough for lifecycle/combat to read.
    // #884: air readiness may read the naval leaf (a carrier's #883 state) and nothing heavier -- it must
    // never import the air-operations system (which imports it).
    expect(importsOf('air-readiness.ts').filter(s => !['@/core/types', '@/core/owner-kind', 'unit-definitions', 'naval-endurance'].includes(s))).toEqual([]);
    expect(importsOf('naval-endurance.ts').filter(s => !['@/core/types', '@/core/owner-kind', 'unit-definitions', 'unit-modifier-definitions'].includes(s))).toEqual([]);
    // The guarded movers depend only on zone-of-control (for the ZoC stop) and types.
    expect(importsOf('unit-low-level-move.ts').filter(s => !['@/core/types', 'zone-of-control-system'].includes(s))).toEqual([]);
    for (const mod of ['unit-descriptions', 'unit-healing', 'unit-order-state', 'unit-lifecycle', 'unit-low-level-move']) {
      expect(importsOf(`${mod}.ts`), `${mod} must not import the facade`).not.toContain('unit-system');
    }
  });

  it('healing never reads a treaty, territory or diplomacy fact: passage and support are different questions (#870)', () => {
    const healing = read('unit-healing.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(healing).not.toMatch(/open_borders|alliance|treat|territorial|diplomacy|classifyLandSupply|\.owner\b/);
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

  it('the low-level position movers are a guarded primitive: defined once, importable only by the executor and the named world-actor exemptions', () => {
    expect(read('unit-low-level-move.ts')).toMatch(/export function moveUnitWithZoneOfControl\(/);
    expect(read('unit-low-level-move.ts')).toMatch(/export function moveUnit\(/);
    function walkSrc(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walkSrc(full) : /\.tsx?$/.test(e.name) ? [full] : [];
      });
    }
    const srcRoot = resolve(__dirname, '../../src');
    const importers = walkSrc(srcRoot)
      .filter(file => /from\s+['"](?:@\/systems\/|\.\/)unit-low-level-move['"]/.test(readFileSync(file, 'utf8')))
      .map(file => file.slice(srcRoot.length + 1))
      .sort();
    // The canonical executor, plus the two ocean-only world-actor call sites carrying
    // `movement-contract-exempt` markers (see .claude/rules/movement-actions.md).
    expect(importers).toEqual([
      'systems/pirate-behavior.ts',
      'systems/pirate-system.ts',
      'systems/unit-movement-system.ts',
    ]);
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

describe('#1008 — city-system decomposition boundaries', () => {
  const sys = resolve(__dirname, '../../src/systems');
  const read = (name: string) => readFileSync(resolve(sys, name), 'utf8');

  /** All imported module specifiers in a source file, reduced to a bare sibling name. */
  function importsOf(name: string): string[] {
    const src = read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)]
      .map(m => m[1]!)
      .map(spec => spec.replace(/^@\/systems\//, './').replace(/^\.\//, '').replace(/\.ts$/, ''));
  }

  const CITY_MODULES = [
    'city-building-catalog',
    'city-unit-catalog',
    'city-local-infrastructure',
    'city-lifecycle',
    'city-availability',
    'city-production-cost',
    'city-production-presentation',
    'city-turn',
  ];

  it('the catalogs are leaves: no sibling city module, no app/ui/renderer dependency', () => {
    for (const file of ['city-building-catalog.ts', 'city-unit-catalog.ts']) {
      const imports = importsOf(file);
      for (const m of CITY_MODULES) {
        expect(imports, `${file} must not import ${m}`).not.toContain(m);
      }
      expect(
        imports.some(s => s.startsWith('@/app') || s.startsWith('@/ui') || s.startsWith('@/renderer')),
        `${file} must not reach into app/ui/renderer`,
      ).toBe(false);
    }
    // The unit catalog is the only catalog that needs the combat-role metadata.
    expect(importsOf('city-unit-catalog.ts')).toContain('combat-role-definitions');
    expect(importsOf('city-building-catalog.ts')).not.toContain('combat-role-definitions');
  });

  it('presentation imports no simulation module (turn/availability/cost/lifecycle)', () => {
    const imports = importsOf('city-production-presentation.ts');
    for (const forbidden of ['city-turn', 'city-availability', 'city-production-cost', 'city-lifecycle', 'city-local-infrastructure']) {
      expect(imports, `presentation must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(imports).toContain('city-building-catalog');
    expect(imports).toContain('city-unit-catalog');
  });

  it('availability imports neither cost, turn, presentation, nor catalog data it cannot need', () => {
    const imports = importsOf('city-availability.ts');
    for (const forbidden of ['city-turn', 'city-production-cost', 'city-production-presentation', 'city-local-infrastructure']) {
      expect(imports, `availability must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(imports).toContain('city-lifecycle');
  });

  it('the cost model imports no availability, turn, presentation or lifecycle module', () => {
    const imports = importsOf('city-production-cost.ts');
    for (const forbidden of ['city-turn', 'city-availability', 'city-production-presentation', 'city-lifecycle']) {
      expect(imports, `cost must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(imports).toContain('city-building-catalog');
    expect(imports).toContain('city-unit-catalog');
    expect(imports).toContain('city-local-infrastructure');
  });

  it('lifecycle is leaf-ward: it imports no cost/availability/turn/presentation/catalog', () => {
    const imports = importsOf('city-lifecycle.ts');
    for (const forbidden of ['city-turn', 'city-availability', 'city-production-cost', 'city-production-presentation', 'city-building-catalog', 'city-unit-catalog', 'city-local-infrastructure']) {
      expect(imports, `lifecycle must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('turn orchestration may consume the domain transitions but never presentation', () => {
    const imports = importsOf('city-turn.ts');
    expect(imports).toContain('city-availability');
    expect(imports).toContain('city-production-cost');
    expect(imports).toContain('city-lifecycle');
    expect(imports).toContain('city-building-catalog');
    expect(imports).toContain('city-unit-catalog');
    expect(imports).not.toContain('city-production-presentation');
  });

  it('the city-* modules form an acyclic import graph', () => {
    const graph = new Map(CITY_MODULES.map(n => [n, importsOf(`${n}.ts`).filter(s => CITY_MODULES.includes(s))]));
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
    for (const n of CITY_MODULES) visit(n);
    expect(cycles, cycles.join('\n')).toEqual([]);
  });

  it('city-system.ts stays a barrel: the full pre-split public value surface is preserved', async () => {
    const mod = await import('@/systems/city-system');
    const PRE_SPLIT_PUBLIC_VALUES = [
      'BUILDINGS', 'TRAINABLE_UNITS', 'TERMINAL_COMBAT_UNITS', 'MELEE_RANGED_UNIT_TYPES',
      'ERA_1_2_MELEE_UNIT_TYPES', 'LOCAL_INFRASTRUCTURE_BUILDINGS', 'getLocalCityHealingBonus',
      'CITY_NAMES', 'foundCity', 'isPositionCoastal', 'isCityCoastal', 'civHasCoastalCity',
      'razeForestForProduction', 'getAvailableBuildings', 'getTrainableUnitsForCiv',
      'getTrainableUnitsForCity', 'isBuildingObsolete', 'isUnitObsolete', 'cityFollowsOwnFaith',
      'getDetectionUnitTypeForCiv', 'SETTLER_COST_BY_ERA', 'getSettlerProductionCost',
      'getCatalogProductionCost', 'getProductionCostForItem', 'createProductionCostContext',
      'applyProductionBonus', 'PRODUCTION_ICONS', 'PRODUCTION_ICON_FALLBACK',
      'getProductionDisplayName', 'getProductionIconForItem', 'describeDroppedProductionItem',
      'completeCityProductionItem', 'processCity',
    ];
    for (const name of PRE_SPLIT_PUBLIC_VALUES) {
      expect(mod, `city-system barrel must re-export ${name}`).toHaveProperty(name);
    }
    // Helpers that were private before the split must stay private.
    for (const internal of [
      'requiresResource', 'getBuildingDiscountMultiplier', 'getTechCostDiscountMultiplier',
      'getNationalProjectDiscountMultiplier', 'normalizeProductionEra', 'NP_PRODUCTION_DISCOUNTS',
    ]) {
      expect(mod, `${internal} must stay internal to its city domain module`).not.toHaveProperty(internal);
    }
  });

  it('pricing has exactly one implementation, and the state-derived context consumes it directly', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walk(full) : e.name.endsWith('.ts') ? [full] : [];
      });
    }
    const srcRoot = resolve(__dirname, '../../src');
    const defsOf = (re: RegExp) => walk(srcRoot).filter(f => re.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(srcRoot.length + 1));
    expect(defsOf(/export function getProductionCostForItem\(/)).toEqual(['systems/city-production-cost.ts']);
    // production-cost-context.ts is the canonical GameState -> context adapter (#984);
    // it must read the pricing core from the cost module, not through the barrel.
    const contextImports = readFileSync(resolve(sys, 'production-cost-context.ts'), 'utf8');
    expect(contextImports).toContain("from '@/systems/city-production-cost'");
    expect(contextImports).not.toContain("from '@/systems/city-system'");
  });

  it('presentation is consumed from the presentation module, not the simulation barrel', () => {
    const repoRoot = resolve(__dirname, '../..');
    const presentationConsumers = [
      'src/ui/notification-routing.ts',
      'src/ui/city-panel-building-icon.ts',
      'src/ui/city-panel.ts',
      'src/app/controllers/panel-actions-controller.ts',
    ];
    for (const file of presentationConsumers) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      expect(source, `${file} must import presentation from city-production-presentation`).toContain("from '@/systems/city-production-presentation'");
    }
  });
});

describe('#1009 — espionage-system decomposition boundaries', () => {
  const sys = resolve(__dirname, '../../src/systems');
  const readSys = (name: string) => readFileSync(resolve(sys, name), 'utf8');

  function importsOf(name: string): string[] {
    const src = readSys(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)]
      .map(m => m[1]!)
      .map(spec => spec.replace(/^@\/systems\//, './').replace(/^\.\//, '').replace(/\.ts$/, ''));
  }

  const ESPIONAGE_MODULES = [
    'espionage-catalog',
    'espionage-state',
    'espionage-probability',
    'espionage-spy-lifecycle',
    'espionage-counterintel',
    'espionage-missions',
    'espionage-interrogation',
    'espionage-turn',
    'espionage-presentation',
  ];

  const siblingsOnly = (name: string) => importsOf(name).filter(s => ESPIONAGE_MODULES.includes(s));

  it('catalog/state/counterintel/interrogation are leaf-ward and reach no app/ui/renderer', () => {
    expect(siblingsOnly('espionage-catalog.ts'), 'catalog must import no sibling').toEqual([]);
    expect(siblingsOnly('espionage-counterintel.ts')).toEqual([]);
    expect(siblingsOnly('espionage-interrogation.ts')).toEqual([]);
    expect(siblingsOnly('espionage-state.ts')).toEqual(['espionage-catalog']);
    for (const name of [
      'espionage-catalog.ts', 'espionage-state.ts', 'espionage-probability.ts',
      'espionage-counterintel.ts', 'espionage-interrogation.ts',
    ]) {
      const imports = importsOf(name);
      expect(
        imports.some(s => s.startsWith('@/app') || s.startsWith('@/ui') || s.startsWith('@/renderer')),
        `${name} must not reach into app/ui/renderer`,
      ).toBe(false);
    }
  });

  it('probability depends only on the catalog', () => {
    expect(siblingsOnly('espionage-probability.ts')).toEqual(['espionage-catalog']);
  });

  it('the spy lifecycle does not import turn, missions, interrogation or state', () => {
    const imports = siblingsOnly('espionage-spy-lifecycle.ts');
    for (const forbidden of ['espionage-turn', 'espionage-missions', 'espionage-interrogation', 'espionage-state']) {
      expect(imports, `lifecycle must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(imports).toContain('espionage-counterintel');
  });

  it('mission commands do not import the turn loop, lifecycle or counterintel', () => {
    const imports = siblingsOnly('espionage-missions.ts');
    for (const forbidden of [
      'espionage-turn', 'espionage-spy-lifecycle', 'espionage-counterintel',
      'espionage-interrogation', 'espionage-probability', 'espionage-state',
    ]) {
      expect(imports, `missions must not import ${forbidden}`).not.toContain(forbidden);
    }
    expect(imports).toContain('espionage-catalog');
  });

  it('turn orchestration consumes the domain transitions but never presentation or state', () => {
    const imports = siblingsOnly('espionage-turn.ts');
    for (const needed of [
      'espionage-catalog', 'espionage-probability', 'espionage-counterintel',
      'espionage-missions', 'espionage-spy-lifecycle',
    ]) {
      expect(imports, `turn must import ${needed}`).toContain(needed);
    }
    expect(imports).not.toContain('espionage-presentation');
    expect(imports).not.toContain('espionage-state');
  });

  it('presentation re-exports only the read surface (catalog + probability)', () => {
    expect([...new Set(siblingsOnly('espionage-presentation.ts'))].sort())
      .toEqual(['espionage-catalog', 'espionage-probability']);
    const src = readSys('espionage-presentation.ts');
    for (const mutation of [
      'processEspionageTurn', 'resolveMissionResult', 'startMission',
      'turnCapturedSpy', 'executeSpy', 'attemptInfiltration',
    ]) {
      expect(src, `presentation must not surface ${mutation}`).not.toContain(mutation);
    }
  });

  it('the espionage-* modules form an acyclic import graph', () => {
    const graph = new Map(ESPIONAGE_MODULES.map(n => [n, siblingsOnly(`${n}.ts`)]));
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
    for (const n of ESPIONAGE_MODULES) visit(n);
    expect(cycles, cycles.join('\n')).toEqual([]);
  });

  it('#1201: the espionage turn owns its consequence appliers; classifier consumers stay on the leaf', () => {
    // flip_loyalty/intercept_courier now apply the canonical city/trade transitions
    // inside processEspionageTurn (no caller glue). That is only safe because the
    // spy-classifier consumers import the leaf — importing the barrel there is what
    // previously pulled the turn into the city-capture/unit-movement component.
    const turn = importsOf('espionage-turn.ts');
    expect(turn).toContain('city-capture-system');
    expect(turn).toContain('trade-system');
    for (const consumer of ['espionage-stealth.ts', 'detection-system.ts']) {
      expect(importsOf(consumer), `${consumer} must import the leaf`).toContain('spy-unit-types');
      expect(importsOf(consumer), `${consumer} must not import the barrel`).not.toContain('espionage-system');
    }
  });

  it('espionage-system.ts stays a barrel: the full pre-split public value surface is preserved', async () => {
    const mod = await import('@/systems/espionage-system');
    const PRE_SPLIT_PUBLIC_VALUES = [
      'MISSION_BASE_SUCCESS', 'createEspionageCivState', 'getSpySuccessChance',
      'getEspionageModifierBreakdown', 'getMissionDuration', 'createSpyFromUnit',
      'setDisguise', 'cleanupDeadSpyUnit', 'embedSpy', 'unembedSpy', 'attemptSweep',
      'recallSpy', 'getAvailableMissions', 'missionRequiresPlacedSpy', 'startMission',
      'checkAndApplyPromotion', 'processSpyTurn', 'resolveMissionResult',
      'handleSpyExpelled', 'handleSpyCaptured', 'setCounterIntelligence', 'applyBuildingCI',
      'getSpyCaptureRelationshipPenalty', 'expelSpy', 'executeSpy', 'startInterrogation',
      'processInterrogation', 'turnCapturedSpy', 'verifyAgent', 'ESPIONAGE_TECH_MAX_SPIES',
      'initializeEspionage', 'processEspionageTurn', 'getInfiltrationSuccessChance',
      'attemptInfiltration', 'isSpyUnitType',
    ];
    for (const name of PRE_SPLIT_PUBLIC_VALUES) {
      expect(mod, `espionage-system barrel must re-export ${name}`).toHaveProperty(name);
    }
    for (const internal of [
      'MISSION_DURATIONS', 'XP_PER_MISSION', 'getMissionXp', 'INFILTRATOR_MISSIONS',
      'HANDLER_MISSIONS', 'PROMOTION_XP_THRESHOLD', 'SPY_NAMES', 'INFILTRATION_BASE',
      'EXPULSION_COOLDOWN', 'EXPOSE_SCANDAL_PENALTY', 'resolveInterrogationIntel',
    ]) {
      expect(mod, `${internal} must stay internal to its espionage domain module`).not.toHaveProperty(internal);
    }
  });

  it('each security-relevant computation has exactly one implementation', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walk(full) : e.name.endsWith('.ts') ? [full] : [];
      });
    }
    const srcRoot = resolve(__dirname, '../../src');
    const defsOf = (re: RegExp) => walk(srcRoot).filter(f => re.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(srcRoot.length + 1));
    expect(defsOf(/export function resolveMissionResult\(/)).toEqual(['systems/espionage-missions.ts']);
    expect(defsOf(/export function processEspionageTurn\(/)).toEqual(['systems/espionage-turn.ts']);
    expect(defsOf(/export function getSpySuccessChance\(/)).toEqual(['systems/espionage-probability.ts']);
    expect(defsOf(/export function getAvailableMissions\(/)).toEqual(['systems/espionage-catalog.ts']);
    expect(defsOf(/export function turnCapturedSpy\(/)).toEqual(['systems/espionage-counterintel.ts']);
  });

  it('src/ui may only reach the viewer-facing espionage read surface', () => {
    const repoRoot = resolve(__dirname, '../..');
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = resolve(dir, e.name);
        return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : [];
      });
    }
    const offenders: string[] = [];
    for (const file of walk(resolve(repoRoot, 'src/ui'))) {
      const source = readFileSync(file, 'utf8');
      for (const m of ESPIONAGE_MODULES) {
        if (m === 'espionage-presentation') continue;
        if (new RegExp(`from '(@/systems/${m}|\\.\\./systems/${m})'`).test(source)) {
          offenders.push(`${file.slice(repoRoot.length + 1)}: imports ${m} directly`);
        }
      }
      if (/from '(?:@\/systems\/espionage-system|\.\.\/systems\/espionage-system)'/.test(source)) {
        offenders.push(`${file.slice(repoRoot.length + 1)}: imports the espionage barrel directly`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
    const panel = readFileSync(resolve(repoRoot, 'src/ui/espionage-panel.ts'), 'utf8');
    expect(panel).toContain("from '../systems/espionage-presentation'");
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

describe('#870 — sovereignty, passage and logistical support stay three separate answers', () => {
  const readSrc = (rel: string) =>
    readFileSync(resolve(__dirname, '../../src', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const SUPPORT_LEAKS = /open_borders|hasAllianceTreaty|hasTreatyBetween|territorial-access|classifyTerritorialRelation|classifyLandSupplyTerritory|vassalage/;

  it('land supply derives its territory class from the one relation vocabulary, and only there', () => {
    const territory = readSrc('systems/supply-territory.ts');
    expect(territory).toMatch(/from '\.\/territorial-access'/);
    // No second treaty read: the class is a mapping of `TerritorialRelation`, nothing else.
    expect(territory).not.toMatch(/open_borders|hasAllianceTreaty|hasTreatyBetween|diplomacy-/);
    for (const rel of ['systems/supply-system.ts', 'systems/supply-progression.ts', 'systems/supply-sources.ts']) {
      expect(readSrc(rel), `${rel} must not read treaties itself`).not.toMatch(/open_borders|hasAllianceTreaty|hasTreatyBetween|diplomacy-/);
    }
  });

  it('support rights other than attrition remain own-territory only: Open Borders promotes none of them', () => {
    // Supply SOURCES are the civ's own cities/forts; air basing requires the same owner.
    expect(readSrc('systems/supply-sources.ts')).not.toMatch(SUPPORT_LEAKS);
    expect(readSrc('systems/air-operations-system.ts')).not.toMatch(SUPPORT_LEAKS);
    expect(readSrc('systems/supply-naval.ts')).not.toMatch(SUPPORT_LEAKS);
    // Healing derives "friendly" only from the civ's own tile owner.
    const turnManager = readFileSync(resolve(__dirname, '../../src/core/turn-manager.ts'), 'utf8');
    const start = turnManager.indexOf('Heal units BEFORE resetting');
    const end = turnManager.indexOf('getRestAvailability(unit.landSupply)', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const healBlock = turnManager.slice(start, end).replace(/\/\/.*$/gm, '');
    expect(healBlock).toMatch(/inFriendlyTerritory = !inFriendlyCity && \(tile\?\.owner === civId\)/);
    expect(healBlock).not.toMatch(SUPPORT_LEAKS);
  });

  it('the AI\'s border signal is built from its own visibility only', () => {
    const borders = readSrc('ai/ai-known-borders.ts');
    expect(borders).toMatch(/getVisibility\(visibility, neighbor\) !== 'visible'/);
    expect(borders).not.toMatch(/\.civilizations\[(?!civId)/);
  });
});

describe('#1015 — GameSession publication boundary', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const srcFiles = walkTs(resolve(root, 'src'));
  const rel = (file: string) => file.slice(root.length + 1);

  it('the removed silent write never comes back: no code in src/ or tests/ calls setStateWithoutRefresh', () => {
    const offenders = [...srcFiles, ...walkTs(resolve(root, 'tests'))]
      // These three name the removed API only to assert (or check the rule for) its absence.
      .filter(file => !['tests/app/architecture-boundaries.test.ts', 'tests/app/game-session.test.ts', 'tests/scripts/check-src-rule-violations.test.ts']
        .some(allowed => file.endsWith(allowed)))
      .filter(file => stripComments(readFileSync(file, 'utf8')).includes('setStateWithoutRefresh'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the controller-facing GameSession port is exactly getState/commit/update/batch/subscribe', () => {
    const ports = stripComments(readFileSync(resolve(root, 'src/app/ports.ts'), 'utf8'));
    const body = ports.slice(ports.indexOf('export interface GameSession {'));
    const iface = body.slice(0, body.indexOf('\n}\n'));
    const members = [...iface.matchAll(/^  (\w+)[<(]/gm)].map(m => m[1]).sort();
    expect(members).toEqual(['batch', 'commit', 'getState', 'subscribe', 'update']);
  });

  it('the set of reasons a transition may be silent is closed and reviewed here', () => {
    const ports = stripComments(readFileSync(resolve(root, 'src/app/ports.ts'), 'utf8'));
    const union = ports.slice(ports.indexOf('export type UnpublishedReason ='), ports.indexOf('export interface UnpublishedStateWriter'));
    expect([...union.matchAll(/'([a-z-]+)'/g)].map(m => m[1]).sort()).toEqual([
      'derived-bookkeeping', 'pre-world-entry', 'presentation-deferred', 'viewer-not-yet-revealed',
    ]);
  });

  it('every silent transition in src/ is one of the pinned (owner, reason) pairs', () => {
    const found: Record<string, string[]> = {};
    for (const file of srcFiles) {
      if (file.endsWith('src/app/game-session.ts')) continue; // defines adopt()
      const code = stripComments(readFileSync(file, 'utf8'));
      const reasons = [...code.matchAll(/unpublished\.adopt\([\s\S]*?,\s*'([a-z-]+)'\)/g)].map(m => m[1]);
      if (reasons.length > 0) found[rel(file)] = reasons.sort();
    }
    // Adding a row is a design decision: name the reason, and say in the PR why publishing is wrong.
    expect(found).toEqual({
      'src/app/controllers/campaign-entry-controller.ts': [
        'pre-world-entry', 'pre-world-entry', 'pre-world-entry', 'viewer-not-yet-revealed',
      ],
      'src/app/controllers/turn-flow-controller.ts': [
        'presentation-deferred', 'presentation-deferred',
        'viewer-not-yet-revealed', 'viewer-not-yet-revealed', 'viewer-not-yet-revealed', 'viewer-not-yet-revealed',
      ],
      'src/app/cross-cutting-helpers.ts': ['derived-bookkeeping'],
    });
  });

  it('the wide session handle (with the silent writer) is only ever named by its factory', () => {
    const importers = srcFiles
      .filter(file => !file.endsWith('src/app/game-session.ts'))
      .filter(file => stripComments(readFileSync(file, 'utf8')).includes('GameSessionHandle'))
      .map(rel);
    expect(importers).toEqual([]);
  });

  // #1199: a hand push is a *statement* — `renderLoop.setGameState(...);`,
  // `hud.update();`, `deps.updateHUD();`. The `updateHUD: () => deps.hud.update(),`
  // dep wiring ends in `,`, not `;`, so it is not a push. The one allowed statement
  // push is turn-flow-controller.ts's `presentation-deferred` pair, pinned by
  // content, not just by file: exactly one renderer push before `await replayAIMoves`
  // and one HUD update after it.
  const PUSH_RENDERER = /renderLoop\.setGameState\([^;]*;/;
  const PUSH_HUD = /\b(?:hud\.update|updateHUD)\([^;]*;/;
  const linesMatching = (code: string, pattern: RegExp): number[] =>
    stripComments(code)
      .split('\n')
      .map((line, index) => (pattern.test(line) ? index : -1))
      .filter(index => index >= 0);

  function isPinnedPresentationDeferred(code: string): boolean {
    const cleaned = stripComments(code);
    const renderer = linesMatching(cleaned, PUSH_RENDERER);
    const hud = linesMatching(cleaned, PUSH_HUD);
    if (renderer.length !== 1 || hud.length !== 1 || renderer[0] >= hud[0]) return false;
    const between = cleaned.split('\n').slice(renderer[0] + 1, hud[0]).join('\n');
    return /await\s+replayAIMoves\s*\(/.test(between);
  }

  function controllerPublicationOffenders(files: Array<{ path: string; code: string }>): string[] {
    const pinnedPath = 'src/app/controllers/turn-flow-controller.ts';
    return files
      .filter(({ path, code }) => {
        const cleaned = stripComments(code);
        if (path === pinnedPath && isPinnedPresentationDeferred(cleaned)) return false;
        return linesMatching(cleaned, PUSH_RENDERER).length > 0
          || linesMatching(cleaned, PUSH_HUD).length > 0;
      })
      .map(({ path }) => path);
  }

  it('#1199: a controller never pushes renderer/HUD state by hand (only the pinned presentation-deferred pair)', () => {
    // Publication is the session's job (bootstrap subscribes renderer then HUD once).
    const controllers = srcFiles
      .filter(file => file.includes('/src/app/controllers/'))
      .map(file => ({ path: rel(file), code: readFileSync(file, 'utf8') }));

    expect(controllerPublicationOffenders(controllers)).toEqual([]);

    // The pin is by content: turn-flow-controller must still carry exactly the pair.
    const turnFlow = controllers.find(({ path }) => path === 'src/app/controllers/turn-flow-controller.ts');
    expect(turnFlow).toBeDefined();
    expect(isPinnedPresentationDeferred(turnFlow!.code)).toBe(true);

    // Non-vacuity: a synthetic controller with a hand push is reported...
    expect(controllerPublicationOffenders([
      { path: 'src/app/controllers/foo.ts', code: 'renderLoop.setGameState(x);\nhud.update();\n' },
    ])).toEqual(['src/app/controllers/foo.ts']);
    // ...and the `updateHUD: () => deps.hud.update(),` dep wiring is not.
    expect(controllerPublicationOffenders([
      { path: 'src/app/controllers/foo.ts', code: '      updateHUD: () => deps.hud.update(),\n' },
    ])).toEqual([]);
  });
});

describe('#1014 — caller-discipline contracts are structural, not remembered', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const srcFiles = walkTs(resolve(root, 'src'));
  const rel = (file: string) => file.slice(root.length + 1);
  /** src files whose (comment-stripped) code mentions `symbol` as an identifier. */
  const filesMentioning = (symbol: string): string[] => srcFiles
    .filter(file => new RegExp(`\\b${symbol}\\b`).test(stripComments(readFileSync(file, 'utf8'))))
    .map(rel)
    .sort();

  it('a beast slay is applied only by applyCombatOutcomeToState, for every executor', () => {
    // Defined in beast-system.ts, applied in combat-reward-system.ts. Any other src file naming it is
    // a second executor re-implementing the consequence (or forgetting it: the pre-#1014 state).
    expect(filesMentioning('recordBeastSlain')).toEqual([
      'src/systems/beast-system.ts',
      'src/systems/combat-reward-system.ts',
    ]);
  });

  it('every combat executor that announces the fight reads beastsSlain from the shared result, never re-derives it', () => {
    const combatReward = stripComments(readFileSync(resolve(root, 'src/systems/combat-reward-system.ts'), 'utf8'));
    expect(combatReward).toMatch(/beastsSlain: BeastSlainPayload\[\]/);
    // The event is owned by the same function, alongside the liveness transitions it already owned.
    expect(combatReward).toMatch(/if \(bus\) for \(const slain of beastsSlain\) bus\.emit\('beast:slain', slain\)/);
    // ...so no executor emits it a second time.
    const emitters = srcFiles
      .filter(file => /emit\(\s*'beast:slain'/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(rel);
    expect(emitters).toEqual(['src/systems/combat-reward-system.ts']);
  });

  it('a strategic strike is launched only through executeStrategicLaunch: resolveStrategicStrike has one caller', () => {
    expect(filesMentioning('resolveStrategicStrike')).toEqual([
      'src/systems/strategic-launch-execution-system.ts',
      'src/systems/strategic-strike-system.ts',
    ]);
  });

  it('single-side vassalage mutators are reachable only through diplomacy-vassalage (the bilateral committer)', () => {
    for (const symbol of ['acceptVassalage', 'endVassalage', 'endVassalageUnilateral']) {
      expect(filesMentioning(symbol), symbol).toEqual([
        'src/systems/diplomacy-vassal-rules.ts',
        'src/systems/diplomacy-vassalage.ts',
      ]);
    }
  });

  it('the settlement event cannot be written out of order: war-history exposes only the ordering-owning function', () => {
    expect(filesMentioning('recordSettlementSigned')).toEqual([]);
    expect(filesMentioning('withSettlementSigned')).toEqual([
      'src/systems/settlement-system.ts',
      'src/systems/war-history-system.ts',
    ]);
  });

  it('a unit upgrade cannot be applied without paying: the unpaid primitive has no importers and is not exported', () => {
    const upgrade = stripComments(readFileSync(resolve(root, 'src/systems/unit-upgrade-system.ts'), 'utf8'));
    expect(upgrade).not.toMatch(/export function applyUpgrade\b/);
    expect(filesMentioning('applyUpgrade')).toEqual(['src/systems/unit-upgrade-system.ts']);
  });
});

describe('#1198 — a unit leaves GameState through exactly one transition', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const srcFiles = walkTs(resolve(root, 'src'));
  const rel = (file: string) => file.slice(root.length + 1);
  const code = (file: string) => stripComments(readFileSync(file, 'utf8'));
  const filesMentioning = (symbol: string): string[] => srcFiles
    .filter(file => new RegExp(`\\b${symbol}\\b`).test(code(file)))
    .map(rel)
    .sort();

  // The three shapes a hand-rolled removal takes: delete, rest-destructure, filter-rebuild. Same patterns as the
  // `check-src-rule-violations.sh` source rule, but swept over every file so a rule that was bypassed (a hook
  // that never ran) still fails CI.
  const HAND_ROLLED_REMOVAL = [
    /delete\s+[\w.!()]*[uU]nits\[/,
    /\]:\s*_\w*,\s*\.\.\.\w+\s*\}\s*=\s*[\w.()]*[uU]nits\s*;?\s*$/m,
    /fromEntries\(Object\.entries\([\w.()]*[uU]nits\)\.(filter|flatMap)/,
  ];

  it('no production file hand-rolls a unit removal outside the canonical module and save repairs', () => {
    const offenders = srcFiles
      .filter(file => !rel(file).startsWith('src/storage/') && rel(file) !== 'src/systems/unit-removal-system.ts')
      .filter(file => HAND_ROLLED_REMOVAL.some(pattern => pattern.test(code(file))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the two helpers that used to disagree are gone, and a dead spy is cleaned only by the canonical removal', () => {
    expect(filesMentioning('removeUnitFromCopies')).toEqual([]);
    expect(filesMentioning('destroyCarrierBasedAircraft')).toEqual([]);
    // Defined in espionage-spy-lifecycle.ts (#1009), re-exported by the espionage barrel; only the canonical
    // removal calls it.
    expect(filesMentioning('cleanupDeadSpyUnit')).toEqual([
      'src/systems/espionage-spy-lifecycle.ts',
      'src/systems/espionage-system.ts',
      'src/systems/unit-removal-system.ts',
    ]);
  });

  it('removal does not reconcile civilization liveness: that stays with the orchestrator that owns the whole transition', () => {
    expect(code(resolve(root, 'src/systems/unit-removal-system.ts'))).not.toMatch(/reconcileCivilizationLiveness/);
  });
});

describe('#1200 — the consequences of a kill belong to the shared combat outcome, not to each executor', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const srcFiles = walkTs(resolve(root, 'src'));
  const rel = (file: string) => file.slice(root.length + 1);
  const filesMentioning = (symbol: string): string[] => srcFiles
    .filter(file => new RegExp(`\\b${symbol}\\b`).test(stripComments(readFileSync(file, 'utf8'))))
    .map(rel)
    .sort();

  // Every code path that applies a real fight. A new executor must be added here deliberately: it then
  // inherits camp destruction, the combat record, route cleanup and the rest by construction.
  const EXECUTORS = [
    'src/ai/ai-major-turn.ts',
    'src/ai/ai-tactics.ts',
    'src/ai/basic-ai.ts',
    'src/app/controllers/player-action-controller.ts',
    'src/core/turn-manager.ts',
    'src/systems/air-operations-system.ts',
    'src/systems/airborne-system.ts',
    'src/systems/minor-civ-system.ts',
    'src/systems/pirate-system.ts',
    'src/systems/stampede-system.ts',
  ];

  it('the executor list is exactly the set of files that apply a fight', () => {
    const appliers = filesMentioning('applyCombatOutcomeToState').filter(file => file !== 'src/systems/combat-reward-system.ts');
    // Files that merely name it in a doc string are not executors.
    const real = appliers.filter(file => /applyCombatOutcomeToState\(/.test(stripComments(readFileSync(resolve(root, file), 'utf8'))));
    expect(real).toEqual(EXECUTORS);
  });

  it('no executor re-applies the combat record or route cleanup for a fight result', () => {
    expect(filesMentioning('recordCombatForCiv')).toEqual([
      'src/systems/combat-reward-system.ts',
      'src/systems/threat-pressure-system.ts',
    ]);
    // trade-system defines it and unit-movement/etc. never call it for a fight; nothing else may name it.
    expect(filesMentioning('removeRouteForUnit').filter(file => EXECUTORS.includes(file))).toEqual([]);
  });

  it('a camp under a defeated unit is destroyed only by the shared outcome; the remaining callers occupy an EMPTY camp', () => {
    expect(filesMentioning('applyCampDestructionAtTarget')).toEqual([
      'src/ai/ai-major-turn.ts',          // occupy-an-undefended-camp, not a fight result
      'src/ai/ai-tactics.ts',             // same, as a tactical action
      'src/app/controllers/player-action-controller.ts', // same, the player's move onto a camp
      'src/systems/barbarian-system.ts',
      'src/systems/combat-reward-system.ts',
    ]);
  });
});

describe('#1202 — a finished trainable unit enters GameState through one completion', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const srcFiles = walkTs(resolve(root, 'src'));
  const rel = (file: string) => file.slice(root.length + 1);
  const filesMentioning = (symbol: string): string[] => srcFiles
    .filter(file => new RegExp(`\\b${symbol}\\b`).test(stripComments(readFileSync(file, 'utf8'))))
    .map(rel)
    .sort();

  it('the turn path and the gold rush-buy both complete units through completeUnitProduction, and nothing else does', () => {
    expect(filesMentioning('completeUnitProduction')).toEqual([
      'src/core/turn-manager.ts',
      'src/systems/economy-system.ts',
      'src/systems/unit-production-completion.ts',
    ]);
  });

  it('the completion side effects have one owner: missionary charges and the spy record are applied only there', () => {
    expect(filesMentioning('MISSIONARY_BASE_CHARGES')).toEqual([
      'src/systems/religion-definitions.ts',
      'src/systems/unit-production-completion.ts',
    ]);
    expect(filesMentioning('createSpyFromUnit')).toEqual([
      'src/systems/espionage-spy-lifecycle.ts',
      'src/systems/espionage-system.ts',
      'src/systems/unit-production-completion.ts',
    ]);
  });
});

describe('#1025 — the action-contract inventory is complete and every gap has an owner', () => {
  const root = resolve(__dirname, '../..');
  const inventory = readFileSync(resolve(root, 'docs/action-contract-inventory.md'), 'utf8');
  const rows = inventory.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Action family') && !line.startsWith('|---') && !line.startsWith('| Status') && !line.startsWith('| **'));
  const STATUSES = ['canonical-exempt', 'canonical', 'partially-structural', 'caller-discipline'] as const;
  const statusOf = (row: string) => STATUSES.find(status => new RegExp(`\\*\\*${status}\\*\\*`).test(row));

  it('lists every action family the audit covers, each with a defined status', () => {
    expect(rows.length).toBeGreaterThanOrEqual(18);
    for (const row of rows) expect(statusOf(row), row.slice(0, 80)).toBeDefined();
    for (const family of ['Ordinary movement', 'Unit attack', 'City assault', 'Pillage', 'Production queue', 'Rush-buy', 'Diplomatic actions', 'Great General', 'Air strike', 'Auto-explore', 'Governance policy', 'Governor assignment', 'Espionage missions', 'Unit upgrade']) {
      expect(rows.some(row => row.startsWith(`| ${family}`)), family).toBe(true);
    }
  });

  it('every partially-structural or caller-discipline row names an issue that owns the gap', () => {
    const open = rows.filter(row => ['partially-structural', 'caller-discipline'].includes(statusOf(row) ?? ''));
    expect(open.length).toBeGreaterThan(0);
    for (const row of open) expect(row, row.slice(0, 80)).toMatch(/→ #\d{3,5}/);
  });

  it('movement stays the branded-command exemplar and the generalised rule exists', () => {
    expect(rows.find(row => row.startsWith('| Ordinary movement'))).toMatch(/ValidatedUnitMove/);
    const rule = readFileSync(resolve(root, '.claude/rules/action-contracts.md'), 'utf8');
    expect(rule).toContain('docs/action-contract-inventory.md');
    expect(readFileSync(resolve(root, 'CLAUDE.md'), 'utf8')).toContain('.claude/rules/action-contracts.md');
  });
});

describe('#1219 — a unit-vs-unit exchange only starts through the canonical attack legality', () => {
  function walkTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = resolve(dir, e.name);
      return e.isDirectory() ? walkTs(full) : /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }
  const root = resolve(__dirname, '../..');
  const files = walkTs(resolve(root, 'src')).map(file => ({
    path: file.slice(root.length + 1),
    source: readFileSync(file, 'utf8'),
  }));

  it('every resolveCombat caller either ran the legality first or is a named, pinned exemption', () => {
    expect(findAttackContractViolations(files)).toEqual([]);
  });

  it('the pinned exemptions are exactly the world actors, previews and air missions that exist', () => {
    expect(Object.keys(EXPECTED_EXEMPTIONS).sort()).toEqual([
      'src/ai/ai-tactics.ts',
      'src/core/turn-manager.ts',
      'src/systems/air-operations-system.ts',
      'src/systems/airborne-system.ts',
      'src/systems/minor-civ-system.ts',
      'src/systems/stampede-system.ts',
    ]);
  });

  describe('the check itself is not vacuous', () => {
    const fighter = (body: string) => `function fightIt(state) {\n${body}\n}\n`;
    const run = (path: string, source: string) => findAttackContractViolations([{ path, source }])
      .filter(violation => violation.line !== 0);

    it('rejects a new executor that resolves a fight with no legality', () => {
      const violations = run('src/ai/new-executor.ts', fighter('  const result = resolveCombat(a, d, map, seed);'));
      expect(violations).toHaveLength(1);
      expect(violations[0]!.message).toMatch(/no canonical attack legality/);
    });

    it('accepts the same executor once it runs the canonical check first', () => {
      for (const token of ['resolveUnitVsUnitAttack', 'canUnitAttackTarget', 'getEmbarkedAssaultTarget']) {
        const source = fighter(`  if (!${token}(state, a, d).ok) return state;\n  const result = resolveCombat(a, d, map, seed);`);
        expect(run('src/ai/new-executor.ts', source)).toEqual([]);
      }
    });

    it('does not accept a legality token that only appears in a comment', () => {
      const source = fighter('  // canUnitAttackTarget(...) was checked by the caller, trust me\n  const result = resolveCombat(a, d, map, seed);');
      expect(run('src/ai/new-executor.ts', source)).toHaveLength(1);
    });

    it('does not accept legality that belongs to a different function', () => {
      const source = 'function other(state) { return canUnitAttackTarget(state, a, c); }\n\n'
        + 'function sneaky(state) {\n  return resolveCombat(a, d, map, seed);\n}\n';
      expect(run('src/ai/new-executor.ts', source)).toHaveLength(1);
    });

    it('rejects an exemption with an unknown category, a throwaway reason, or no call beneath it', () => {
      expect(run('src/x.ts', fighter('  // attack-contract-exempt: because: trust me please\n  resolveCombat(a, d, map, seed);'))[0]!.message)
        .toMatch(/unknown attack-contract-exempt category/);
      expect(run('src/x.ts', fighter('  // attack-contract-exempt: preview: ok\n  resolveCombat(a, d, map, seed);'))
        .some(violation => /real reason/.test(violation.message))).toBe(true);
      expect(run('src/x.ts', fighter('  // attack-contract-exempt: preview: scored only, never applied\n  const nothing = 1;'))
        .some(violation => /stale/.test(violation.message))).toBe(true);
    });

    it('rejects an exemption that is not in the pinned table (no accidental exemptions)', () => {
      const all = findAttackContractViolations([{
        path: 'src/systems/brand-new-world-actor.ts',
        source: fighter('  // attack-contract-exempt: world-actor: a new monster picks its own prey\n  resolveCombat(a, d, map, seed);'),
      }]);
      expect(all.some(violation => /expected 0 "world-actor" exemption\(s\), found 1/.test(violation.message))).toBe(true);
    });
  });
});

