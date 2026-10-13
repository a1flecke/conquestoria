import { describe, it, expect } from 'vitest';
import { applyCacheVersion, findGeoMapAssets, precacheGeoMapAssets } from '../../scripts/version-sw-cache.mjs';

describe('applyCacheVersion', () => {
  it('replaces the CACHE_NAME literal with a build-specific version', () => {
    const source = "const CACHE_NAME = 'conquestoria-dev';\nconst PRECACHE_URLS = [];\n";
    const result = applyCacheVersion(source, '1730000000000');
    expect(result).toContain("const CACHE_NAME = 'conquestoria-1730000000000';");
    expect(result).not.toContain("'conquestoria-dev'");
  });

  it('only touches the CACHE_NAME line, leaving the rest of the file untouched', () => {
    const source = "const CACHE_NAME = 'conquestoria-dev';\nconst PRECACHE_URLS = ['/conquestoria/'];\n";
    const result = applyCacheVersion(source, 'abc123');
    expect(result).toContain("const PRECACHE_URLS = ['/conquestoria/'];");
  });

  it('is idempotent-safe: replacing an already-versioned CACHE_NAME still works', () => {
    const source = "const CACHE_NAME = 'conquestoria-999';\n";
    const result = applyCacheVersion(source, '1000');
    expect(result).toContain("const CACHE_NAME = 'conquestoria-1000';");
  });
});

// #1456: the Earth / Old World / New World data is a separately fetched JSON file, so a player who has never picked
// that map online would have nothing cached for it offline. The service worker precaches the hashed files.
describe('geographic map data is precached for offline play (#1456)', () => {
  const assets = [
    'index-AbC123.js', 'earth-map-BZePXCF6.json', 'old-world-map-S_fh-Ghu.json',
    'new-world-map-DlCe6-uy.json', 'earth-start-positions-Q1.js', 'index-AbC123.css',
  ];

  it('finds exactly the three emitted data files and ignores other assets such as the start-position module', () => {
    expect(findGeoMapAssets(assets)).toEqual([
      '/conquestoria/assets/earth-map-BZePXCF6.json',
      '/conquestoria/assets/new-world-map-DlCe6-uy.json',
      '/conquestoria/assets/old-world-map-S_fh-Ghu.json',
    ]);
  });

  it('fails the build when a data file is missing, instead of silently shipping a broken offline start', () => {
    expect(() => findGeoMapAssets(['index-AbC123.js', 'earth-map-BZePXCF6.json'])).toThrow(/old-world, new-world/);
  });

  it('adds the chunk URLs to the service worker precache list and nothing else', () => {
    const source = "const CACHE_NAME = 'x';\nconst PRECACHE_URLS = [\n  '/conquestoria/',\n];\n";
    const result = precacheGeoMapAssets(source, findGeoMapAssets(assets));
    expect(result).toContain("'/conquestoria/assets/earth-map-BZePXCF6.json',");
    expect(result).toContain("'/conquestoria/',");
    expect(result.match(/-map-/g)).toHaveLength(3);
  });

  it('refuses a service worker without a PRECACHE_URLS list', () => {
    expect(() => precacheGeoMapAssets("const CACHE_NAME = 'x';", findGeoMapAssets(assets))).toThrow(/PRECACHE_URLS/);
  });
});
