import { expect, test, type Page } from '@playwright/test';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin } from './helpers/a11y-audit';
import { clickVisibleHex } from './helpers/canvas-interaction';
import { requestEndTurn } from './helpers/primary-action-bar';

function turnLabel(page: Page, turn: number) {
  return page.locator('#hud').getByText(new RegExp(`^Turn ${turn} ·`));
}

async function advanceFreightTurn(page: Page, turn: number): Promise<void> {
  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  const next = turnLabel(page, turn);
  await requestEndTurn(page, warning.or(next));
  await expect(warning.or(next)).toBeVisible();
  if (await warning.isVisible()) await warning.click();
  await expect(next).toBeVisible();
}

async function expectSavedRouteChange(page: Page, action: 'paused' | 'resumed' | 'cancelled' | 'established'): Promise<void> {
  const open = page.getByRole('button', { name: 'View message log' });
  const log = page.getByRole('dialog', { name: 'Message log' });
  const close = log.getByRole('button', { name: 'Close message log' });
  // A prior notification may still occupy the toast. Reopen the log to read its latest entries.
  await expect.poll(async () => {
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(log).toBeVisible();
    const text = await log.innerText();
    await close.click();
    return text;
  }).toMatch(new RegExp(`Trade route ${action}.*Progress saved`));
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`both straits frame the home ports and Expedition at ${viewport.width}px on entry and reload`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const ready = page.getByRole('button', { name: 'Freight investment', exact: true });
    const expectOpeningView = async () => {
      await expect(ready).toBeVisible();
      for (const [name, coord] of [
        ['Westport', { q: 0, r: 5 }],
        ['Northport', { q: 0, r: 2 }],
        ['Expedition', { q: 0, r: 7 }],
      ] as const) {
        const point = await page.evaluate(hex => window.__CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__?.(hex)[0], coord);
        expect(point, `${name} should have a visible map copy`).toBeDefined();
        expect(point?.x, `${name} x in viewport`).toBeGreaterThan(0);
        expect(point?.x, `${name} x in viewport`).toBeLessThan(viewport.width);
        expect(point?.y, `${name} y in viewport`).toBeGreaterThan(0);
        expect(point?.y, `${name} y in viewport`).toBeLessThan(viewport.height);
      }
    };

    for (const scenario of ['freight-strait-a', 'freight-strait-b']) {
      await page.goto(`/?scenario=${scenario}`);
      await expectOpeningView();
      await page.reload();
      await expectOpeningView();
      if (viewport.width === 1280) {
        await clickVisibleHex(page, { q: 0, r: 7 });
        await expect(page.getByLabel('Selected unit details and actions (scroll for more)')).toContainText('Expedition');
      }
    }
  });
}

test('the strait compare-and-confirm flow works with a keyboard and survives a reload', async ({ page }) => {
  await page.goto('/?scenario=freight-strait-a');
  const open = page.getByRole('button', { name: 'Freight investment', exact: true });
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Freight investment' });
  const passage = panel.getByRole('region', { name: 'Passage', exact: true });
  const harbor = panel.getByRole('region', { name: 'Harbor', exact: true });
  await expect(passage).toContainText('Westport Strait');
  await expect(passage).toContainText('45 gold');
  await expect(passage.getByText('Current', { exact: true })).toBeVisible();
  await expect(passage.getByText('8 rounds', { exact: true })).toBeVisible();
  await expect(passage.getByText('With passage', { exact: true })).toBeVisible();
  await expect(passage.getByText('4 rounds', { exact: true })).toBeVisible();
  await expect(harbor).toContainText('Northport');
  await expect(harbor).toContainText('45 gold');
  await expect(harbor).toContainText('+1 net gold');
  await expect(harbor).toContainText('+1 food');
  await expect(harbor).toContainText('Per round after completion');
  expect(await auditWithAxe(page, '#freight-investment-dialog')).toEqual([]);
  expect(await findPointerOnlyControls(page, '#freight-investment-dialog')).toEqual([]);
  await page.keyboard.press('Tab');
  expect(await focusIsWithin(page, '#freight-investment-dialog')).toBe(true);
  await panel.getByRole('button', { name: 'Review passage' }).focus();
  await page.keyboard.press('Enter');
  const confirm = panel.getByRole('button', { name: 'Confirm passage' });
  await expect(confirm).toBeVisible();
  await expect(harbor).toBeHidden();
  await expect(passage).toContainText('The coal trader can use the shortcut between Westport and Eastport.');
  await expect(passage).toContainText('Coal enters your reserves when the trader unloads at Westport.');
  await expect(passage).toContainText('The Factory can use it the following round.');
  await expect(passage).toContainText('5 spendable gold left');
  await expect(panel).toContainText('50 spendable gold');
  expect(await auditWithAxe(page, '#freight-investment-dialog')).toEqual([]);
  await panel.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(harbor).toBeVisible();
  await expect(confirm).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Review passage' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirm).toBeVisible();
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(passage).toContainText('Passage opened');
  await expect(passage.getByText('Current', { exact: true })).toBeVisible();
  await expect(passage.getByText('4 rounds', { exact: true })).toBeVisible();
  await expect(passage.getByText('With passage', { exact: true })).toBeHidden();
  await expect(panel).toContainText('5 spendable gold');
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
      await expect(panel).toContainText(round === 14 ? '3 imported coal in reserve' : 'Fuel used last round');
      if (round === 14) await expect(panel).toContainText('Coal ready for next fuel allocation');
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
});

test('ordinary campaign entry has no freight investment controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#save-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Freight investment', exact: true })).toHaveCount(0);
});

test('loaded freight stays paused or resumed after a same-turn reload', async ({ page }) => {
  await page.goto('/?scenario=freight-strait-a');
  await page.getByRole('button', { name: 'Freight investment', exact: true }).click();
  const investment = page.getByRole('dialog', { name: 'Freight investment' });
  await investment.getByRole('button', { name: 'Review passage' }).click();
  await investment.getByRole('button', { name: 'Confirm passage' }).click();
  await expect(investment).toContainText('Passage opened');
  const passage = investment.getByRole('region', { name: 'Passage', exact: true });
  await expect(passage).toContainText('Estimated coal round trip');
  await expect(passage.getByText('4 rounds', { exact: true })).toBeVisible();
  await investment.getByRole('button', { name: 'Close', exact: true }).click();

  const tradeButton = page.getByRole('button', { name: 'Trade', exact: true });
  const trade = page.getByRole('dialog', { name: 'Trade & Supply' });
  const selectTrader = trade.getByRole('button', { name: 'Select the trade unit on Westport → Eastport' });
  const route = selectTrader.locator('../..');
  const cargo = route.getByText(/Confirmed cargo: 3 Coal/);
  const closeTrade = trade.getByRole('button', { name: 'Close Trade & Supply' });

  await tradeButton.click();
  await expect(route).toContainText('outbound to supplier');
  await expect(route).not.toContainText('round trip 8 rounds');
  await closeTrade.click();
  for (const turn of [11, 12, 13]) await advanceFreightTurn(page, turn);

  await tradeButton.click();
  await expect(route).toContainText('homebound');
  await expect(cargo).toContainText('returning home in 1 round');
  await route.getByRole('button', { name: 'Pause the trade route Westport → Eastport' }).click();
  await expect(route).toContainText('earning 0 · paused');
  await expect(cargo).toContainText('Held on board until you resume');
  await expect(cargo).not.toContainText('returning home in');
  await expect(route).toContainText('Forecast: Paused');
  await closeTrade.click();
  await expectSavedRouteChange(page, 'paused');
  await page.reload();
  await expect(turnLabel(page, 13)).toBeVisible();
  await tradeButton.click();
  await expect(cargo).toContainText('Held on board until you resume');
  await closeTrade.click();
  await advanceFreightTurn(page, 14);

  await tradeButton.click();
  await expect(cargo).toContainText('Held on board until you resume');
  await route.getByRole('button', { name: 'Resume the trade route Westport → Eastport' }).click();
  await expect(route).toContainText('awaiting next move');
  await expect(cargo).toContainText('Awaiting next move');
  await expect(cargo).not.toContainText('Delayed');
  await closeTrade.click();
  await expectSavedRouteChange(page, 'resumed');
  await page.reload();
  await expect(turnLabel(page, 14)).toBeVisible();
  await tradeButton.click();
  await expect(cargo).toContainText('Awaiting next move');
  await expect(route.getByRole('button', { name: 'Pause the trade route Westport → Eastport' })).toBeVisible();
  await closeTrade.click();
  await advanceFreightTurn(page, 15);

  await page.getByRole('button', { name: 'Freight investment', exact: true }).click();
  await expect(investment).toContainText('3 imported coal in reserve');
  await investment.getByRole('button', { name: 'Close', exact: true }).click();
  await tradeButton.click();
  await expect(route).toContainText('outbound to supplier');
  await expect(cargo).toHaveCount(0);
  await selectTrader.click();
  const unit = page.getByLabel('Selected unit details and actions (scroll for more)');
  await expect(unit).toContainText('Committed to route (outbound to supplier)');
  await expect(unit).not.toContainText('round trip');
});

test('City cancellation delivers paid cargo and allows the trader to start a new coal route', async ({ page }) => {
  // CI reached turn 20 of this 12-turn replay with two reloads in the 30-second default.
  test.setTimeout(60_000);
  await page.goto('/?scenario=freight-strait-b');
  const open = page.getByRole('button', { name: 'Freight investment', exact: true });
  const investment = page.getByRole('dialog', { name: 'Freight investment' });
  await open.click();
  const harbor = investment.getByRole('region', { name: 'Harbor', exact: true });
  await expect(harbor).toContainText('+1 net gold');
  await expect(harbor).toContainText('+1 food');
  await expect(harbor).toContainText('Per round after completion');
  await investment.getByRole('button', { name: 'Review Harbor' }).click();
  await investment.getByRole('button', { name: 'Confirm Harbor' }).click();
  await expect(investment.getByRole('status')).toHaveText('Investment confirmed.');
  await investment.getByRole('button', { name: 'Close', exact: true }).click();
  for (const turn of [11, 12, 13, 14]) await advanceFreightTurn(page, turn);

  const tradeButton = page.getByRole('button', { name: 'Trade', exact: true });
  const trade = page.getByRole('dialog', { name: 'Trade & Supply' });
  const route = trade.getByRole('button', { name: 'Select the trade unit on Westport → Eastport' }).locator('../..');
  const coal = trade.locator('[data-section="trade-supply-supplies"] [data-text^="res-name-"]')
    .filter({ hasText: /Coal$/ }).locator('../..');
  await tradeButton.click();
  await expect(route).toContainText('Confirmed cargo: 5 Coal');
  await expect(route).toContainText('returning home in 1 round');
  await expect(coal).toContainText('5 incoming');
  await expect(coal).toContainText('No local extraction');
  await expect(coal).toContainText('Awaiting confirmed cargo');
  await trade.getByRole('button', { name: 'Close Trade & Supply' }).click();

  await clickVisibleHex(page, { q: 0, r: 5 });
  const city = page.locator('#city-panel');
  await expect(city).toContainText('Westport');
  await city.getByRole('button', { name: 'Cancel and return the trade route Westport → Eastport' }).click();
  await expect(city).toContainText('returning home in 1 round');
  await expect(city.locator('[data-route-procurement]')).toHaveCount(0);
  await city.getByRole('button', { name: 'Close city panel' }).click();
  await expectSavedRouteChange(page, 'cancelled');
  await page.reload();
  await expect(turnLabel(page, 14)).toBeVisible();
  await tradeButton.click();
  await expect(route).toContainText('cancelled');
  await expect(route).toContainText('returning home in 1 round');
  await expect(route.locator('[data-route-procurement]')).toHaveCount(0);
  await trade.getByRole('button', { name: 'Close Trade & Supply' }).click();

  await advanceFreightTurn(page, 15);
  await open.click();
  await expect(investment).toContainText('5 imported coal in reserve');
  await expect(investment).toContainText('Coal ready for next fuel allocation');
  await investment.getByRole('button', { name: 'Close', exact: true }).click();

  await clickVisibleHex(page, { q: 1, r: 5 });
  const returningUnit = page.getByLabel('Selected unit details and actions (scroll for more)');
  await expect(returningUnit).toContainText('Naval Trader');
  await expect(returningUnit).toContainText('Moves: 0/3');
  await expect(returningUnit).toContainText('It can establish a route next turn.');
  await expect(returningUnit.getByRole('button', { name: 'Establish Route', exact: true })).toHaveCount(0);

  await tradeButton.click();
  await expect(route).toHaveCount(0);
  await trade.getByRole('button', { name: 'Close Trade & Supply' }).click();

  // The return has spent the trader's action. A new assignment is legal on the next turn.
  await advanceFreightTurn(page, 16);
  await clickVisibleHex(page, { q: 1, r: 5 });
  // Both traders can share this water tile. Choose the one released from its route.
  await page.getByRole('button', { name: /Naval Trader.*Ready/ }).click();
  const unit = page.getByLabel('Selected unit details and actions (scroll for more)');
  const establish = unit.getByRole('button', { name: 'Establish Route', exact: true });
  await expect(establish).toBeEnabled();
  await establish.press('Enter');
  const chooser = page.getByRole('dialog', { name: 'Trade Routes (Naval Trader)', exact: true });
  const destination = chooser.locator('[data-destination-city="strait-supplier"]').last();
  const confirm = chooser.getByRole('button', { name: 'Confirm', exact: true });
  await expect(destination).toContainText('Eastport');
  await expect(destination).not.toContainText('already acted');
  await expect(confirm).toBeDisabled();
  await expect(destination).toHaveJSProperty('tagName', 'BUTTON');
  await destination.press('Enter');
  await expect(confirm).toBeEnabled();
  await expect(destination).toHaveAttribute('aria-pressed', 'true');
  await expect(chooser.locator('[data-route-summary]')).toContainText('Round trip: 4 rounds');
  await chooser.locator('[data-procurement-good]').selectOption('resource:coal');
  await chooser.getByLabel('Maximum unit price').fill('100');
  await chooser.getByLabel('Treasury floor').fill('30');
  await confirm.click();
  await expect(chooser).toBeHidden();
  await expect(unit).toContainText('Committed to route');
  await expectSavedRouteChange(page, 'established');
  await page.reload();
  await expect(turnLabel(page, 16)).toBeVisible();
  await tradeButton.click();
  await expect(route).toContainText('Coal target 10');
  await trade.getByRole('button', { name: 'Close Trade & Supply' }).click();

  for (const turn of [17, 18, 19, 20, 21]) await advanceFreightTurn(page, turn);
  await open.click();
  await expect(investment).toContainText(/[1-9]\d* imported coal in reserve/);
  await expect(investment).toContainText('Coal ready for next fuel allocation');
  await investment.getByRole('button', { name: 'Close', exact: true }).click();
  await advanceFreightTurn(page, 22);
  await open.click();
  await expect(investment).toContainText('Fuel used last round');
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
  await expect(panel.getByText('8 rounds', { exact: true })).toBeVisible();
  await expect(panel.getByText('4 rounds', { exact: true })).toBeVisible();
  await choose('passage');
  const next = page.locator('#hud').getByText(/^Turn 11 ·/);
  const warning = page.getByRole('button', { name: 'End Turn Anyway', exact: true });
  await requestEndTurn(page, warning.or(next));
  await expect(warning.or(next)).toBeVisible();
  if (await warning.isVisible()) await warning.click();
  await expect(next).toBeVisible();

  await page.goto('/?scenario=freight-strait-b');
  await open.click();
  await expect(panel.getByText('5 rounds', { exact: true })).toBeVisible();
  await expect(panel.getByText('4 rounds', { exact: true })).toBeVisible();
  await choose('Harbor');

  await page.goto('/?scenario=freight-strait-a');
  await open.click();
  await expect(next).toBeVisible();
  await expect(panel).toContainText('Passage opened');

  await page.goto('/?scenario=freight-strait-b');
  await open.click();
  await expect(panel).toContainText('Harbor completed');
  await expect(panel.getByText('5 rounds', { exact: true })).toBeVisible();
  await expect(panel.getByText('4 rounds', { exact: true })).toBeVisible();
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
  // Selection is cleared on a 400 ms settle timer, but the two-hex slide lasts 440 ms and is retired
  // on the next frame, so an Enter in between is refused ("Unit is moving."). Retry only while the
  // panel is still closed, so a retry can never toggle an open selection.
  await expect(async () => {
    if (!(await unit.isVisible())) await page.keyboard.press('Enter');
    await expect(establish).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await establish.click();
  await expect(unit).toBeHidden();

  await advance(12);
  await advance(13);
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  const supplies = page.getByRole('dialog', { name: 'Trade & Supply' });
  const owned = supplies.getByText('✓ Owned', { exact: true });
  const ivory = owned.locator('..');
  await expect(ivory).toContainText('Ivory');
  await expect(ivory).toContainText('Local access');
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
    await expect(panel).toContainText('50 spendable gold');
    await panel.getByRole('button', { name: 'Review Harbor' }).tap();
    const harbor = panel.getByRole('region', { name: 'Harbor', exact: true });
    await expect(panel.getByRole('region', { name: 'Passage', exact: true })).toBeHidden();
    await expect(harbor).toContainText('Completes the queued Harbor in Northport immediately.');
    await expect(harbor).toContainText('Food and net gold start accruing next round.');
    await expect(harbor).toContainText('5 spendable gold left');
    await expect(panel).toContainText('50 spendable gold');
    await panel.getByRole('button', { name: 'Confirm Harbor' }).tap();
    await expect(panel.getByRole('button', { name: 'Review passage' })).toBeDisabled();
    await expect(harbor).toBeHidden();
    await expect(panel).toContainText('Harbor completed in Northport');
    await expect(panel).toContainText('35 gold in treasury · 30 gold kept in reserve');
    const passage = panel.getByRole('region', { name: 'Passage', exact: true });
    await expect(passage).toContainText('Need 40 more spendable gold.');
  });
});
