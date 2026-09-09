import { defineConfig, type ViteUserConfig } from 'vitest/config';
import baseConfigFactory from './vite.config';

/**
 * #1005 — the ONLY config that can see `tests/simulation/long-horizon/**`.
 *
 * The default `vite.config.ts` excludes that directory unconditionally, so the
 * long-horizon campaign suite is invisible to `yarn test`, `test:fast`,
 * `test:slow`, `verify:push`, the pre-push hooks and CI — by construction, not
 * by a list somebody has to remember to update. This config re-opens it and is
 * used by `scripts/run-ai-long-horizon.sh` (`yarn test:ai-long`) and nothing
 * else. `tests/scripts/ai-long-horizon-isolation.test.ts` guards both halves.
 */
export default defineConfig(configEnv => {
  const base = (baseConfigFactory as (env: typeof configEnv) => ViteUserConfig)(configEnv);
  return {
    ...base,
    test: {
      ...base.test,
      include: ['simulation/long-horizon/**/*.test.ts'],
      exclude: ['e2e/**'],
    },
  };
});
