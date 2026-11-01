import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Structural guards for the #1439 invalidation contract. The runtime behaviour is covered by
 * render-loop-invalidation.test.ts / render-loop-idle.test.ts; these tests make it hard to add a
 * canvas input that silently skips the scheduler.
 */
const RENDER_LOOP = 'src/renderer/render-loop.ts';

// Fields whose value the canvas reads. Assigning or mutating one must happen in a method that
// also calls this.invalidate(). Methods listed in EXEMPT retire time-bound work instead of
// accepting an input: the scheduler's wake timer and generation-based repaint already cover them.
const CANVAS_INPUT_FIELDS = new Set([
  'state', 'worldPressurePresentation', 'herdRoutePresentation', 'loyaltyPressurePresentation',
  'religionBadgePresentation', 'airDefenseOverlayProviders', 'supplyOverlayPresentation',
  'airDefenseOverlayEnabledByViewer', 'supplyOverlayEnabledByViewer', 'highlights', 'journeyPath',
  'selectedUnitId', 'selectedPirateFactionId', 'strategicLaunchPreview', 'touchHandlerRef',
  'unitMovementAnimations', 'unitDeathSnapshots', 'pirateLandmarkDeathSnapshots',
]);
const EXEMPT_METHODS = new Map<string, string>([
  ['advance', 'retires expired death snapshots; the wake timer and overlayStale cover the repaint'],
  ['advanceUnitMovements', 'retires finished movement tweens inside advance()'],
]);
const MUTATORS = new Set(['set', 'push', 'delete', 'clear', 'splice']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function thisFieldOf(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) return node.name.text;
  return null;
}

describe('RenderLoop canvas inputs are only changed through invalidating methods (#1439)', () => {
  const source = ts.createSourceFile(RENDER_LOOP, readFileSync(RENDER_LOOP, 'utf8'), ts.ScriptTarget.Latest, true);
  const loop = source.statements.find(
    (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'RenderLoop',
  )!;

  function mutatedInputs(method: ts.Node): string[] {
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const field = thisFieldOf(node.left);
        if (field && CANVAS_INPUT_FIELDS.has(field)) found.push(field);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && MUTATORS.has(node.expression.name.text)) {
        const field = thisFieldOf(node.expression.expression);
        if (field && CANVAS_INPUT_FIELDS.has(field)) found.push(field);
      }
      ts.forEachChild(node, visit);
    };
    visit(method);
    return found;
  }

  function callsInvalidate(method: ts.Node): boolean {
    let called = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && thisFieldOf(node.expression) === 'invalidate') called = true;
      ts.forEachChild(node, visit);
    };
    visit(method);
    return called;
  }

  it('every method that changes a canvas input calls this.invalidate()', () => {
    const offenders: string[] = [];
    for (const member of loop.members) {
      if (!ts.isMethodDeclaration(member) && !ts.isConstructorDeclaration(member)) continue;
      const name = ts.isConstructorDeclaration(member) ? 'constructor' : (member.name as ts.Identifier).text;
      if (EXEMPT_METHODS.has(name) || name === 'constructor') continue;
      const touched = mutatedInputs(member);
      if (touched.length > 0 && !callsInvalidate(member)) offenders.push(`${name} changes ${[...new Set(touched)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('does not exempt a method that no longer exists', () => {
    const names = new Set(loop.members.filter(ts.isMethodDeclaration).map(m => (m.name as ts.Identifier).text));
    expect([...EXEMPT_METHODS.keys()].filter(name => !names.has(name))).toEqual([]);
  });

  it('would catch a method that mutates an input without invalidating', () => {
    const bad = ts.createSourceFile('x.ts', 'class A { setIt(v) { this.highlights = v; } }', ts.ScriptTarget.Latest, true);
    const method = (bad.statements[0] as ts.ClassDeclaration).members[0]!;
    expect(mutatedInputs(method)).toEqual(['highlights']);
    expect(callsInvalidate(method)).toBe(false);
  });
});

describe('only RenderLoop constructs the camera and the effect queue (#1439)', () => {
  it.each([['new Camera('], ['new AnimationSystem(']])('%s appears only in render-loop.ts', (needle) => {
    const offenders = walk('src')
      .filter(path => /\.(ts|tsx)$/.test(path) && path !== RENDER_LOOP)
      .filter(path => readFileSync(path, 'utf8').includes(needle));
    expect(offenders).toEqual([]);
  });
});
