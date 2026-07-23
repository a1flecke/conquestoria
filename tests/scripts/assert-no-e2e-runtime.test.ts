import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNoE2ERuntime } from '../../scripts/assert-no-e2e-runtime.mjs';

const tempDirs: string[] = [];

function createDist(): string {
  const root = mkdtempSync(join(tmpdir(), 'cq-e2e-runtime-'));
  tempDirs.push(root);
  mkdirSync(join(root, 'assets'));
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('assertNoE2ERuntime', () => {
  it('accepts emitted assets without the e2e sentinel', () => {
    const root = createDist();
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok");');

    expect(() => assertNoE2ERuntime(root)).not.toThrow();
  });

  it('rejects the e2e sentinel in emitted JavaScript', () => {
    const root = createDist();
    writeFileSync(join(root, 'assets', 'app.js'), 'window.__CONQUESTORIA_E2E_DIAGNOSTICS__;');

    expect(() => assertNoE2ERuntime(root)).toThrow(/e2e runtime sentinel/i);
  });

  it('rejects the e2e sentinel in source maps', () => {
    const root = createDist();
    writeFileSync(join(root, 'assets', 'app.js.map'), '__CONQUESTORIA_E2E_DIAGNOSTICS__');

    expect(() => assertNoE2ERuntime(root)).toThrow(/app\.js\.map/);
  });
});
