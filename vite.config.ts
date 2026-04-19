import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/conquestoria/',
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
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**'],
  },
});
