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

test('pausing loaded freight holds the cargo and updates its arrival forecast', async ({ page }) => {
  await page.goto('/?scenario=freight-strait-a');
  await page.getByRole('button', { name: 'Freight investment', exact: true }).click();
  const investment = page.getByRole('dialog', { name: 'Freight investment' });
  await investment.getByRole('button', { name: 'Review passage' }).click();
  await investment.getByRole('button', { name: 'Confirm passage' }).click();
  await expect(investment).toContainText('Passage opened');
  await investment.getByRole('button', { name: 'Close', exact: true }).click();

  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  const advance = async (turn: number) => {
    const next = page.locator('#hud').getByText(new RegExp(`^Turn ${turn} ·`));
    await requestEndTurn(page, warning.or(next));
    await expect(warning.or(next)).toBeVisible();
    if (await warning.isVisible()) await warning.click();
    await expect(next).toBeVisible();
  };
  for (const turn of [11, 12, 13]) await advance(turn);

  const tradeButton = page.getByRole('button', { name: 'Trade', exact: true });
  const trade = page.getByRole('dialog', { name: 'Trade & Supply' });
  const route = trade.getByRole('button', { name: 'Select the trade unit on Westport → Eastport' }).locator('../..');
  const cargo = route.getByText(/Confirmed cargo: 3 Coal/);
  const closeTrade = trade.getByRole('button', { name: 'Close Trade & Supply' });

  await tradeButton.click();
  await expect(cargo).toContainText('returning home in 1 round');
  await route.getByRole('button', { name: 'Pause the trade route Westport → Eastport' }).click();
  await expect(route).toContainText('earning 0 · paused');
  await expect(cargo).toContainText('Held on board until you resume');
  await expect(cargo).not.toContainText('returning home in');
  await expect(route).toContainText('Forecast: Paused');
  await closeTrade.click();
  await advance(14);

  await tradeButton.click();
  await expect(cargo).toContainText('Held on board until you resume');
  await route.getByRole('button', { name: 'Resume the trade route Westport → Eastport' }).click();
  await expect(route).toContainText('awaiting next move');
  await expect(cargo).toContainText('Awaiting next move');
  await expect(cargo).not.toContainText('Delayed');
  await closeTrade.click();
  await advance(15);

  await page.getByRole('button', { name: 'Freight investment', exact: true }).click();
  await expect(investment).toContainText('3 imported coal in reserve');
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

test('the funded Expedition can establish its ivory outpost through the map', async ({ page }) => {
  await page.goto('/?scenario=freight-strait-b');
  await expect(page.getByRole('button', { name: 'Freight investment' })).toBeVisible();
  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  const advance = async (turn: number) => {
    const next = page.locator('#hud').getByText(new RegExp(`^Turn ${turn} ·`));
    await requestEndTurn(page, warning.or(next));
    await expect(warning.or(next)).toBeVisible();
    if (await warning.isVisible()) await warning.click();
    await expect(next).toBeVisible();
  };

  await advance(11);
  await page.getByRole('button', { name: 'Select next unmoved unit' }).click();
  const unit = page.getByLabel('Selected unit details and actions (scroll for more)');
  await expect(unit).toContainText('Expedition');
  const establish = unit.getByRole('button', { name: 'Establish Outpost' });
  await expect(establish).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+ArrowDown');
  const cursor = page.locator('#keyboard-cursor-status');
  await expect(cursor).toContainText('your Expedition');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cursor).toContainText('Forest at 0, 9');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cursor).toContainText('your Expedition');
  // The move spends the Expedition's movement and the game clears selection.
  await expect(unit).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(establish).toBeVisible();
  await establish.click();
  await expect(unit).toBeHidden();

  await advance(12);
  await advance(13);
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  const supplies = page.getByRole('dialog', { name: 'Trade & Supply' });
  const owned = supplies.getByText('✓ Owned', { exact: true });
  await expect(owned.locator('..')).toContainText('Ivory');
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
