import { describe, expect, it } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import viteConfig from '../../vite.config';

function resolveConfig(mode: string, tauriPlatform?: string): UserConfig {
  if (typeof viteConfig !== 'function') {
    return viteConfig as UserConfig;
  }

  const previousPlatform = process.env.TAURI_ENV_PLATFORM;
  if (tauriPlatform === undefined) {
    delete process.env.TAURI_ENV_PLATFORM;
  } else {
    process.env.TAURI_ENV_PLATFORM = tauriPlatform;
  }

  try {
    return viteConfig({
      mode,
      command: mode === 'development' ? 'serve' : 'build',
      isSsrBuild: false,
      isPreview: false,
    }) as UserConfig;
  } finally {
    if (previousPlatform === undefined) {
      delete process.env.TAURI_ENV_PLATFORM;
    } else {
      process.env.TAURI_ENV_PLATFORM = previousPlatform;
    }
  }
}

function resolveInjectedDistribution(mode: string, tauriPlatform?: string): 'web' | 'tauri' {
  const define = resolveConfig(mode, tauriPlatform).define as Record<string, string> | undefined;
  const raw = define?.['import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION'];
  if (!raw) {
    throw new Error('VITE_CONQUESTORIA_DISTRIBUTION is not injected');
  }
  return JSON.parse(raw) as 'web' | 'tauri';
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

  it('injects the web distribution for normal builds', () => {
    expect(resolveInjectedDistribution('production')).toBe('web');
  });

  it('injects the Tauri distribution for explicit Tauri builds', () => {
    expect(resolveInjectedDistribution('tauri')).toBe('tauri');
  });

  it('injects the Tauri distribution when the Tauri CLI starts development', () => {
    expect(resolveInjectedDistribution('development', 'darwin')).toBe('tauri');
  });

  it('keeps the PWA manifest only for web builds', async () => {
    const html = '<head><link rel="manifest" href="/conquestoria/manifest.json" /></head>';

    await expect(transformIndexHtml('production', html)).resolves.toContain('/conquestoria/manifest.json');
    await expect(transformIndexHtml('tauri', html)).resolves.not.toContain('/conquestoria/manifest.json');
  });
});
