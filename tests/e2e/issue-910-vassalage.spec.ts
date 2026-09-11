import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';
import type { GameState } from '@/core/types';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';
import { applyDiplomaticAction } from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';
import { getAvailableTechs } from '@/systems/tech-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import { installAutosave } from './helpers/save-fixture';

// This fixture mounts a complete small-map campaign. On GitHub's shared Linux
// runners, the first mount has legitimately exceeded the default 30-second
// test budget without reporting a runtime error.
const CAMPAIGN_READY_TIMEOUT_MS = 45_000;

function fixture(vassalHuman = true, overlordHuman = false, hotSeat = false): GameState {
  const state = normalizeLoadedState(makeVassalageFixture(vassalHuman, overlordHuman));
  if (!hotSeat) delete state.hotSeat;
  state.civilizations.third.isHuman = hotSeat;
  state.tutorial.active = false;
  state.settings.tutorialEnabled = false;
  for (const key of Object.keys(state.settings.advisorsEnabled) as Array<keyof typeof state.settings.advisorsEnabled>) state.settings.advisorsEnabled[key] = false;
  for (const civ of Object.values(state.civilizations)) {
    civ.techState.currentResearch = getAvailableTechs(civ.techState)[0]?.id ?? null;
    for (const id of civ.cities) state.cities[id].productionQueue = ['warrior'];
  }
  for (const unit of Object.values(state.units)) { unit.hasActed = true; unit.hasMoved = true; }
  return state;
}

async function enterSoloAutosave(page: Page, state: GameState, testInfo: TestInfo): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAutosave(page, state);
  await page.goto('/?e2e=autosave');
  try {
    await expect.poll(
      () => page.evaluate(() => (
        window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness().includes('campaign-ready') ?? false
      )),
      {
        message: 'expected the installed campaign to finish its E2E startup path',
        timeout: CAMPAIGN_READY_TIMEOUT_MS,
      },
    ).toBe(true);
  } catch (error) {
    await testInfo.attach('e2e-startup-diagnostic.json', {
      body: JSON.stringify({
        readiness: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness() ?? []),
        runtimeErrors: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.errors() ?? []),
        consoleErrors,
        pageErrors,
      }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  }
  await expect(page.locator('#hud')).toContainText(`Turn ${state.turn}`);
}

async function handoff(page: Page) {
  await page.locator('#handoff-confirm').click();
  await page.locator('#handoff-start').click();
  await expect(page.locator('#turn-handoff')).toBeHidden();
}

test('human offers to AI, sees the active role immediately, and cannot declare an independent war', async ({page}, testInfo) => {
  test.slow();
  await enterSoloAutosave(page, fixture(), testInfo);
  await page.getByRole('button', {name: 'Diplo', exact: true}).click();
  await page.getByRole('button', {name: 'Offer Vassalage: Rome', exact: true}).click();
  const panel = page.locator('#diplomacy-panel');
  await expect(panel).toContainText('Your overlord: Rome');
  await expect(panel).toContainText('Protection: 100/100');
  await expect(panel.locator('[data-action="declare_war"]')).toHaveCount(0);
  await expect(panel.locator('[data-treaty-type="vassalage"]')).toHaveCount(0);
});

test('human receives an AI offer, accepts, and confirms release in the live panel', async ({page}, testInfo) => {
  test.slow();
  await page.setViewportSize({width: 390, height: 844});
  let state = fixture(false, true); state.currentPlayer = 'overlord';
  state = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', new EventBus());
  await enterSoloAutosave(page, state, testInfo);
  await page.getByRole('button', {name: 'Diplo', exact: true}).click();
  await page.getByRole('button', {name: 'Accept Vassalage: Egypt', exact: true}).click();
  await expect(page.locator('#diplomacy-panel')).toContainText('Your vassal: Egypt');
  await page.getByRole('button', {name: 'Release Vassal: Egypt', exact: true}).click();
  await expect(page.locator('#diplomacy-panel')).toContainText('Your vassal: Egypt');
  await page.getByRole('button', {name: 'Confirm Release: Egypt', exact: true}).click();
  await expect(page.locator('#diplomacy-panel')).not.toContainText('Your vassal: Egypt');
});

test('hot-seat handoff removes the first player inbox and lets the recipient accept', async ({page}) => {
  test.slow();
  await installAutosave(page, fixture(true, true, true)); await page.goto('/');
  await page.getByRole('button', {name: 'Continue', exact: true}).click();
  await handoff(page);
  await page.getByRole('button', {name: 'Diplo', exact: true}).click();
  await page.getByRole('button', {name: 'Offer Vassalage: Rome', exact: true}).click();
  await expect(page.locator('#diplomacy-panel')).toContainText('Awaiting');
  await page.keyboard.press('e');
  await expect(page.locator('#turn-handoff')).toBeVisible();
  await expect(page.locator('#diplomacy-panel')).toHaveCount(0);
  await handoff(page);
  await page.getByRole('button', {name: 'Diplo', exact: true}).click();
  await page.getByRole('button', {name: 'Accept Vassalage: Egypt', exact: true}).click();
  await expect(page.locator('#diplomacy-panel')).toContainText('Your vassal: Egypt');
});
