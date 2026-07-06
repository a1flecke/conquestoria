import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript((fixtureText) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    civ.gold = 1012;
    civ.techState.currentResearch = 'natural-philosophy';
    fixture.marketplace.purchasedResources = [{
      civId: fixture.currentPlayer,
      resource: 'silk',
      expiresOnTurn: fixture.turn + 10,
    }];
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

async function readTextTops(page: Page): Promise<number[]> {
  return page.locator('[data-role="hud-yields"] > *').evaluateAll(elements =>
    elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().top;
    }),
  );
}

test('Tauri-sized HUD keeps every yield on one visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installFixture(page);
  await continueFixture(page);

  const yieldsRow = page.locator('[data-role="hud-yields"]');
  await expect(yieldsRow).toBeVisible();
  await expect(yieldsRow).toContainText('☺ 1 (stability)');
  const textTops = await readTextTops(page);
  expect(textTops).toHaveLength(5);
  expect(Math.max(...textTops) - Math.min(...textTops)).toBeLessThanOrEqual(1);

  const rowStyles = await yieldsRow.evaluate(element => ({
    alignItems: getComputedStyle(element).alignItems,
    flexWrap: getComputedStyle(element).flexWrap,
  }));
  expect(rowStyles).toEqual({ alignItems: 'center', flexWrap: 'nowrap' });

  const goldButton = yieldsRow.getByRole('button');
  const goldBox = await goldButton.boundingBox();
  expect(goldBox?.height).toBeGreaterThanOrEqual(44);

  const netRow = page.locator('[data-row="net"]');
  await expect(netRow).toBeHidden();
  await goldButton.click();
  await expect(netRow).toBeVisible();
  await goldButton.click();
  await expect(netRow).toBeHidden();

  const replayedTextTops = await readTextTops(page);
  expect(Math.max(...replayedTextTops) - Math.min(...replayedTextTops))
    .toBeLessThanOrEqual(1);
});
