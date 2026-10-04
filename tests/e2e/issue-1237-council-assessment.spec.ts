import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// #1237: the Council shows the empire assessment, and every button it renders reaches a working panel.
// The crowded-map save has one city; it is made to starve (its land turned to desert) and the civ is
// while the Council still has a real constraint to show. `open-tech` and `open-victory-progress`
// dispatch is covered by tests/app/controllers/panel-actions-controller.test.ts.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript((fixtureText) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    // The game's own required-choice prompt (idle city / no research) would cover the Council button,
    // so the city keeps a queue and the civ keeps a research target; only the starvation is staged.
    civ.techState.currentResearch = 'natural-philosophy';
    for (const cityId of civ.cities) fixture.cities[cityId].productionQueue = ['warrior'];
    // Every tile, not just the city's saved ones: the load path recomputes territory, so a city can
    // gain tiles the save did not list. Desert with no resource or improvement yields no food.
    for (const tile of Object.values(fixture.map.tiles) as Array<Record<string, unknown>>) {
      tile.terrain = 'desert';
      tile.improvement = 'none';
      tile.improvementTurnsLeft = 0;
      tile.resource = null;
    }
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, FIXTURE_TEXT);
}

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
}

// The Council button toggles the panel and the HUD can still be settling right after Continue
// Campaign: click only while the panel is absent, and retry until it is up.
async function openCouncil(page: Page): Promise<void> {
  await expect(async () => {
    if (await page.locator('#council-panel').count() === 0) {
      await page.getByRole('button', { name: /Council/ }).first().click();
    }
    await expect(page.locator('#council-panel')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test('Council names the starving city and its button opens that city', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixture(page);
  await continueFixture(page);
  await openCouncil(page);

  const council = page.locator('#council-panel');
  await expect(council).toContainText('Feed Alexandria Metropolitan Works');
  // The old static filler is gone while a real constraint exists.
  await expect(council).not.toContainText('Shape the economy');
  await expect(council).not.toContainText('Pick a path to victory');

  // The card's button reaches a working destination: the real city panel for the starving city.
  await council.getByRole('button', { name: 'Open city', exact: true }).click();
  await expect(page.locator('#city-panel')).toBeVisible();
  await expect(page.locator('#city-panel')).toContainText('Alexandria Metropolitan Works');
  await expect(page.locator('#council-panel')).toHaveCount(0);
});
