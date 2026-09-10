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
      // Two directories are explicit-run only and excluded here UNCONDITIONALLY so
      // `yarn test` / `test:fast` / `test:slow` / `verify:push` / the pre-push hooks
      // / CI can never discover them:
      //  - `simulation/long-horizon/**` — the #1005 heavyweight AI campaign suite
      //    (300-500 turn deterministic campaigns), via `vitest.long-horizon.config.ts`
      //    (`yarn test:ai-long`). Guarded by `tests/scripts/ai-long-horizon-isolation.test.ts`.
      //  - `perf/report/**` — the #1007 local wall-clock performance reporter, via
      //    `vitest.perf.config.ts` (`yarn perf:report`). Guarded by
      //    `tests/scripts/perf-isolation.test.ts`. (The #1007 ALGORITHMIC budgets —
      //    `tests/perf/algorithmic-budgets.test.ts` — DO run in the ordinary suite,
      //    slow tier; only the wall-clock reporter is excluded.)
      exclude: ['e2e/**', 'simulation/long-horizon/**', 'perf/report/**'],
      // Vitest only manages workers inside one process. A local 25% budget leaves
      // headroom for up to four concurrent worktree runs; CI is isolated and can use
      // the available parallelism. VITEST_MAX_WORKERS is Vitest's official override.
      maxWorkers: process.env.VITEST_MAX_WORKERS ?? (process.env.CI ? '100%' : '25%'),
    },
  };
});
