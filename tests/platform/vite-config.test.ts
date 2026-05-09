import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
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

async function transformIndexHtml(mode: string, html: string): Promise<string> {
  const plugins = resolveConfig(mode).plugins;
  const flatPlugins = (Array.isArray(plugins) ? plugins.flat() : [plugins]).filter(Boolean) as Plugin[];
  let transformed = html;
  for (const plugin of flatPlugins) {
    if (typeof plugin.transformIndexHtml === 'function') {
      const result = await plugin.transformIndexHtml.call({} as never, transformed, {} as never);
      if (typeof result === 'string') {
        transformed = result;
      }
    }
  }
  return transformed;
}

describe('vite distribution config', () => {
  it('keeps the GitHub Pages base for normal web builds', () => {
    expect(resolveConfig('production').base).toBe('/conquestoria/');
  });

  it('uses relative assets for Tauri builds', () => {
    expect(resolveConfig('tauri').base).toBe('./');
  });

  it('keeps the PWA manifest only for web builds', async () => {
    const html = '<head><link rel="manifest" href="/conquestoria/manifest.json" /></head>';

    await expect(transformIndexHtml('production', html)).resolves.toContain('/conquestoria/manifest.json');
    await expect(transformIndexHtml('tauri', html)).resolves.not.toContain('/conquestoria/manifest.json');
  });
});
