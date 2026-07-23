import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const E2E_SENTINEL = '__CONQUESTORIA_E2E_DIAGNOSTICS__';

/**
 * Reject e2e-only diagnostics leaking into normal distributable JavaScript or
 * source maps. Source maps are included because a public production artifact
 * must not retain the diagnostic API even when its minified bundle does not.
 */
export function assertNoE2ERuntime(root) {
  const visit = path => {
    for (const name of readdirSync(path)) {
      const child = resolve(path, name);
      if (statSync(child).isDirectory()) {
        visit(child);
        continue;
      }
      if (!name.endsWith('.js') && !name.endsWith('.map')) continue;
      if (readFileSync(child, 'utf8').includes(E2E_SENTINEL)) {
        throw new Error(`e2e runtime sentinel leaked into ${child}`);
      }
    }
  };
  visit(resolve(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertNoE2ERuntime(process.argv[2] ?? 'dist');
}
