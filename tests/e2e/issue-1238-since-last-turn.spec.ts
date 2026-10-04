import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// #1238: the Council's "Since your last turn" section, driven through a real Continue Campaign load.
// The crowded-map save has one city. Its land is turned to desert (so food has become a problem)
// and, in the first test, a baseline digest recorded when the empire was healthy is stored with the
// save, exactly as ending a turn would have written it. The second test loads the same world with
// no digest (an old save) and must show no section at all.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page, withBaseline: boolean): Promise<void> {
  await page.addInitScript(({ fixtureText, baseline }) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    // The game's own required-choice prompt would cover the Council button, so the city keeps a
    // queue and the civ a research target; only the starvation is staged.
    civ.techState.currentResearch = 'natural-philosophy';
    for (const cityId of civ.cities) fixture.cities[cityId].productionQueue = ['warrior'];
    // Every tile: the load path recomputes territory, so a city can gain tiles the save did not list.
    for (const tile of Object.values(fixture.map.tiles) as Array<Record<string, unknown>>) {
      tile.terrain = 'desert';
      tile.improvement = 'none';
      tile.improvementTurnsLeft = 0;
      tile.resource = null;
    }
    if (baseline) {
      fixture.assessmentDigestByCiv = {
        [fixture.currentPlayer]: { turn: Math.max(0, fixture.turn - 1), constraints: [], victory: [] },
      };
    }
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, { fixtureText: FIXTURE_TEXT, baseline: withBaseline });
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

// The Council button toggles the panel, and the HUD can still be settling right after Continue
// Campaign. Click only while the panel is absent and retry until it is up, so a click that lands
// during startup cannot be mistaken for the feature failing -- and a retry can never close it.
async function openCouncil(page: Page): Promise<void> {
  await expect(async () => {
    if (await page.locator('#council-panel').count() === 0) {
      await page.getByRole('button', { name: /Council/ }).first().click();
    }
    await expect(page.locator('#council-panel')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test('a stored baseline makes the Council say what changed, above Do Now', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixture(page, true);
  await continueFixture(page);
  await openCouncil(page);

  const section = page.locator('#council-panel [data-section="since-last-turn"]');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Since your last turn');
  await expect(section).toContainText('New: Feed Alexandria Metropolitan Works');
  expect(await section.locator('article').count()).toBeLessThanOrEqual(3);

  // The section sits above the Do Now bucket.
  const headings = await page.locator('#council-panel section h3').allTextContents();
  expect(headings.indexOf('Since your last turn')).toBeLessThan(headings.indexOf('Do Now'));

  // Opening the Council does not consume it: closing and reopening shows the same section.
  await page.locator('#council-panel button[aria-label="Close council"]').click();
  await expect(page.locator('#council-panel')).toHaveCount(0);
  await openCouncil(page);
  await expect(page.locator('#council-panel [data-section="since-last-turn"]')).toContainText('New: Feed Alexandria Metropolitan Works');
});

test('an old save with no baseline shows no section, but still shows the current constraint', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixture(page, false);
  await continueFixture(page);
  await openCouncil(page);

  await expect(page.locator('#council-panel')).toContainText('Feed Alexandria Metropolitan Works');
  await expect(page.locator('#council-panel [data-section="since-last-turn"]')).toHaveCount(0);
});
