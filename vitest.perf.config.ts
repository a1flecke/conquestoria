import { defineConfig, type ViteUserConfig } from 'vitest/config';
import baseConfigFactory from './vite.config';

/**
 * #1007 — the ONLY config that can see `tests/perf/report/**`.
 *
 * The default `vite.config.ts` excludes that directory unconditionally, so the
 * local wall-clock performance reporter is invisible to `yarn test`,
 * `test:fast`, `test:slow`, `verify:push`, the pre-push hooks and CI — by
 * construction. This config re-opens it and is used by `scripts/run-perf-report.sh`
 * (`yarn perf:report`) and nothing else. `tests/scripts/perf-isolation.test.ts`
 * guards both halves.
 *
 * NOTE: the #1007 ALGORITHMIC regression budgets (`tests/perf/algorithmic-budgets.test.ts`,
 * `tests/perf/perf-probe.test.ts`) are machine-independent integer-count assertions
 * and DO run in the ordinary suite (slow / fast tier). Only the wall-clock reporter
 * under `tests/perf/report/**` is excluded from the default config.
 */
export default defineConfig(configEnv => {
  const base = (baseConfigFactory as (env: typeof configEnv) => ViteUserConfig)(configEnv);
  return {
    ...base,
    test: {
      ...base.test,
      include: ['perf/report/**/*.test.ts'],
      exclude: ['e2e/**'],
    },
  };
});
