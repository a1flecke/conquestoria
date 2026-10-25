import { expect, test, type Page } from '@playwright/test';
import type { City } from '@/core/types';
import { createScenarioState, findVisibleOwnedCity, installAutosave } from './helpers/save-fixture';
import { openPrimaryPanel, requestEndTurn } from './helpers/primary-action-bar';
import { hexKey } from '@/systems/hex-utils';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1509 MR12 — a live land-route import.
 *
 * The fixture starts with a paid route already assigned and its trader at a permitted supplier one
 * tile from home. The first end turn loads the manifest; the second returns it and only then does the
 * buyer's iron reserve increase. The Trade panel must show the cargo while it is in transit.
 */

const IRON = resourceGoodId('iron');

function buildFixture() {
  const state = createScenarioState('unit');
  const playerCity = findVisibleOwnedCity(state);
  const player = state.civilizations[state.currentPlayer]!;
  const seller = state.civilizations['ai-1']!;
  const sellerPosition = { q: playerCity.position.q + 1, r: playerCity.position.r };
  const sellerCity = {
    ...playerCity,
    id: 'e2e-seller-city',
    name: 'Seller City',
    owner: seller.id,
    position: sellerPosition,
    ownedTiles: [sellerPosition],
    workedTiles: [],
    productionQueue: [],
  } as City;
  state.cities[sellerCity.id] = sellerCity;
  seller.cities = [...seller.cities, sellerCity.id];
  const sellerTile = {
    coord: sellerPosition,
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    owner: seller.id,
  };
  state.map.tiles[hexKey(sellerPosition)] = sellerTile as never;

  player.techState.completed = [...new Set([...player.techState.completed, 'bronze-working'])];
  player.techState.currentResearch = 'natural-philosophy';
  player.techState.researchProgress = 0;
  seller.techState.completed = [...new Set([...seller.techState.completed, 'bronze-working'])];
  const treaty = { type: 'trade_agreement' as const, civA: player.id, civB: seller.id, turnsRemaining: -1 };
  player.diplomacy.treaties = [...player.diplomacy.treaties, treaty];
  seller.diplomacy.treaties = [...seller.diplomacy.treaties, treaty];
  player.diplomacy.relationships[seller.id] = 10;
  player.gold = 1000;

  state.marketplace = {
    ...state.marketplace!,
    tradeRoutes: [{
      id: 'e2e-route',
      fromCityId: playerCity.id,
      toCityId: sellerCity.id,
      foreignCivId: seller.id,
      goldPerTrip: 10,
      turnsPerTrip: 1,
      procurement: {
        orders: [{ goodId: IRON, targetQuantity: 6, maxUnitPrice: 100 }],
      },
    }],
  };
  state.units['e2e-caravan'] = {
    id: 'e2e-caravan',
    type: 'merchant_wagon',
    owner: player.id,
    position: sellerPosition,
    health: 100,
    movementPointsLeft: 3,
    hasActed: false,
    hasMoved: false,
    experience: 0,
    isResting: false,
    committedToRouteId: 'e2e-route',
    routeDirection: 'outbound',
  };
  player.units = [...player.units, 'e2e-caravan'];
  state.commercePermissions = {
    resourceExportGrants: [],
    routeAllowances: [],
    resourcePolicies: [{
      civId: seller.id,
      goodId: IRON,
      protectedReserve: 0,
      partnerCivIds: [player.id],
    }],
  };
  state.materialReservesByCiv = {
    [seller.id]: {
      balances: { [IRON]: { native: 30, imported: 0 } },
      reservations: [],
      incoming: [],
    },
    [player.id]: { balances: {}, reservations: [], incoming: [] },
  };
  return state;
}

async function continueCampaign(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const challenge = page.getByRole('dialog', { name: 'Choose Opponent Challenge' });
  await challenge.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await challenge.isVisible()) {
    await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();
    await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  }
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
      if (await requiredChoice.count() > 0) {
        await requiredChoice.getByRole('button', { name: /turns?$/ }).first().click({ timeout: 2_000 });
        await expect(requiredChoice).toHaveCount(0, { timeout: 2_000 });
      }
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

test('a land route loads cargo, shows it in transit, and delivers it only at home', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installAutosave(page, buildFixture());
  await continueCampaign(page);

  await endTurn(page);
  await openPrimaryPanel(page, 'Trade', '#marketplace-panel');
  await expect(page.locator('#marketplace-panel [data-route-manifest]')).toContainText('6 Iron');
  await expect(page.locator('#marketplace-panel [data-route-manifest]')).toContainText('paid');
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:iron"]')).toContainText('6 incoming');
  await page.locator('#mp-close').click();

  await endTurn(page);
  await openPrimaryPanel(page, 'Trade', '#marketplace-panel');
  await expect(page.locator('#marketplace-panel [data-route-manifest]')).toHaveCount(0);
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:iron"]')).toContainText('6/40 units stored');
  await expect(page.locator('#marketplace-panel [data-reserve-good="resource:iron"]')).toContainText('0 incoming');
  await page.locator('#mp-close').click();
});
