import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { clickVisibleHex } from './helpers/canvas-interaction';
import { continueCrowdedCampaign, installIdleCampaignFixture, readSpriteLoads } from './helpers/renderer-idle-perf';

/**
 * #1439: an untouched campaign must stop repainting, and every real input must wake exactly the
 * repaint it needs. Deterministic redraw counts only -- there is no CPU or timing threshold here.
 * The counter is the prototype-patched `clearRect` on #game-canvas (one per RenderLoop paint).
 */
const FIXTURE = JSON.parse(readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
)) as {
  map: { tiles: Record<string, { terrain: string }> };
  cities: Record<string, { position: { q: number; r: number } }>;
  units: Record<string, { position: { q: number; r: number } }>;
};
const LEAD = FIXTURE.units['issue-365-lead']!.position;

function redraws(page: Page): Promise<number> {
  return page.evaluate(() => (window as typeof window & { __issue1439RendererRedraws?: { count: number } })
    .__issue1439RendererRedraws?.count ?? 0);
}

/**
 * Resolves once the paint count has not moved for a full quiet window and every sprite load that
 * started has finished (sprites load through a bounded queue, #1439 phase 4, so a late asset can
 * legitimately repaint after a quiet spell).
 */
async function waitForIdle(page: Page, quietMs = 600): Promise<number> {
  let last = await redraws(page);
  let lastCreated = (await readSpriteLoads(page)).created;
  let stableSince = Date.now();
  await expect.poll(async () => {
    const now = await redraws(page);
    const loads = await readSpriteLoads(page);
    if (now !== last || loads.created !== lastCreated) { last = now; lastCreated = loads.created; stableSince = Date.now(); }
    return Date.now() - stableSince >= quietMs && loads.outstanding === 0;
  }, { timeout: 15_000, intervals: [100] }).toBe(true);
  return last;
}

function findMoveTarget(origin: { q: number; r: number }): { q: number; r: number } {
  const occupied = new Set([
    ...Object.values(FIXTURE.cities).map(city => `${city.position.q},${city.position.r}`),
    ...Object.values(FIXTURE.units).map(unit => `${unit.position.q},${unit.position.r}`),
  ]);
  for (const d of [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }]) {
    const coord = { q: origin.q + d.q, r: origin.r + d.r };
    const tile = FIXTURE.map.tiles[`${coord.q},${coord.r}`];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && !occupied.has(`${coord.q},${coord.r}`)) return coord;
  }
  throw new Error('Fixture has no adjacent movement target');
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('#game-canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('an untouched campaign goes idle, and zoom, drag, selection and movement each repaint then return to idle', async ({ page }) => {
  test.slow(); // same crowded-fixture mount as issue-365
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installIdleCampaignFixture(page);
  await continueCrowdedCampaign(page);

  const settled = await waitForIdle(page);
  await page.waitForTimeout(1_500);
  expect(await redraws(page), 'a settled static campaign must not repaint').toBe(settled);

  const { x, y } = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => redraws(page)).toBeGreaterThan(settled);
  const afterZoom = await waitForIdle(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => redraws(page)).toBeGreaterThan(afterZoom);
  await waitForIdle(page);

  // Tapping a crowded stack only opens a DOM chooser (nothing on the canvas changes); choosing the
  // unit selects it and paints its move highlights.
  await clickVisibleHex(page, LEAD);
  const leadButton = page.locator('[data-unit-stack-item="true"][data-unit-id="issue-365-lead"]');
  await expect(leadButton).toBeVisible();
  const afterTap = await waitForIdle(page);
  await leadButton.click();
  await expect.poll(() => redraws(page), { message: 'selecting a unit repaints its highlights' }).toBeGreaterThan(afterTap);
  const afterSelect = await waitForIdle(page);

  const beforeMove = afterSelect;
  await clickVisibleHex(page, findMoveTarget(LEAD));
  await expect.poll(() => redraws(page), { message: 'a move animates, then settles' }).toBeGreaterThan(beforeMove + 1);
  const afterMove = await waitForIdle(page);
  expect(afterMove).toBeGreaterThan(afterSelect);
  await expect(page.locator('#unit-sprites > [data-entity-id="issue-365-lead"]')).not.toHaveCount(0);

  await page.waitForTimeout(1_000);
  expect(await redraws(page), 'the campaign returns to rest after the whole sequence').toBe(afterMove);
});

test('with motion allowed, input still repaints (ambient wonder animation may keep frames alive)', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installIdleCampaignFixture(page);
  await continueCrowdedCampaign(page);

  const before = await redraws(page);
  const { x, y } = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => redraws(page)).toBeGreaterThan(before);
  await expect(page.locator('#sprite-overlay')).toHaveAttribute('data-reduced-motion', 'false');
});
