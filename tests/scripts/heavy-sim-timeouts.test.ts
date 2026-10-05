import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findUnboundedSimTests } from '../helpers/heavy-sim-scan';
import { simTimeout, SIM_SLOWDOWN_FACTOR } from '../helpers/sim-timeout';

// Recurring flake class (#608, #1133, and again in the #420 follow-up arc): a test that loops over turns/rounds relies
// on vitest's 5 s default, which a busy host or a CI shard exceeds. tests/helpers/sim-timeout.ts is the shared sizing;
// this test is the ratchet that stops the shape from coming back.

const TESTS = join(process.cwd(), 'tests');

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('heavy simulation tests declare an explicit timeout', () => {
  it('no test loops over 15+ turns/rounds on the 5 s default', () => {
    const offenders = testFiles(TESTS).filter(file => !file.endsWith('heavy-sim-timeouts.test.ts')).flatMap(file => {
      const source = readFileSync(file, 'utf8');
      return findUnboundedSimTests(source).map(hit => `${relative(process.cwd(), file)}: ${hit.name} (loop ${hit.loopBound})`);
    });
    expect(offenders).toEqual([]);
  });

  it('the scanner catches the shape it exists for', () => {
    const bad = `it('runs many turns', () => {\n  for (let i = 0; i < 60; i++) s = processTurn(s, bus);\n});`;
    expect(findUnboundedSimTests(bad)).toHaveLength(1);
    expect(findUnboundedSimTests(`it('x', () => {\n  for (let i = 0; i < 60; i++) s = processTurn(s, bus);\n}, 30_000);`)).toEqual([]);
    expect(findUnboundedSimTests(`it('x', () => {\n  for (let i = 0; i < 60; i++) s = processTurn(s, bus);\n}, simTimeout(2500));`)).toEqual([]);
    expect(findUnboundedSimTests(`it('x', () => {\n  for (let i = 0; i < 60; i++) s = processTurn(s, bus);\n}, { timeout: 30000 });`)).toEqual([]);
    expect(findUnboundedSimTests(`it('x', () => {\n  for (let i = 0; i < 5; i++) s = processTurn(s, bus);\n});`)).toEqual([]);
    expect(findUnboundedSimTests(`it('x', () => {\n  for (let i = 0; i < 60; i++) pure(s);\n});`)).toEqual([]);
    const named = `const TURNS = 120;\nit('x', () => {\n  for (let i = 0; i < TURNS; i++) s = processTurn(s, bus);\n});`;
    expect(findUnboundedSimTests(named)).toHaveLength(1);
  });

  it('sizes a timeout from the solo worst case with one documented factor and a floor', () => {
    expect(simTimeout(100)).toBe(15_000);
    expect(simTimeout(10_000)).toBe(10_000 * SIM_SLOWDOWN_FACTOR);
  });
});
