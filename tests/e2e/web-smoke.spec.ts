import { expect, test } from '@playwright/test';

test('web build renders the start surface and canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#ui-layer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();

  const canvasBox = await page.locator('#game-canvas').boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(200);
  expect(canvasBox?.height).toBeGreaterThan(200);
});
