import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '@/core/types';
import { normalizeLoadedState } from '@/storage/save-manager';
import { getAvailableTechs } from '@/systems/tech-system';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin, tabStops } from './helpers/a11y-audit';
import { installAutosave } from './helpers/save-fixture';

// #1459: the hot-seat handoff is the one screen that exists to hide one player's game from the next. These checks
// cover the keyboard path and what assistive technology can still see while the screen is up.

const HANDOFF_CLOSE_TIMEOUT_MS = 20_000;

function hotSeatFixture(): GameState {
  const state = normalizeLoadedState(makeVassalageFixture(true, true));
  state.civilizations.third.isHuman = true;
  state.tutorial.active = false;
  state.settings.tutorialEnabled = false;
  for (const key of Object.keys(state.settings.advisorsEnabled) as Array<keyof typeof state.settings.advisorsEnabled>) {
    state.settings.advisorsEnabled[key] = false;
  }
  for (const civ of Object.values(state.civilizations)) {
    civ.techState.currentResearch = getAvailableTechs(civ.techState)[0]?.id ?? null;
    for (const id of civ.cities) state.cities[id].productionQueue = ['warrior'];
  }
  for (const unit of Object.values(state.units)) { unit.hasActed = true; unit.hasMoved = true; }
  return state;
}

async function continueToHandoff(page: Page): Promise<void> {
  await installAutosave(page, hotSeatFixture());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#turn-handoff')).toBeVisible({ timeout: 45_000 });
}

test('hot-seat handoff is a keyboard-complete, self-contained dialog that hides the game', async ({ page }) => {
  test.slow();
  await continueToHandoff(page);

  const handoff = page.locator('#turn-handoff');
  await expect(handoff).toHaveAttribute('role', 'dialog');
  await expect(handoff).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => focusIsWithin(page, '#turn-handoff'), { message: 'focus starts inside the handoff' }).toBe(true);

  // Everything behind it is out of the accessibility tree and out of the tab order.
  // (The whole UI layer, game shell and any open panel included, is made inert and aria-hidden.)
  await expect(page.locator('#ui-layer')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => (document.getElementById('ui-layer') as HTMLElement & { inert: boolean }).inert)).toBe(true);
  const visibleToAssistiveTech = await page.locator('body').ariaSnapshot();
  for (const gameOnly of ['End Turn', 'Council', 'Tech', 'Diplo', 'Pause menu']) {
    expect(visibleToAssistiveTech, `"${gameOnly}" must not be exposed while the handoff is up`).not.toContain(gameOnly);
  }

  // Tab never leaves the dialog.
  for (const stop of await tabStops(page, 8)) {
    expect(await focusIsWithin(page, '#turn-handoff'), `Tab left the handoff: ${stop}`).toBe(true);
  }
  expect(await auditWithAxe(page, '#turn-handoff'), 'axe findings on the handoff').toEqual([]);
  expect(await findPointerOnlyControls(page, '#turn-handoff')).toEqual([]);

  // Step 1 names the recipient (and nothing about the game), step 2 is theirs alone: both by keyboard.
  const confirm = page.locator('#handoff-confirm');
  await confirm.focus();
  await page.keyboard.press('Enter');
  const start = page.locator('#handoff-start');
  await expect(start).toBeFocused();
  expect(await auditWithAxe(page, '#turn-handoff'), 'axe findings on the recipient summary').toEqual([]);
  await page.keyboard.press('Enter');
  await expect(handoff).toBeHidden({ timeout: HANDOFF_CLOSE_TIMEOUT_MS });

  // The game is back in the tree and the keyboard works: focus is not stranded inside a removed dialog.
  await expect(page.locator('#ui-layer')).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => (document.getElementById('ui-layer') as HTMLElement & { inert: boolean }).inert)).toBe(false);
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible();
  const afterHandoff = await page.evaluate(() => document.activeElement === document.body || document.body.contains(document.activeElement));
  expect(afterHandoff).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body), 'Tab reaches a game control').toBe(true);
});
