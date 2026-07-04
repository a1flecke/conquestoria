#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function applyCacheVersion(swSource, version) {
  return swSource.replace(
    /const CACHE_NAME = '[^']+';/,
    `const CACHE_NAME = 'conquestoria-${version}';`,
  );
}

function main() {
  const swPath = resolve(process.cwd(), 'dist/sw.js');
  const source = readFileSync(swPath, 'utf-8');
  const version = process.env.CONQUESTORIA_BUILD_VERSION ?? Date.now().toString();
  writeFileSync(swPath, applyCacheVersion(source, version));
  console.log(`sw.js CACHE_NAME stamped: conquestoria-${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
