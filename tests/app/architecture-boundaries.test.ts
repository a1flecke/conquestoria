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
