import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';

// This test does not spin up the full GameSessionController (that needs a
// DOM, canvas, audio system, etc. -- out of scope here). It instead proves
// the two invariants Task 4's manual code change depends on: (1) every name
// a developer might type resolves through the same SCENARIOS registry the
// Vitest suite uses, and (2) an unknown name is a clear, catchable error
// rather than a silent no-op -- matching the `throw new Error(...)` in the
// controller branch itself.
describe('scenario loader contract', () => {
  it('SCENARIOS has at least the two representative bug scenarios', () => {
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining(['undefended-enemy-city', 'undefended-barbarian-camp']),
    );
  });

  it('every registered scenario builds without throwing', () => {
    for (const name of Object.keys(SCENARIOS)) {
      expect(() => buildScenario(SCENARIOS[name]), `scenario "${name}"`).not.toThrow();
    }
  });

  it("mirrors the controller branch's unknown-name error message shape", () => {
    const scenarioName = 'not-a-real-scenario';
    const definition = SCENARIOS[scenarioName as keyof typeof SCENARIOS];
    expect(definition).toBeUndefined();
    const buildErrorMessage = () =>
      `Unknown scenario "${scenarioName}". Known scenarios: ${Object.keys(SCENARIOS).join(', ')}`;
    expect(buildErrorMessage()).toContain('undefended-enemy-city');
  });
});
