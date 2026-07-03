import { describe, it, expect } from 'vitest';
import { applyCacheVersion } from '../../scripts/version-sw-cache.mjs';

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
