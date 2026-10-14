import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin } from './helpers/a11y-audit';

// #1459: the in-game surfaces a keyboard player reaches from the toolbar, checked the same way as the pre-game
// screens: a named dialog, focus inside it, nothing the pointer can click that the keyboard cannot reach, no axe
// findings, Escape closes it and focus comes back to the control that opened it.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function startFixture(page: Page): Promise<void> {
  await page.addInitScript(({ fixtureText }) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    // Keep the game's own required-choice prompt out of the way: it would own the keyboard.
    civ.techState.currentResearch = 'natural-philosophy';
    for (const cityId of civ.cities) fixture.cities[cityId].productionQueue = ['warrior'];
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, { fixtureText: FIXTURE_TEXT });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
}

/**
 * Open a panel from its launcher with the keyboard. The launcher toggles, so a retry is only allowed while the panel
 * is still absent after a generous wait (a press that landed before the toolbar was wired), never as a blind repeat.
 */
async function openWithKeyboard(page: Page, opener: Locator, panelSelector: string): Promise<void> {
  const panel = page.locator(panelSelector);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await panel.count() > 0) return;
    await opener.focus();
    await page.keyboard.press('Enter');
    try {
      await panel.waitFor({ state: 'attached', timeout: 2_500 });
      return;
    } catch { /* not opened yet: nothing toggled, so pressing again is safe */ }
  }
  await expect(panel).toBeVisible();
}

const PANELS: ReadonlyArray<{ opener: string | RegExp; panel: string; name: string }> = [
  { opener: 'Council', panel: '#council-panel', name: 'Council' },
  { opener: 'Tech', panel: '#tech-panel', name: 'Research' },
  { opener: 'City', panel: '#city-overview-panel', name: 'Cities' },
  { opener: 'Intel', panel: '#espionage-panel', name: 'Espionage' },
  { opener: 'Diplo', panel: '#diplomacy-panel', name: 'Diplomacy' },
  { opener: 'Trade', panel: '#marketplace-panel', name: 'Marketplace' },
  { opener: 'View message log', panel: '#notification-log', name: 'Message log' },
  { opener: 'Victory', panel: '#victory-progress-panel', name: 'Victory progress' },
  { opener: 'Pause menu', panel: '#pause-menu', name: '' },
];

test.describe('in-game surfaces are keyboard-complete', () => {
  for (const { opener, panel, name } of PANELS) {
    test(`${String(opener)} opens as a named dialog, takes focus, is clean and closes with Escape`, async ({ page }) => {
      test.setTimeout(90_000);
      await startFixture(page);
      const button = page.getByRole('button', { name: opener, exact: typeof opener === 'string' }).first();
      await openWithKeyboard(page, button, panel);

      const dialog = page.locator(panel);
      await expect(dialog).toBeVisible();
      await expect.poll(() => focusIsWithin(page, panel), { message: `focus should be inside ${panel}` }).toBe(true);
      await expect(dialog).toHaveAttribute('role', 'dialog');
      const label = await dialog.getAttribute('aria-label');
      expect(label, `${panel} needs an accessible name`).toBeTruthy();
      if (name) expect(label).toBe(name);

      expect(await auditWithAxe(page, panel), `axe findings on ${panel}`).toEqual([]);
      expect(await findPointerOnlyControls(page, panel), `pointer-only controls on ${panel}`).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
    });
  }

  test('a city panel is keyboard-complete: tabs, queueing production, cycling and closing', async ({ page }) => {
    test.setTimeout(120_000);
    await startFixture(page);
    const cityButton = page.getByRole('button', { name: 'City', exact: true });
    await openWithKeyboard(page, cityButton, '#city-overview-panel');
    const row = page.locator('#city-overview-panel [data-open-city]').first();
    await row.focus();
    await page.keyboard.press('Enter');

    const panel = page.locator('#city-panel');
    await expect(panel).toBeVisible();
    await expect.poll(() => focusIsWithin(page, '#city-panel')).toBe(true);
    await expect(panel).toHaveAttribute('role', 'dialog');
    expect(await panel.getAttribute('aria-label')).toBeTruthy();
    expect(await auditWithAxe(page, '#city-panel'), 'axe findings on the city panel').toEqual([]);
    expect(await findPointerOnlyControls(page, '#city-panel'), 'pointer-only controls in the city panel').toEqual([]);

    // Section switches are toggle buttons that say which one is showing.
    const queueTab = page.locator('#tab-list');
    const districtsTab = page.locator('#tab-districts');
    await expect(queueTab).toHaveAttribute('aria-pressed', 'true');
    await districtsTab.focus();
    await page.keyboard.press('Enter');
    await expect(districtsTab).toHaveAttribute('aria-pressed', 'true');
    await expect(queueTab).toHaveAttribute('aria-pressed', 'false');
    await queueTab.focus();
    await page.keyboard.press('Enter');
    await expect(queueTab).toHaveAttribute('aria-pressed', 'true');

    // Queue something from the keyboard: the build list is real buttons.
    const queueRows = page.locator('[data-queue-action="remove"]');
    const before = await queueRows.count();
    const item = page.locator('#city-panel .build-item').first();
    await item.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-queue-action="remove"]').count(), { message: 'the queue should grow' }).toBeGreaterThan(before);

    await page.getByRole('button', { name: 'Close city panel' }).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveCount(0);
  });

  test('icon-only toolbar buttons have real names and the legend toggle announces its state', async ({ page }) => {
    await startFixture(page);
    for (const name of ['View message log', 'Toggle icon legend', 'Open Wonder Atlas', 'Toggle supply overlay', 'Pause menu']) {
      await expect(page.getByRole('button', { name, exact: true }), name).toBeVisible();
    }

    const toggle = page.getByRole('button', { name: 'Toggle icon legend', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Map legend' })).toBeVisible();
    // Non-modal: the toggle keeps keyboard focus and a second press closes it.
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Map legend' })).toBeHidden();
  });

  test('the pause menu groups its settings, labels both difficulty selectors, and is a safe modal', async ({ page }) => {
    test.setTimeout(90_000);
    await startFixture(page);
    await page.getByRole('button', { name: 'Pause menu', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Return to Game' })).toBeFocused();

    for (const group of ['Audio', 'Supply Warnings', 'Superweapons', 'Opponent challenge', 'Your personal difficulty']) {
      await expect(page.getByRole('group', { name: group, exact: true }), group).toBeVisible();
    }

    // "New Game…" asks first: Cancel is where focus lands and what Escape answers, never the destructive choice.
    await page.getByRole('button', { name: 'New Game…' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Return to Game' })).toBeFocused();
    await expect(page.locator('#pause-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toHaveCount(0);
  });

  test('save from the pause menu with the keyboard, reload, and continue the same campaign', async ({ page }) => {
    test.setTimeout(120_000);
    await startFixture(page);
    await page.getByRole('button', { name: 'Pause menu', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save Game' }).focus();
    await page.keyboard.press('Enter');

    const savePanel = page.locator('#save-panel');
    await expect(savePanel).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Save name' })).toBeFocused();
    expect(await auditWithAxe(page, '#save-panel'), 'axe findings on the save dialog').toEqual([]);
    await page.keyboard.type('a11y keyboard save');
    await page.getByRole('button', { name: 'Save', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(savePanel).toHaveCount(0, { timeout: 15_000 });

    // Return to Game closes the pause menu; focus goes back to the toolbar control that opened it.
    await page.getByRole('button', { name: 'Return to Game' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pause-menu')).toHaveCount(0);

    // Reload and continue: the menu offers Continue first-class and the campaign comes back.
    await page.reload();
    await expect(page.locator('#save-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    // The menu now has a saved game: it must be clean too (the Load/Delete/Continue buttons used to fail contrast).
    expect(await auditWithAxe(page, '#save-panel'), 'axe findings on the menu with saved games').toEqual([]);
    await page.getByRole('button', { name: 'Continue', exact: true }).focus();
    await page.keyboard.press('Enter');
    // A campaign saved earlier needs no opponent-challenge prompt; an older one does. Either way, no pointer.
    const endTurn = page.getByRole('button', { name: 'End Turn', exact: true });
    const challenge = page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]');
    await expect.poll(async () => (await endTurn.isVisible()) || (await challenge.isVisible()), { timeout: 30_000 }).toBe(true);
    if (!(await endTurn.isVisible())) {
      await challenge.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Continue Campaign', exact: true }).focus();
      await page.keyboard.press('Enter');
    }
    await expect(endTurn).toBeVisible();
  });
});
