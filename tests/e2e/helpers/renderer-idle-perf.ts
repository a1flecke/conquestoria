import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type CDPSession, type Page, type TestInfo } from '@playwright/test';

/**
 * #1439 phase 1: opt-in renderer idle-cost diagnostic.
 *
 * Measures the campaign mount duration, the idle main-thread TaskDuration over
 * a fixed observation window (Chrome DevTools Protocol), and the canvas redraw
 * count during that same window. The renderer currently repaints unconditionally
 * on every animation frame (see src/renderer/render-loop.ts tick()), so an idle
 * crowded campaign still costs a full repaint per frame; a later
 * invalidation-aware scheduler must make the redraw count (and ideally
 * TaskDuration) fall while keeping the mount and all visual state correct.
 *
 * This module changes nothing about production rendering: the redraw counter is
 * a prototype patch installed by the test context (the same technique
 * tests/e2e/issue-365-map-presentation.spec.ts uses for fillText), and the CPU
 * metrics come from CDP's Performance domain.
 */

const FIXTURE_PATH = join(__dirname, '..', '..', 'fixtures', 'issue-365-crowded-map-save.json');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

/** Warm-up after mount before the measurement window: lets sprite loads, the
 * first paints, and any post-mount one-shot work settle so the idle window
 * describes steady state, not startup. */
export const WARM_UP_MS = 1_000;
/** Fixed idle observation window. Deliberately fixed so before/after runs are
 * comparable; it is a measurement parameter, never a test timeout. */
export const OBSERVATION_MS = 5_000;

export interface RendererIdleMeasurement {
  scenario: 'reduced-motion' | 'motion-allowed';
  reducedMotion: 'reduce' | 'no-preference';
  /** Wall-clock navigation-to-interactive span on the page's own clock. */
  mountDurationMs: number;
  warmUpMs: number;
  observationMs: number;
  /** CDP Performance-domain metric deltas over the observation window (ms). */
  taskDurationMsDelta: number;
  scriptDurationMsDelta: number;
  layoutDurationMsDelta: number;
  recalcStyleDurationMsDelta: number;
  layoutCountDelta: number;
  recalcStyleCountDelta: number;
  /** Canvas repaints on #game-canvas during the observation window. */
  redrawCountDelta: number;
  /** Of those, paints clipped to the ambient animation region (the rest repainted the whole canvas). */
  ambientRedrawCountDelta: number;
  /** Derived convenience figure: repaints per observation second. */
  redrawsPerSecond: number;
  jsHeapUsedMb: number;
}

interface PerfMetricSample { metrics: Array<{ name: string; value: number }> }

async function readPerfMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const sample = await cdp.send('Performance.getMetrics') as PerfMetricSample;
  const values: Record<string, number> = {};
  for (const metric of sample.metrics) values[metric.name] = metric.value;
  return values;
}

function metricDelta(before: Record<string, number>, after: Record<string, number>, name: string): number {
  return (after[name] ?? 0) - (before[name] ?? 0);
}

/**
 * Installs the crowded-map autosave and the canvas redraw counter before any
 * application code runs. The counter only counts `clearRect` calls on
 * #game-canvas: RenderLoop.render() issues exactly one clearRect per frame
 * (the only clearRect call site in src/), so the delta is the frame count.
 *
 * `injectRoads` marks every land tile as carrying a road before the save is written, so the
 * linework (#1439 phase 7) tests run against a fixture with meaningful roads and rivers inside and
 * across the animated region. The crowded fixture already has rivers; this adds the roads it lacks
 * without duplicating the 340 KB archive.
 */
export async function installIdleCampaignFixture(
  page: Page,
  options: { injectRoads?: boolean } = {},
): Promise<void> {
  await page.addInitScript((args: { fixtureText: string; injectRoads: boolean }) => {
    const withInjectedRoads = (text: string): string => {
      const save = JSON.parse(text) as { map?: { tiles?: Record<string, { terrain?: string; hasRoad?: boolean }> } };
      for (const tile of Object.values(save.map?.tiles ?? {})) {
        if (tile.terrain && tile.terrain !== 'ocean' && tile.terrain !== 'coast') tile.hasRoad = true;
      }
      return JSON.stringify(save);
    };
    localStorage.setItem(
      'conquestoria-autosave',
      args.injectRoads ? withInjectedRoads(args.fixtureText) : args.fixtureText,
    );
    const counter = { count: 0, ambient: 0 };
    (window as typeof window & { __issue1439RendererRedraws?: { count: number; ambient: number } }).__issue1439RendererRedraws = counter;
    // Sprite images load through a bounded queue (#1439 phase 4), so a quiet canvas does not yet mean
    // every asset has landed. Counting sprite blob URLs lets a settle wait require that every started
    // load finished (a late asset legitimately repaints the whole canvas).
    const blobs = { created: 0, revoked: 0 };
    (window as typeof window & { __spriteBlobs?: { created: number; revoked: number } }).__spriteBlobs = blobs;
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => { blobs.created += 1; return createObjectURL(obj); };
    URL.revokeObjectURL = (url: string) => { blobs.revoked += 1; revokeObjectURL(url); };
    const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
    // An ambient-only paint (#1439 phase 3) clips the unchanged pipeline to the animated region, so
    // its clearRect directly follows the clip. A full paint's first call follows the previous
    // paint's last save/restore/path call, never a clip (a clip is always followed by drawing and a
    // restore). `lastCall` tracks exactly those structural calls.
    let lastCall = '';
    for (const name of ['save', 'restore', 'beginPath', 'clip'] as const) {
      const original = CanvasRenderingContext2D.prototype[name] as (...args: unknown[]) => void;
      (CanvasRenderingContext2D.prototype as unknown as Record<string, unknown>)[name] = function patched(this: CanvasRenderingContext2D, ...args: unknown[]) {
        if (this.canvas?.id === 'game-canvas') lastCall = name;
        return original.apply(this, args);
      };
    }
    CanvasRenderingContext2D.prototype.clearRect = function patchedClearRect(x: number, y: number, w: number, h: number) {
      if (this.canvas?.id === 'game-canvas') {
        counter.count += 1;
        if (lastCall === 'clip') counter.ambient += 1;
        lastCall = 'clearRect';
      }
      return originalClearRect.call(this, x, y, w, h);
    };
  }, { fixtureText: FIXTURE_TEXT, injectRoads: options.injectRoads ?? false });
}

/** The existing Continue Campaign workflow from the start surface into a live
 * crowded campaign (mirrors tests/e2e/issue-365-map-presentation.spec.ts). */
export async function continueCrowdedCampaign(page: Page): Promise<void> {
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  await expect(page.getByRole('dialog', { name: 'Choose Opponent Challenge' })).toBeVisible();
  await page.locator(
    '[data-opponent-challenge-selector="migration"] [data-challenge="standard"]',
  ).click();
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  await expect(continueButton).toBeHidden();
  const requiredChoices = page.locator('#required-choice-panel');
  await expect(requiredChoices).toBeVisible();
  await requiredChoices.locator('section').first().getByRole('button').first().click();
  await expect(requiredChoices).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
  // The DOM sprite overlay mounts with the renderer; wait for it plus the first
  // paint so the mount span ends at "campaign is interactive", not "canvas exists".
  await expect(page.locator('#sprite-overlay')).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __issue1439RendererRedraws?: { count: number; ambient: number } }).__issue1439RendererRedraws?.count ?? 0))
    .toBeGreaterThan(0);
}

/** Sprite image loads started / still outstanding, from the counters installed by the fixture. */
export async function readSpriteLoads(page: Page): Promise<{ created: number; outstanding: number }> {
  return page.evaluate(() => {
    const blobs = (window as typeof window & { __spriteBlobs?: { created: number; revoked: number } }).__spriteBlobs
      ?? { created: 0, revoked: 0 };
    return { created: blobs.created, outstanding: blobs.created - blobs.revoked };
  });
}

export async function readAmbientRedrawCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as typeof window & { __issue1439RendererRedraws?: { count: number; ambient: number } }).__issue1439RendererRedraws?.ambient ?? 0);
}

async function readRedrawCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as typeof window & { __issue1439RendererRedraws?: { count: number; ambient: number } }).__issue1439RendererRedraws?.count ?? 0);
}

/**
 * Full setup -> warm-up -> measurement lifecycle. Returns a machine-readable
 * record; the caller decides what (if anything) to assert. There are no
 * performance thresholds here on purpose -- this diagnostic exists to produce
 * comparable numbers for issue #1439, not to gate CI.
 */
export async function measureIdleCampaign(
  page: Page,
  options: { reducedMotion: 'reduce' | 'no-preference'; testInfo: TestInfo },
): Promise<RendererIdleMeasurement> {
  const { reducedMotion, testInfo } = options;
  const scenario = reducedMotion === 'reduce' ? 'reduced-motion' : 'motion-allowed';

  await page.emulateMedia({ reducedMotion });
  await installIdleCampaignFixture(page);
  await continueCrowdedCampaign(page);

  const mountDurationMs = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    return performance.now() - (navigation?.startTime ?? 0);
  });

  // Warm-up: settle sprite loads and one-shot post-mount work.
  await page.waitForTimeout(WARM_UP_MS);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metricsBefore = await readPerfMetrics(cdp);
  const redrawsBefore = await readRedrawCount(page);
  const ambientBefore = await readAmbientRedrawCount(page);

  await page.waitForTimeout(OBSERVATION_MS); // pure idle: no input, no interaction

  const redrawsAfter = await readRedrawCount(page);
  const ambientAfter = await readAmbientRedrawCount(page);
  const metricsAfter = await readPerfMetrics(cdp);
  await cdp.detach();

  const measurement: RendererIdleMeasurement = {
    scenario,
    reducedMotion,
    mountDurationMs: Math.round(mountDurationMs * 100) / 100,
    warmUpMs: WARM_UP_MS,
    observationMs: OBSERVATION_MS,
    taskDurationMsDelta: Math.round(metricDelta(metricsBefore, metricsAfter, 'TaskDuration') * 100_000) / 100,
    scriptDurationMsDelta: Math.round(metricDelta(metricsBefore, metricsAfter, 'ScriptDuration') * 100_000) / 100,
    layoutDurationMsDelta: Math.round(metricDelta(metricsBefore, metricsAfter, 'LayoutDuration') * 100_000) / 100,
    recalcStyleDurationMsDelta: Math.round(metricDelta(metricsBefore, metricsAfter, 'RecalcStyleDuration') * 100_000) / 100,
    layoutCountDelta: metricDelta(metricsBefore, metricsAfter, 'LayoutCount'),
    recalcStyleCountDelta: metricDelta(metricsBefore, metricsAfter, 'RecalcStyleCount'),
    redrawCountDelta: redrawsAfter - redrawsBefore,
    ambientRedrawCountDelta: ambientAfter - ambientBefore,
    redrawsPerSecond: Math.round(((redrawsAfter - redrawsBefore) / (OBSERVATION_MS / 1000)) * 100) / 100,
    jsHeapUsedMb: Math.round(((metricsAfter.JSHeapUsedSize ?? 0) / (1024 * 1024)) * 100) / 100,
  };

  const serialized = JSON.stringify(measurement, null, 2);
  await testInfo.attach('renderer-idle-measurement', {
    body: serialized,
    contentType: 'application/json',
  });
  // Stable machine-readable line for local runs and CI log scraping.
  console.log(`[renderer-perf] ${JSON.stringify(measurement)}`);

  return measurement;
}

declare global {
  interface Window {
    __issue1439RendererRedraws?: { count: number; ambient: number };
  }
}
