import { expect, test } from '@playwright/test';
import { measureIdleCampaign } from './helpers/renderer-idle-perf';

/**
 * #1439 phase 1 renderer idle-cost diagnostic. This spec is OPT-IN: it is
 * excluded from default web-smoke discovery (playwright.config.ts testIgnore,
 * flipped by CONQUESTORIA_PERF_DIAGNOSTICS=1) and carries no performance
 * thresholds. Run it explicitly with:
 *
 *   yarn test:web-smoke:perf
 *
 * or for one variant:
 *
 *   CONQUESTORIA_PERF_DIAGNOSTICS=1 playwright test tests/e2e/issue-1439-idle-campaign.perf-diagnostic.spec.ts --grep "reduced motion"
 *
 * It mounts the existing crowded-map fixture through the real Continue
 * Campaign workflow, then measures the idle main-thread TaskDuration (CDP) and
 * the canvas redraw count over a fixed window. The assertions below are sanity
 * checks that the measurement is well-formed -- the numbers themselves are the
 * deliverable, compared before/after the phase-2 scheduler work.
 */

test('#1439 idle campaign cost under the default reduced-motion configuration', async ({ page }, testInfo) => {
  // The crowded-map mount is the same slow fixture issue-365 uses.
  test.slow();
  const measurement = await measureIdleCampaign(page, { reducedMotion: 'reduce', testInfo });

  expect(measurement.mountDurationMs).toBeGreaterThan(0);
  expect(measurement.redrawCountDelta).toBeGreaterThanOrEqual(0); // idle is now allowed to be 0 (#1439 phase 2)
  expect(measurement.taskDurationMsDelta).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(measurement.redrawsPerSecond)).toBe(true);
  await testInfo.attach('measurement-summary', {
    body: `${measurement.scenario}: mount=${measurement.mountDurationMs}ms redraws=${measurement.redrawCountDelta}/${measurement.observationMs}ms taskDuration=${measurement.taskDurationMsDelta}ms`,
    contentType: 'text/plain',
  });
});

test('#1439 idle campaign cost with motion allowed', async ({ page }, testInfo) => {
  // Same slow fixture rationale as the reduced-motion variant.
  test.slow();
  const measurement = await measureIdleCampaign(page, { reducedMotion: 'no-preference', testInfo });

  expect(measurement.mountDurationMs).toBeGreaterThan(0);
  expect(measurement.redrawCountDelta).toBeGreaterThanOrEqual(0); // idle is now allowed to be 0 (#1439 phase 2)
  expect(measurement.taskDurationMsDelta).toBeGreaterThanOrEqual(0);
  await testInfo.attach('measurement-summary', {
    body: `${measurement.scenario}: mount=${measurement.mountDurationMs}ms redraws=${measurement.redrawCountDelta}/${measurement.observationMs}ms taskDuration=${measurement.taskDurationMsDelta}ms`,
    contentType: 'text/plain',
  });
});
