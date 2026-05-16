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

test('web build can open the new-game path without blanking the map UI', async ({ page }) => {
  await page.goto('/');

  const newGame = page.getByRole('button', { name: 'New Game' });
  await expect(newGame).toBeVisible();
  await newGame.click();

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#ui-layer')).toBeVisible();
  const canvasBox = await page.locator('#game-canvas').boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(200);
  expect(canvasBox?.height).toBeGreaterThan(200);
});
