import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';
import viteConfig from '../../vite.config';

function resolveConfig(mode: string): UserConfig {
  if (typeof viteConfig === 'function') {
    return viteConfig({
      mode,
      command: 'build',
      isSsrBuild: false,
      isPreview: false,
    }) as UserConfig;
  }
  return viteConfig as UserConfig;
}

describe('vite distribution config', () => {
  it('keeps the GitHub Pages base for normal web builds', () => {
    expect(resolveConfig('production').base).toBe('/conquestoria/');
  });

  it('uses relative assets for Tauri builds', () => {
    expect(resolveConfig('tauri').base).toBe('./');
  });
});
