import { expect, test, type Page } from '@playwright/test';
import { createNeutralCityProductionMaterials } from '@/core/types/commerce';
import { createScenarioState, installAutosave } from './helpers/save-fixture';
import { openPrimaryPanel, requestEndTurn } from './helpers/primary-action-bar';

/**
 * #1507 MR10 — the live finite soft-material term.
 *
 * The fixture starts with a factory queued, coal access and exactly five free coal. The real
 * commerce-resources phase reserves that allotment on the next completed round; the city panel
 * must explain the 20% term and the Supplies row must show the committed stock. Removing the
 * active item releases it.
 */

function buildFixture() {
  const state = createScenarioState('unit');
  delete state.opponentChallenge;
  const civ = state.civilizations[state.currentPlayer];
  civ.techState.completed = [...new Set([...civ.techState.completed, 'steam-power', 'steel-production'])];
  civ.techState.currentResearch = 'natural-philosophy';

  const city = Object.values(state.cities).find(candidate => candidate.owner === state.currentPlayer);
  if (!city) throw new Error('fixture requires a player city');
  city.productionQueue = ['factory'];
  city.productionProgress = 0;
  city.productionMaterials = createNeutralCityProductionMaterials();

  // #1516 MR19: a real coal outpost replaces the retired purchased-access shortcut.
  const coalKey = `${city.position.q},${city.position.r}`;
  state.map.tiles[coalKey] = { ...state.map.tiles[coalKey], resource: 'coal' } as never;
  state.materialReservesByCiv = {
    [state.currentPlayer]: {
      balances: { 'resource:coal': { native: 5, imported: 0 } },
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };
  return state;
}

async function continueCampaign(page: Page): Promise<void> {
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  const challenge = page.getByRole('dialog', { name: 'Choose Opponent Challenge' });
  await challenge.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await challenge.isVisible()) {
    await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();
    await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  }
  await expect(continueButton).toBeHidden();
  await expect(page.locator('#hud')).toContainText(/Turn \d+/);
}

async function dismissWarning(page: Page): Promise<void> {
  const warning = page.locator('#end-turn-warning-panel');
  if (await warning.count() > 0) {
    await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(warning).toHaveCount(0);
  }
}

async function endTurn(page: Page): Promise<void> {
  const hud = await page.locator('#hud').textContent();
  const nextTurn = Number(/Turn (\d+)/.exec(hud ?? '')![1]) + 1;
  const newTurn = page.getByText(new RegExp(`^Turn ${nextTurn} ·`));
  const warning = page.locator('#end-turn-warning-panel');
  const requiredChoice = page.locator('#required-choice-panel');
  const outcome = warning.or(requiredChoice).or(newTurn).first();

  const press = async (): Promise<void> => {
    if (await requiredChoice.count() > 0) {
      await requiredChoice.getByRole('button', { name: /turns?$/ }).first().click({ timeout: 2_000 });
      await expect(requiredChoice).toHaveCount(0, { timeout: 2_000 });
    }
    await requestEndTurn(page, outcome);
  };

  await press();
  for (let prompt = 0; prompt < 5; prompt++) {
    await warning.or(requiredChoice).or(newTurn).first().waitFor({ timeout: 30_000 });
    if (await newTurn.count() > 0) {
      await page.waitForTimeout(300);
      await dismissWarning(page);
      return;
    }
    if (await requiredChoice.count() > 0) {
      await press();
      continue;
    }
    await warning.getByRole('button', { name: /end turn anyway/i }).click();
    await press();
  }
  await expect(newTurn).toBeVisible({ timeout: 30_000 });
}

async function openCityPanel(page: Page): Promise<void> {
  await dismissWarning(page);
  await openPrimaryPanel(page, 'City', '#city-overview-panel');
  await page.locator('#city-overview-panel [data-open-city]').first().click();
  await expect(page.locator('#city-panel')).toBeVisible();
}

test('a finite soft term is reserved and explained in the live panels', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installAutosave(page, buildFixture());
  await continueCampaign(page);

  // The active factory has no soft snapshot until a real round syncs it.
  await openCityPanel(page);
  await expect(page.locator('#city-panel [data-active-soft-terms]')).toHaveCount(0);
  await page.locator('#city-close').click();

  await endTurn(page);

  await openCityPanel(page);
  const soft = page.locator('#city-panel [data-active-soft-terms]');
  await expect(soft).toContainText('20% cheaper');
  await expect(soft).toContainText('5 Coal reserved');
  await page.locator('#city-close').click();

  await dismissWarning(page);
  await openPrimaryPanel(page, 'Trade', '#marketplace-panel');
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:coal"]')).toContainText('5 committed');
  // The real source also extracts 2 this round, so the visible free stock is 2 rather than 0.
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:coal"]')).toContainText('2 free');
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:coal"]')).toContainText('1 source');
  await page.locator('#mp-close').click();
});
