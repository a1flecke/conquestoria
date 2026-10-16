import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

// Shared by the #1459 in-game keyboard specs: start the crowded-map fixture campaign with no pointer, and open a
// panel from its launcher without ever toggling it closed.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

export async function startFixture(page: Page): Promise<void> {
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
  await expectCampaignReady(page);
}

/**
 * The toolbar is in the DOM behind the menu from the first paint, so "End Turn is visible" proves nothing about the
 * campaign having loaded; a key pressed too early lands before the toolbar is wired. Wait for the menu and the
 * opponent-challenge prompt to be gone and for the HUD to be showing a turn.
 */
export async function expectCampaignReady(page: Page): Promise<void> {
  await expect(page.locator('#save-panel')).toHaveCount(0, { timeout: 45_000 });
  await expect(page.locator('#legacy-opponent-challenge-prompt')).toHaveCount(0);
  await expect(page.locator('#hud')).toContainText(/Turn \d+/);
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
}

/**
 * Open a panel from its launcher with the keyboard. The launcher toggles, so a retry is only allowed while the panel
 * is still absent after a generous wait (a press that landed before the toolbar was wired), never as a blind repeat.
 */
export async function openWithKeyboard(page: Page, opener: Locator, panelSelector: string): Promise<void> {
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

