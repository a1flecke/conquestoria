import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A canvas visual that varies with wall-clock time must tell the scheduler, or the loop goes
// idle and freezes it (#1439). Rather than trusting authors to remember, any src/renderer module
// that does arithmetic on `nowMs` must import paint-clock.
// Each entry needs a reason. pirate-sprite-state does deadline arithmetic (`nowMs + DURATION`), not
// time-varying pixels: the scheduler wakes a repaint at its `nextExpiryMs()` instead.
const PASS_THROUGH = new Set<string>(['src/renderer/pirate-sprite-state.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('time-varying canvas visuals report to the paint clock (#1439)', () => {
  it('every renderer module that computes from nowMs imports paint-clock', () => {
    const offenders = walk('src/renderer')
      .filter(path => /\.(ts|tsx)$/.test(path))
      .filter(path => !PASS_THROUGH.has(path) && !path.endsWith('paint-clock.ts'))
      .filter(path => /nowMs\s*[/*%+-]|[/*%+-]\s*nowMs|sin\(\s*nowMs/.test(readFileSync(path, 'utf8')))
      .filter(path => !/paint-clock/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
