import { expect, test, type Page } from '@playwright/test';
import { createNeutralCityProductionMaterials } from '@/core/types/commerce';
import { createScenarioState, installAutosave } from './helpers/save-fixture';
import { openPrimaryPanel, requestEndTurn } from './helpers/primary-action-bar';

/**
 * #1506 MR09 task 9 — the live Supplies reserve model and city material rows.
 *
 * The fixture starts with one city whose active head is a 10-iron swordsman and a granary behind it,
 * exactly one eligible city-center iron source and no stored iron. Everything else (the round phase,
 * the commitment owner, the panel subscriptions) is the real game path: no test-only mutation once
 * the campaign is running.
 */

const iron = 'resource:iron';

function buildFixture() {
  const state = createScenarioState('unit');
  // Match the other save-fixture specs: leave the choice open so Continue asks for the challenge.
  delete state.opponentChallenge;
  const civ = state.civilizations[state.currentPlayer];
  civ.techState.completed = [...new Set([...civ.techState.completed, 'bronze-working'])];
  civ.techState.currentResearch = 'natural-philosophy';

  const city = Object.values(state.cities).find(candidate => candidate.owner === state.currentPlayer);
  if (!city) throw new Error('fixture requires a player city');
  city.productionQueue = ['swordsman', 'granary'];
  city.productionProgress = 0;
  city.productionMaterials = createNeutralCityProductionMaterials();
  if (!city.ownedTiles.some(coord => coord.q === city.position.q && coord.r === city.position.r)) {
    city.ownedTiles.push({ ...city.position });
  }
  const center = state.map.tiles[`${city.position.q},${city.position.r}`];
  if (center) center.resource = 'iron';

  state.materialReservesByCiv = {
    [state.currentPlayer]: {
      balances: {},
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
  // A fresh fixture asks for the challenge; an autosave written after it was chosen does not.
  await challenge.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await challenge.isVisible()) {
    await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();
    await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  }
  await expect(continueButton).toBeHidden();
  await expect(page.locator('#hud')).toContainText(/Turn \d+/);
}

async function dismissEndTurnWarning(page: Page): Promise<void> {
  const warning = page.locator('#end-turn-warning-panel');
  if (await warning.count() > 0) {
    await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(warning).toHaveCount(0);
  }
}

async function openCityPanel(page: Page): Promise<void> {
  await dismissEndTurnWarning(page);
  await openPrimaryPanel(page, 'City', '#city-overview-panel');
  await page.locator('#city-overview-panel [data-open-city]').first().click();
  await expect(page.locator('#city-panel')).toBeVisible();
}

async function currentTurn(page: Page): Promise<number> {
  const text = await page.locator('#hud').textContent();
  const match = /Turn (\d+)/.exec(text ?? '');
  if (!match) throw new Error('HUD does not show a turn number');
  return Number(match[1]);
}

/** One real end turn, handling the game's production and unmoved-unit prompts like a player. */
async function endTurn(page: Page, nextTurn: number): Promise<void> {
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
      // On a contended runner the unmoved-unit warning can mount just after the new-turn HUD.
      await page.waitForTimeout(300);
      await dismissEndTurnWarning(page);
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

test('reserves and city material rows survive reorder, removal, a round and a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installAutosave(page, buildFixture());
  await continueCampaign(page);

  // Supplies: the material row is a reserve model, not an Owned/Not-in-inventory boolean.
  await dismissEndTurnWarning(page);
  await openPrimaryPanel(page, 'Trade', '#marketplace-panel');
  const ironRow = page.locator(`#marketplace-panel [data-reserve-good="${iron}"]`);
  await expect(ironRow).toContainText('0/40 units stored');
  await expect(ironRow).toContainText('0 committed');
  await expect(ironRow).toContainText('0 free');
  await expect(ironRow).toContainText('0 incoming');
  await expect(ironRow).toContainText('+2 units/round from 1 source');
  await expect(ironRow).not.toContainText('Not in inventory');
  await page.locator('#mp-close').click();
  await expect(page.locator('#marketplace-panel')).toHaveCount(0);

  // City: the head is waiting with the exact deficit and no completion estimate; the tail is planned.
  await openCityPanel(page);
  const activeMaterials = page.locator('#city-panel [data-active-materials]');
  await expect(activeMaterials).toContainText('Waiting for materials');
  await expect(activeMaterials).toContainText('missing 10');
  await expect(page.locator('#city-panel')).not.toContainText('turns remaining');
  const tail = page.locator('#city-panel div[data-queue-index="1"]');
  await expect(tail).toContainText('Planned, not reserved');
  await expect(tail).not.toContainText('Starts in');
  await page.locator('#city-close').click();

  // One completed round accrues 2 iron and both open panels must refresh from the committed state.
  const firstTurn = await currentTurn(page);
  await endTurn(page, firstTurn + 1);
  await dismissEndTurnWarning(page);
  await openPrimaryPanel(page, 'Trade', '#marketplace-panel');
  await expect(page.locator(`#marketplace-panel [data-reserve-good="${iron}"]`)).toContainText('2/40 units stored');
  await page.locator('#mp-close').click();

  await openCityPanel(page);
  await expect(page.locator('#city-panel [data-active-materials]')).toContainText('missing 8');

  // Reorder the tail to the head, then remove the old head. Controls re-render from committed state.
  await page.locator('#city-panel [data-queue-action="up"][data-queue-index="1"]').click();
  await expect(page.locator('#city-panel')).toContainText('Producing:');
  await expect(page.locator('#city-panel [data-active-materials]')).toHaveCount(0);
  await page.locator('#city-panel [data-queue-action="remove"][data-queue-index="1"]').click();
  await expect(page.locator('#city-panel div[data-queue-index="1"]')).toHaveCount(0);
  await page.locator('#city-close').click();

  // End the turn so the autosave includes the edited queue, then load it back through the real path.
  await endTurn(page, firstTurn + 2);
  await page.reload();
  await continueCampaign(page);
  await openCityPanel(page);
  await expect(page.locator('#city-panel')).toContainText('Granary');
  await expect(page.locator('#city-panel div[data-queue-index="1"]')).toHaveCount(0);
  await expect(page.locator('#city-panel [data-active-materials]')).toHaveCount(0);
});
