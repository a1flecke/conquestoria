import { expect, test, type Page } from '@playwright/test';
import { continueCrowdedCampaign, installIdleCampaignFixture } from './helpers/renderer-idle-perf';

/**
 * #1439 phase 3: with motion allowed and an animated wonder on screen, frames kept alive only by
 * that ambient animation repaint just the animated region (the unchanged pipeline, clipped), never
 * the whole canvas -- and they must stay pixel-identical to a full paint at the same instant.
 * Deterministic counts and pixels only; no CPU or timing thresholds.
 */
interface Counter { count: number; ambient: number }
type CounterWindow = typeof window & { __issue1439RendererRedraws?: Counter; __frozenNowMs?: number };

async function paints(page: Page): Promise<{ full: number; ambient: number }> {
  return page.evaluate(() => {
    const c = (window as CounterWindow).__issue1439RendererRedraws ?? { count: 0, ambient: 0 };
    return { full: c.count - c.ambient, ambient: c.ambient };
  });
}

async function settledToAmbient(page: Page): Promise<void> {
  // Initial paints and sprite/asset loads are full; wait until frames are only ambient.
  let last = await paints(page);
  let quietSince = Date.now();
  await expect.poll(async () => {
    const now = await paints(page);
    if (now.full !== last.full) { last = now; quietSince = Date.now(); }
    return Date.now() - quietSince > 800 && now.ambient > last.ambient;
  }, { timeout: 20_000, intervals: [150] }).toBe(true);
}

test('a visible animated wonder keeps animating through ambient-region paints only, and input still repaints fully', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installIdleCampaignFixture(page);
  await continueCrowdedCampaign(page);
  await settledToAmbient(page);

  const before = await paints(page);
  await page.waitForTimeout(2_000);
  const idle = await paints(page);
  expect(idle.full, 'idle animation must not repaint the whole canvas').toBe(before.full);
  expect(idle.ambient - before.ambient, 'the wonder must keep animating').toBeGreaterThan(30);

  const box = (await page.locator('#game-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await paints(page)).full, { message: 'zoom repaints the whole canvas' })
    .toBeGreaterThan(idle.full);
  await settledToAmbient(page);
});

test('an ambient-region paint is pixel-identical to a full paint at the same instant', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installIdleCampaignFixture(page);
  await page.addInitScript(() => {
    const real = performance.now.bind(performance);
    performance.now = () => (window as CounterWindow).__frozenNowMs ?? real();
  });
  await continueCrowdedCampaign(page);
  await settledToAmbient(page);

  const snapshot = (slot: 'ambient' | 'full') => page.evaluate((name) => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    ((window as unknown as Record<string, ImageData>)[`__snap_${name}`]) = data;
  }, slot);
  const freeze = (ms: number) => page.evaluate((value) => { (window as CounterWindow).__frozenNowMs = value; }, ms);
  const waitForAmbientPaints = async (count: number) => {
    const start = (await paints(page)).ambient;
    await expect.poll(async () => (await paints(page)).ambient).toBeGreaterThanOrEqual(start + count);
  };

  // Resizing resets 2D-context state (e.g. image smoothing), so both snapshots are taken after a
  // resize: the baseline full paint below and the forced one at the end start from the same state.
  const forceFullPaint = async () => {
    const before = await paints(page);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await expect.poll(async () => (await paints(page)).full).toBeGreaterThan(before.full);
  };
  const t0 = await page.evaluate(() => performance.now());
  await freeze(t0);
  await forceFullPaint();
  await waitForAmbientPaints(3);
  // Move the animation phase a long way (several distinct pulse phases), then let ambient paints draw it.
  await freeze(t0 + 1_900);
  await waitForAmbientPaints(3);
  await snapshot('ambient');

  await forceFullPaint(); // the same frozen instant, painted whole
  await waitForAmbientPaints(1);
  await snapshot('full');

  const diff = await page.evaluate(() => {
    const w = window as unknown as Record<string, ImageData>;
    const a = w.__snap_ambient!;
    const b = w.__snap_full!;
    let count = 0;
    let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
        const px = (i / 4) % a.width; const py = Math.floor(i / 4 / a.width);
        count++; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
    }
    return { width: a.width, height: a.height, same: a.width === b.width && a.height === b.height, count, box: [x0, y0, x1, y1] };
  });
  expect(diff, 'ambient-region paint must match a full paint pixel-for-pixel').toMatchObject({ same: true, count: 0 });
});
