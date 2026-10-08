import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadRepoSources } from '../app/architecture/import-graph';

/**
 * #1361 — bounded-context type leaves under `src/core/types/` own their definitions; `src/core/types.ts`
 * only re-exports them for compatibility. Production code must import moved symbols from the leaf, so the
 * barrel's importer count can only fall.
 *
 * Registering a leaf here is the whole act of guarding it. `hex` and `resources` are deliberately NOT
 * guarded: they are primitive support leaves (HexCoord, ResourceType) with hundreds of importers that
 * migrate opportunistically; they exist so domain leaves can avoid importing the barrel (no type cycle).
 */
const GUARDED_TYPE_LEAVES = ['ai'] as const;

const BARREL = 'src/core/types';

/** Symbols the barrel re-exports from `./types/<leaf>`. */
function reexportedFromLeaf(barrelSource: string, leaf: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`export\\s+type\\s*\\{([^}]*)\\}\\s*from\\s*'\\./types/${leaf}'`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(barrelSource))) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  return names;
}

/** `from → name` for every production import of a moved symbol through the barrel. */
function findBarrelLeaks(files: Readonly<Record<string, string>>, moved: ReadonlySet<string>): string[] {
  const graph = buildImportGraph(files);
  const leaks: string[] = [];
  for (const edge of graph.edges) {
    if (edge.to !== BARREL || !edge.from.startsWith('src/') || edge.from === BARREL) continue;
    for (const name of edge.names) if (moved.has(name)) leaks.push(`${edge.from} imports ${name} from the barrel`);
  }
  return leaks.sort();
}

describe('#1361 — moved type contracts have exactly one owner', () => {
  const root = resolve(__dirname, '../..');
  const barrelSource = readFileSync(resolve(root, 'src/core/types.ts'), 'utf8');
  const declares = (source: string, name: string) =>
    new RegExp(`(^|\\n)export\\s+(interface|type|const|enum)\\s+${name}\\b`).test(source);

  for (const leaf of GUARDED_TYPE_LEAVES) {
    describe(`leaf ${leaf}`, () => {
      const moved = reexportedFromLeaf(barrelSource, leaf);
      const leafSource = readFileSync(resolve(root, `src/core/types/${leaf}.ts`), 'utf8');

      it('the barrel re-exports a non-empty set', () => {
        expect(moved.length).toBeGreaterThan(0);
      });

      it('the leaf declares every re-exported symbol and the barrel declares none locally', () => {
        for (const name of moved) {
          expect(declares(leafSource, name), `${name} must be declared in the leaf`).toBe(true);
          expect(declares(barrelSource, name), `${name} must not be declared in core/types.ts`).toBe(false);
        }
      });

      it('no production module imports a moved symbol through the barrel', () => {
        const sources = loadRepoSources(['src']);
        expect(findBarrelLeaks(sources, new Set(moved))).toEqual([]);
      });

      it('the leaf imports no runtime code and never the barrel (no type cycle)', () => {
        expect(leafSource).not.toMatch(/from\s+'(?:@\/core\/types|\.\.\/types|\.\/\.\.\/types)'/);
        expect(leafSource).not.toMatch(/^import\s+(?!type\b)/m);
      });
    });
  }

  describe('the leak guard bites (synthetic trees)', () => {
    const barrel = "export type { Moved } from './types/x';\nexport interface Other { o: number }\n";
    const moved = new Set(['Moved']);

    it('reports a production import of a moved symbol from the barrel, alias or relative', () => {
      const leaks = findBarrelLeaks({
        'src/core/types.ts': barrel,
        'src/systems/a.ts': "import type { Moved } from '@/core/types';\nexport const a: Moved | null = null;",
        'src/ui/b.ts': "import type { Other, Moved } from '../core/types';\nexport const b: [Other, Moved] | null = null;",
      }, moved);
      expect(leaks).toEqual([
        'src/systems/a imports Moved from the barrel',
        'src/ui/b imports Moved from the barrel',
      ]);
    });

    it('allows the leaf import, unrelated barrel imports and test files', () => {
      const leaks = findBarrelLeaks({
        'src/core/types.ts': barrel,
        'src/core/types/x.ts': 'export interface Moved { m: number }',
        'src/systems/a.ts': "import type { Moved } from '@/core/types/x';\nimport type { Other } from '@/core/types';\nexport const a: [Moved, Other] | null = null;",
        'tests/a.test.ts': "import type { Moved } from '@/core/types';\nexport const t: Moved | null = null;",
      }, moved);
      expect(leaks).toEqual([]);
    });
  });
});
