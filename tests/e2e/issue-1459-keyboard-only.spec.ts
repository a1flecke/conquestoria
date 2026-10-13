import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// #1459: the critical-action path with no pointer input at all. Select a unit, walk the map cursor,
// act on a tile, open and leave a panel with focus handed in and back, and end the turn. The crowded
// fixture has three warriors on (17,4) and a plains tile at (18,4) inside the empire's borders.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript(({ fixtureText }) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    // Keep the game's own required-choice prompt out of the way: it would own the keyboard.
    civ.techState.currentResearch = 'natural-philosophy';
    for (const cityId of civ.cities) fixture.cities[cityId].productionQueue = ['warrior'];
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, { fixtureText: FIXTURE_TEXT });
}

/** Continue is the only pointer step: it is the pre-game menu, outside the critical in-game path. */
async function continueFixture(page: Page): Promise<void> {
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  await expect(page.getByRole('dialog', { name: 'Choose Opponent Challenge' })).toBeVisible();
  await page.locator(
    '[data-opponent-challenge-selector="migration"] [data-challenge="standard"]',
  ).click();
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  await expect(continueButton).toBeHidden();
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
}

async function releaseFocusToMap(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('a keyboard-only player can select, move, open a panel, leave it and end the turn', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixture(page);
  await continueFixture(page);

  const status = page.locator('#keyboard-cursor-status');
  const turnLabel = page.getByText(/^Turn \d+/).first();
  const startTurn = Number((await turnLabel.textContent())!.match(/^Turn (\d+)/)![1]);

  // Select a unit with the keyboard, then put the map cursor on it.
  await releaseFocusToMap(page);
  await page.keyboard.press('n');
  await page.keyboard.press('ArrowRight');
  await expect(status).toBeVisible();
  await expect(status).toContainText('your Warrior');

  // One step east: plains inside our border, nothing on it yet.
  await page.keyboard.press('ArrowRight');
  await expect(status).toContainText('Plains');
  await expect(status).not.toContainText('Warrior');

  // Enter takes the same path as a click on that hex: the selected warrior moves there.
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    return status.textContent();
  }, { message: 'the warrior should have moved onto the cursor tile' }).toContain('your Warrior');

  // Escape stops the cursor.
  await page.keyboard.press('Escape');
  await expect(status).toBeHidden();

  // A panel opens from a focused toolbar button; focus moves in, Escape closes it, focus returns.
  const council = page.getByRole('button', { name: 'Council', exact: true });
  await council.focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('#council-panel');
  await expect(panel).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.getElementById('council-panel')?.contains(document.activeElement) ?? false,
  )).toBe(true);
  await expect(panel).toHaveAttribute('role', 'dialog');

  // A shortcut letter pressed inside the dialog must not end the turn behind it.
  await page.keyboard.press('e');
  await expect(panel).toBeVisible();
  await expect(turnLabel).toContainText(`Turn ${startTurn}`);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(council).toBeFocused();

  // End the turn from the keyboard. Two warriors still have orders, so the game asks first: the
  // warning is a real dialog that takes focus, answers Escape, and cannot be tabbed out of.
  const warning = page.getByRole('dialog', { name: /still needs? orders/ });
  await releaseFocusToMap(page);
  await page.keyboard.press('e');
  await expect(warning).toBeVisible();
  await expect(warning.getByRole('button', { name: 'Go to Unit' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(warning).toHaveCount(0);
  await expect(turnLabel).toContainText(`Turn ${startTurn}`);

  await releaseFocusToMap(page);
  await page.keyboard.press('e');
  await expect(warning).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(warning.getByRole('button', { name: 'End Turn Anyway' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(warning.getByRole('button', { name: 'End Turn Anyway' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(turnLabel).not.toContainText(`Turn ${startTurn}`, { timeout: 30_000 });
});
