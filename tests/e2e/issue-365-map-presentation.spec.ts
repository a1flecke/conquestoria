import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');
const FIXTURE = JSON.parse(FIXTURE_TEXT) as {
  map: {
    tiles: Record<string, { coord: { q: number; r: number }; terrain: string }>;
  };
  cities: Record<string, { position: { q: number; r: number } }>;
  units: Record<string, { position: { q: number; r: number } }>;
};

const TERRAIN_LABELS = new Set([
  'Grass', 'Plains', 'Desert', 'Tundra', 'Snow', 'Forest', 'Hills',
  'Mtn', 'Ocean', 'Coast', 'Jungle', 'Swamp', 'Volc',
]);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript(({ fixtureText, terrainLabels }) => {
    localStorage.setItem('conquestoria-autosave', fixtureText);
    const labels = new Set(terrainLabels);
    const original = CanvasRenderingContext2D.prototype.fillText;
    (window as typeof window & { __issue365TerrainDraws?: Array<{ text: string; x: number; y: number }> })
      .__issue365TerrainDraws = [];
    CanvasRenderingContext2D.prototype.fillText = function patchedFillText(text, x, y, maxWidth) {
      if (labels.has(String(text))) {
        window.__issue365TerrainDraws?.push({ text: String(text), x, y });
      }
      if (maxWidth === undefined) return original.call(this, text, x, y);
      return original.call(this, text, x, y, maxWidth);
    };
  }, { fixtureText: FIXTURE_TEXT, terrainLabels: [...TERRAIN_LABELS] });
}

async function continueFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForTimeout(500);
}

function pointyHexPixel(coord: { q: number; r: number }): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (coord.q + coord.r / 2) * 48,
    y: 1.5 * coord.r * 48,
  };
}

function findMoveTarget(origin: { q: number; r: number }): { q: number; r: number } {
  const directions = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const occupied = new Set([
    ...Object.values(FIXTURE.cities).map(city => `${city.position.q},${city.position.r}`),
    ...Object.values(FIXTURE.units).map(unit => `${unit.position.q},${unit.position.r}`),
  ]);
  for (const direction of directions) {
    const coord = { q: origin.q + direction.q, r: origin.r + direction.r };
    const tile = FIXTURE.map.tiles[`${coord.q},${coord.r}`];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && !occupied.has(`${coord.q},${coord.r}`)) {
      return coord;
    }
  }
  throw new Error('Fixture has no adjacent movement target');
}

async function getOnScreenCopy(
  page: Page,
  selector: string,
): Promise<{ locator: ReturnType<Page['locator']>; box: NonNullable<Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>> }> {
  const locator = page.locator(selector);
  const viewport = page.viewportSize()!;
  const count = await locator.count();
  for (let index = 0; index < count; index++) {
    const copy = locator.nth(index);
    const box = await copy.boundingBox();
    if (box && box.x + box.width > 0 && box.y + box.height > 0 && box.x < viewport.width && box.y < viewport.height) {
      return { locator: copy, box };
    }
  }
  throw new Error(`No on-screen copy for ${selector}`);
}

test('crowded save keeps one bounded city, one stack, and no building overlay labels', async ({ page }, testInfo) => {
  await installFixture(page);
  await continueFixture(page);

  await expect(page.locator('#building-sprites')).toHaveCount(1);
  await expect(page.locator('#building-sprites > *')).toHaveCount(0);
  await expect(page.locator('#building-sprites .cq-sprite-label')).toHaveCount(0);
  await expect(page.locator('#improvement-sprites > *')).toHaveCount(0);
  const stackCopies = page.locator('#unit-sprites > [data-member-ids*="issue-365-lead"]');
  expect(await stackCopies.count()).toBeGreaterThan(0);
  expect(await stackCopies.evaluateAll(elements => (
    new Set(elements.map(element => (element as HTMLElement).dataset.entityId)).size
  ))).toBe(1);

  const terrainDraws = await page.evaluate(() => window.__issue365TerrainDraws ?? []);
  expect(terrainDraws.length).toBeGreaterThan(0);

  await page.screenshot({ path: testInfo.outputPath('issue-365-desktop.png'), fullPage: true });
});

test('moving a member out of the crowded stack preserves its rendered size', async ({ page }) => {
  await installFixture(page);
  await continueFixture(page);

  const stack = await getOnScreenCopy(page, '#unit-sprites > [data-member-ids*="issue-365-lead"]');
  const before = stack.box;

  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  const leadButton = page.locator('[data-unit-stack-item="true"][data-unit-id="issue-365-lead"]');
  await expect(leadButton).toBeVisible();
  await leadButton.click();

  const origin = FIXTURE.units['issue-365-lead'].position;
  const target = findMoveTarget(origin);
  const originPixel = pointyHexPixel(origin);
  const targetPixel = pointyHexPixel(target);
  await page.mouse.click(
    before.x + before.width / 2 + targetPixel.x - originPixel.x,
    before.y + before.height / 2 + targetPixel.y - originPixel.y,
  );

  await expect(page.locator('#unit-sprites > [data-entity-id="issue-365-lead"]')).not.toHaveCount(0, { timeout: 5_000 });
  const moved = await getOnScreenCopy(page, '#unit-sprites > [data-entity-id="issue-365-lead"]');
  expect(moved.box.width).toBeCloseTo(before.width, 1);
  expect(moved.box.height).toBeCloseTo(before.height, 1);
});

test('mobile reduced motion keeps static DOM sprites and the crowded map usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFixture(page);
  await continueFixture(page);

  await expect(page.locator('#sprite-overlay')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('#unit-sprites > *')).not.toHaveCount(0);
  const animationDuration = await page.locator('#unit-sprites .cq-sprite-figure').first()
    .evaluate(element => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.000001);
  const canvasBox = await page.locator('#game-canvas').boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(390);
  expect(canvasBox?.height).toBeGreaterThan(500);

  await page.screenshot({ path: testInfo.outputPath('issue-365-mobile-reduced-motion.png'), fullPage: true });
});

declare global {
  interface Window {
    __issue365TerrainDraws?: Array<{ text: string; x: number; y: number }>;
  }
}
