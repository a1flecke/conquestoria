import { expect, test, type Page } from '@playwright/test';

// #889: a Great General command is a visible moment, not a silent state change. Real campaign (the dev-only
// great-general-abilities-basic scenario), real panels, real canvas, keyboard only (the General is reached with the
// map cursor from #1459): confirming a command states its result and the panel reflects the spent charge.
// What the effect looks like on the canvas is covered at the drawing level (tests/renderer/general-ability-effects.test.ts).

async function openScenario(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?scenario=great-general-abilities-basic');
  await expect(page.locator('#hud')).toContainText(/Turn \d+/, { timeout: 60_000 });
  // The game's own required-choice prompt owns the keyboard until a research is chosen.
  const choice = page.getByRole('dialog', { name: 'Choose Your Next Step' });
  if (await choice.isVisible().catch(() => false)) {
    await choice.getByRole('button', { name: /turns$/ }).first().click();
    await expect(choice).toBeHidden();
  }
}

/**
 * Select the General with the keyboard alone. The scenario puts it on the map's top-left hex (0,0), so from the
 * first unit needing orders the map cursor goes up until the General is announced or the edge stops it, then left.
 * This used to walk a fixed eight hexes straight up, which only worked while this seed happened to start the
 * player's settler directly below that corner; it broke when start placement changed (#1692).
 */
async function selectGeneral(page: Page): Promise<void> {
  await page.keyboard.press('n');
  const caption = page.locator('[role="status"][aria-live="polite"]');
  const onGeneral = async (): Promise<boolean> => (await caption.allInnerTexts()).join(' ').includes('your Great General');
  walk: for (const key of ['Shift+ArrowUp', 'Shift+ArrowLeft']) {
    for (let step = 0; step < 40; step++) {
      if (await onGeneral()) break walk;
      await page.keyboard.press(key);
    }
  }
  await expect(caption).toContainText('your Great General');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rally' })).toBeVisible();
}

/**
 * The result is a toast and a message-log entry. Toasts queue (one at a time, by design), so the game's own opening
 * welcome toast can still be showing; the log is the durable record and is what is asserted.
 */
async function expectLoggedResult(page: Page, result: string | RegExp): Promise<void> {
  const open = page.getByRole('button', { name: 'View message log' });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#notification-log')).toContainText(result);
}

test.describe('Great General commands are visible moments', () => {
  test('Rally states its result and the panel shows the spent charge', async ({ page }) => {
    test.setTimeout(120_000);
    await openScenario(page);
    await selectGeneral(page);

    await page.getByRole('button', { name: 'Rally' }).click();
    const panel = page.locator('#rally-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Confirm' }).click();

    await expect(panel).toHaveCount(0);
    await expectLoggedResult(page, /Rally: 1 unit steadied, \d+ HP restored\./);
  });

  test('Seize the Moment states how many units can act again', async ({ page }) => {
    test.setTimeout(120_000);
    await openScenario(page);
    await selectGeneral(page);

    await page.getByRole('button', { name: 'Seize the Moment' }).click();
    const panel = page.locator('#seize-the-moment-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('checkbox').first().check();
    await panel.getByRole('button', { name: 'Confirm' }).click();

    await expectLoggedResult(page, 'Seize the Moment: 1 unit can act again.');
  });
});
