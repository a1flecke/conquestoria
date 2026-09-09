import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isTauri = mode === 'tauri' || process.env.TAURI_ENV_PLATFORM !== undefined;
  const isVitest = process.env.VITEST !== undefined;
  const cacheDir = isVitest
    ? process.env.CONQUESTORIA_VITEST_CACHE_DIR ?? resolve(__dirname, '.vite/vitest')
    : resolve(__dirname, '.vite/vite');
  const plugins: Plugin[] = isTauri
    ? [{
      name: 'conquestoria-tauri-index-html',
      transformIndexHtml(html) {
        return html.replace(/\s*<link rel="manifest" href="\/conquestoria\/manifest\.json" \/>/, '');
      },
    }]
    : [];

  return {
    base: isTauri ? './' : '/conquestoria/',
    define: {
      'import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION': JSON.stringify(
        isTauri ? 'tauri' : 'web',
      ),
    },
    plugins,
    cacheDir,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'node',
      dir: resolve(__dirname, 'tests'),
      // `simulation/long-horizon/**` is the #1005 heavyweight AI campaign suite:
      // 300-500 turn deterministic campaigns, minutes per scenario. It is
      // explicit-run only (`yarn test:ai-long`) via `vitest.long-horizon.config.ts`,
      // and excluded here UNCONDITIONALLY so `yarn test` / `test:fast` / `test:slow`
      // / `verify:push` / the pre-push hooks / CI can never discover it. Guarded by
      // `tests/scripts/ai-long-horizon-isolation.test.ts`.
      exclude: ['e2e/**', 'simulation/long-horizon/**'],
      // Vitest only manages workers inside one process. A local 25% budget leaves
      // headroom for up to four concurrent worktree runs; CI is isolated and can use
      // the available parallelism. VITEST_MAX_WORKERS is Vitest's official override.
      maxWorkers: process.env.VITEST_MAX_WORKERS ?? (process.env.CI ? '100%' : '25%'),
    },
  };
});
