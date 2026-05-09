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
    },
  };
});
