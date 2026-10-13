import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEOGRAPHIC_MAP_SCRIPTS } from '@/systems/geo-map-data';

// #1456: the bulk geography is a JSON asset that only geo-map-data.ts references. A static import of one of
// the files (or a module that re-exports them) would pull ~1.24 MB of raw data back into the entry chunk and
// onto every player's start screen, silently undoing the change.

const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'geo-data' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('geographic bulk data boundary (#1456)', () => {
  const files = sourceFiles(SRC).map(path => ({
    path: relative(process.cwd(), path),
    text: withoutComments(readFileSync(path, 'utf8')),
  }));

  it('no production module other than the asset fetcher refers to the data files', () => {
    const offenders = files
      .filter(file => file.path !== 'src/systems/geo-map-asset-fetcher.ts')
      .filter(file => /geo-data\/|-map\.json/.test(file.text))
      .map(file => file.path);
    expect(offenders).toEqual([]);
  });

  it('the asset fetcher names each file with a literal new URL(...) so the bundler emits it as a hashed asset', () => {
    const loader = files.find(file => file.path === 'src/systems/geo-map-asset-fetcher.ts')!.text;
    for (const script of GEOGRAPHIC_MAP_SCRIPTS) {
      expect(loader).toContain(`new URL('./geo-data/${script}-map.json', import.meta.url)`);
    }
    expect(loader).not.toMatch(/import\s+[^;]*from\s+['"][^'"]*geo-data/);
    expect(loader).not.toMatch(/import\(\s*['"][^'"]*geo-data/);
  });

  it('the core loader holds no import.meta, so Node tooling can load it as CommonJS', () => {
    const core = files.find(file => file.path === 'src/systems/geo-map-data.ts')!.text;
    expect(core).not.toMatch(/import\.meta/);
  });

  it('every geographic script has a data file on disk', () => {
    for (const script of GEOGRAPHIC_MAP_SCRIPTS) {
      expect(statSync(resolve(SRC, `systems/geo-data/${script}-map.json`)).size).toBeGreaterThan(100_000);
    }
  });
});
