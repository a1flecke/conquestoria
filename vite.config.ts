import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

const configuredVitestWorkers = Number(
  process.env.CONQUESTORIA_VITEST_MAX_WORKERS ?? (process.env.CI ? '4' : '2'),
);
const vitestMaxWorkers = Number.isInteger(configuredVitestWorkers) && configuredVitestWorkers > 0
  ? configuredVitestWorkers
  : 2;

export default defineConfig(({ mode }) => {
  const isTauri = mode === 'tauri' || process.env.TAURI_ENV_PLATFORM !== undefined;
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
      exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**', 'tests/e2e/**'],
      // Each worktree gets a separate optimizer cache through run-with-mise.sh, so
      // concurrent test runs cannot corrupt or invalidate one shared cache.
      cacheDir: process.env.CONQUESTORIA_VITEST_CACHE_DIR ?? resolve(__dirname, '.vite/vitest'),
      // Local agents share one machine. Two workers per run leaves room for several
      // focused verifications; isolated CI runners use four by default.
      maxWorkers: vitestMaxWorkers,
    },
  };
});
