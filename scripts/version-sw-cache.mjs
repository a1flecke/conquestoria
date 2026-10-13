#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function applyCacheVersion(swSource, version) {
  return swSource.replace(
    /const CACHE_NAME = '[^']+';/,
    `const CACHE_NAME = 'conquestoria-${version}';`,
  );
}

const GEO_MAP_SCRIPTS = ['earth', 'old-world', 'new-world'];

/**
 * The geographic tile/river data is one JSON asset per map, fetched on demand (#1456). The service worker only
 * runtime-caches what the page has fetched, so without this a map the player never opened online would be
 * missing offline. Throws when an expected asset is not in the build, so a rename of the data files (which
 * changes the emitted file names) breaks the build instead of silently breaking offline geographic starts.
 */
export function findGeoMapAssets(assetFileNames) {
  const found = GEO_MAP_SCRIPTS.map(script => {
    const pattern = new RegExp(`^${script}-map-[A-Za-z0-9_-]+\\.json$`);
    return assetFileNames.find(name => pattern.test(name));
  });
  const missing = GEO_MAP_SCRIPTS.filter((script, index) => !found[index]);
  if (missing.length > 0) {
    throw new Error(`Geographic map data asset(s) not found in dist/assets: ${missing.join(', ')}. Offline geographic starts would break.`);
  }
  return found.map(name => `/conquestoria/assets/${name}`).sort();
}

export function precacheGeoMapAssets(swSource, assetUrls) {
  const marker = 'const PRECACHE_URLS = [';
  if (!swSource.includes(marker)) {
    throw new Error('sw.js has no PRECACHE_URLS list to extend.');
  }
  const entries = assetUrls.map(url => `\n  '${url}',`).join('');
  return swSource.replace(
    marker,
    `${marker}\n  // #1456: on-demand geographic map data, precached for offline starts.${entries}`,
  );
}

function main() {
  const swPath = resolve(process.cwd(), 'dist/sw.js');
  const source = readFileSync(swPath, 'utf-8');
  const version = process.env.CONQUESTORIA_BUILD_VERSION ?? Date.now().toString();
  const assets = findGeoMapAssets(readdirSync(resolve(process.cwd(), 'dist/assets')));
  writeFileSync(swPath, precacheGeoMapAssets(applyCacheVersion(source, version), assets));
  console.log(`sw.js CACHE_NAME stamped: conquestoria-${version}; precached ${assets.length} geographic map assets`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
