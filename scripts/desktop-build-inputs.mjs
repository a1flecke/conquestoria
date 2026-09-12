import { readFileSync } from 'node:fs';

function isDesktopBuildInput(path) {
  return path.startsWith('src-tauri/') ||
    path.startsWith('src/platform/') ||
    path.startsWith('public/') ||
    path === 'index.html' ||
    path === 'vite.config.ts' ||
    path === 'package.json' ||
    path === 'yarn.lock' ||
    path === '.yarnrc.yml' ||
    path.startsWith('.yarn/') ||
    path === 'mise.toml' ||
    path === 'scripts/check-tauri-macos-artifacts.mjs';
}

const paths = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);

process.stdout.write(`${paths.some(isDesktopBuildInput)}\n`);
