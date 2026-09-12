import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const CLASSIFIER = resolve(REPO_ROOT, 'scripts/desktop-build-inputs.mjs');

function classify(input: string) {
  return spawnSync(process.execPath, [CLASSIFIER], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
  });
}

describe('desktop build input classifier', () => {
  it.each([
    'src-tauri/tauri.conf.json',
    'src/platform/desktop-capabilities.ts',
    'public/icons/icon.png',
    'index.html',
    'vite.config.ts',
    'package.json',
    'yarn.lock',
    '.yarnrc.yml',
    '.yarn/releases/yarn-4.6.0.cjs',
    'mise.toml',
    'scripts/check-tauri-macos-artifacts.mjs',
  ])('requires macOS packaging for %s', path => {
    const result = classify(`${path}\n`);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('true');
  });

  it.each([
    '.github/workflows/deploy.yml',
    'src/systems/city-system.ts',
    'src/ui/city-panel.ts',
    'tests/systems/city-system.test.ts',
    'docs/superpowers/plans/example.md',
    'scripts/build-run-macos-app.sh',
  ])('does not require macOS packaging for %s', path => {
    const result = classify(`${path}\n`);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('false');
  });

  it('requires macOS packaging when any path in a mixed list is risky', () => {
    const result = classify('docs/readme.md\nsrc-tauri/Cargo.toml\n');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('true');
  });

  it('does not require macOS packaging for an empty list', () => {
    const result = classify('');

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('false');
  });
});
