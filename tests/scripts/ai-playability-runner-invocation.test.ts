import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1133 item K. `run-ai-playability-regressions.sh` used to route its focused
 * Vitest filter through `yarn test --run <file>` -- the same custom
 * `run-test-suite.sh` package-script layer that has, in the past, swallowed
 * or reinterpreted an argument meant for Vitest. `run-ai-long-horizon.sh`
 * already avoids this by calling `yarn vitest run` directly; this test pins
 * the playability runner to the same pattern so a future edit can't
 * reintroduce the ambiguous indirection.
 */
describe('#1133 AI playability runner invocation shape', () => {
  const scriptPath = resolve(process.cwd(), 'scripts/run-ai-playability-regressions.sh');
  const contents = readFileSync(scriptPath, 'utf8');

  it('invokes yarn vitest run directly', () => {
    expect(contents).toMatch(/yarn vitest run/);
  });

  it('does not route through the yarn test package-script layer', () => {
    expect(contents).not.toMatch(/yarn test\b/);
  });
});
