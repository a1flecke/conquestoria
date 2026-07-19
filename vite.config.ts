import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

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
      // Pin Vite's dependency optimizer cache to the main worktree's node_modules so
      // secondary worktrees (which have no node_modules/) can find it. Without this,
      // `vitest --root /worktree/path` looks for the cache inside the worktree and
      // falls back to re-optimizing deps on every run. Note: esbuild's TypeScript
      // transform time (~17s cumulative) is inherent to 300+ test files and 8 workers
      // and is NOT reduced by this cache — that time is fixed by the suite size.
      cacheDir: resolve(__dirname, 'node_modules/.vite/vitest'),
      // Cap worker count well below the machine's core count (#608). This dev machine
      // routinely runs several Claude Code worktree agents in parallel, each invoking
      // `yarn test` independently; with the default pool sizing (~8 workers each on a
      // 10-core box), 2-3 concurrent runs oversubscribe CPU 2-3x and inflate individual
      // test durations past their timeout budgets (observed: a 548s/16-timeout run with
      // heavy contention, still 5 timeouts at ~213s with just one other partial run
      // active). Capping to 4 leaves headroom for another agent's run without giving up
      // meaningful parallelism for a solo run.
      maxWorkers: 4,
    },
  };
});
