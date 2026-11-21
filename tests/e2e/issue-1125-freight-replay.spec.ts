import { expect, test } from '@playwright/test';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin } from './helpers/a11y-audit';
import { requestEndTurn } from './helpers/primary-action-bar';

test('the strait compare-and-confirm flow works with a keyboard and survives a reload', async ({ page }) => {
  await page.goto('/?scenario=freight-strait-a');
  const open = page.getByRole('button', { name: 'Freight investment', exact: true });
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Freight investment' });
  await expect(panel).toContainText('8 rounds');
  await expect(panel).toContainText('4 rounds');
  expect(await auditWithAxe(page, '#freight-investment-dialog')).toEqual([]);
  expect(await findPointerOnlyControls(page, '#freight-investment-dialog')).toEqual([]);
  await page.keyboard.press('Tab');
  expect(await focusIsWithin(page, '#freight-investment-dialog')).toBe(true);
  await panel.getByRole('button', { name: 'Review passage' }).focus();
  await page.keyboard.press('Enter');
  const confirm = panel.getByRole('button', { name: 'Confirm passage' });
  await expect(confirm).toBeVisible();
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('Passage opened');
  await expect(panel).toContainText('5 gold available');
  await expect(panel.getByRole('button', { name: 'Review Harbor' })).toBeDisabled();
  await expect(panel.getByRole('status')).toHaveText('Investment confirmed.');
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await page.reload();
  await open.click();
  await expect(panel).toContainText('Passage opened');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  for (let round = 11; round <= 15; round++) {
    const next = page.locator('#hud').getByText(new RegExp(`^Turn ${round} ·`));
    await requestEndTurn(page, warning.or(next));
    const outcome = await Promise.race([
      warning.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'warning'),
      next.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'next'),
    ]);
    if (outcome === 'warning') await warning.click();
    await expect(next).toBeVisible();
    if (round === 14 || round === 15) {
      await open.click();
      await expect(panel).toContainText(round === 14 ? '3 imported coal in reserve' : 'Factory fueled this round');
      if (round === 14) await expect(panel).toContainText('Factory is waiting for fuel');
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
});

test('ordinary campaign entry has no freight investment controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#save-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Freight investment', exact: true })).toHaveCount(0);
});

test('the two strait maps resume their own progress in the same browser', async ({ page }) => {
  const open = page.getByRole('button', { name: 'Freight investment', exact: true });
  const panel = page.getByRole('dialog', { name: 'Freight investment' });
  const choose = async (choice: 'passage' | 'Harbor') => {
    await panel.getByRole('button', { name: `Review ${choice}` }).click();
    await panel.getByRole('button', { name: `Confirm ${choice}` }).click();
    await expect(panel.getByRole('status')).toHaveText('Investment confirmed.');
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
  };

  await page.goto('/?scenario=freight-strait-a');
  await open.click();
  await expect(panel).toContainText('8 rounds now, 4 rounds with the passage');
  await choose('passage');
  const next = page.locator('#hud').getByText(/^Turn 11 ·/);
  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  await requestEndTurn(page, warning.or(next));
  await expect(warning.or(next)).toBeVisible();
  if (await warning.isVisible()) await warning.click();
  await expect(next).toBeVisible();

  await page.goto('/?scenario=freight-strait-b');
  await open.click();
  await expect(panel).toContainText('5 rounds now, 4 rounds with the passage');
  await choose('Harbor');

  await page.goto('/?scenario=freight-strait-a');
  await open.click();
  await expect(next).toBeVisible();
  await expect(panel).toContainText('Passage opened');

  await page.goto('/?scenario=freight-strait-b');
  await open.click();
  await expect(panel).toContainText('Harbor completed');
  await expect(panel).toContainText('5 rounds now, 4 rounds with the passage');
});

test.describe('strait comparison on touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('can defer, reopen and authorize the Harbor on the closer detour', async ({ page }) => {
    await page.goto('/?scenario=freight-strait-b');
    const open = page.getByRole('button', { name: 'Freight investment', exact: true });
    await open.tap();
    const panel = page.getByRole('dialog', { name: 'Freight investment' });
    await expect(panel).toContainText('5 rounds');
    await expect(panel).toContainText('4 rounds');
    await panel.getByRole('button', { name: 'Defer' }).tap();
    await expect(panel).toBeHidden();
    await open.tap();
    await expect(panel).toContainText('50 gold available');
    await panel.getByRole('button', { name: 'Review Harbor' }).tap();
    await panel.getByRole('button', { name: 'Confirm Harbor' }).tap();
    await expect(panel).toContainText('Harbor completed');
    await expect(panel.getByRole('button', { name: 'Review passage' })).toBeDisabled();
  });
});
