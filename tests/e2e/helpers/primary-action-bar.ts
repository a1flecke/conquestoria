import { expect, type Locator, type Page } from '@playwright/test';

/** Opens a primary-action panel and proves the panel, not the click task, completed. */
export async function openPrimaryPanel(
  page: Page,
  buttonName: string,
  panelSelector: string,
  timeout = 15_000,
): Promise<Locator> {
  const panel = page.locator(panelSelector);
  const button = page.getByRole('button', { name: buttonName, exact: true });

  await expect(async () => {
    if (!await panel.isVisible()) {
      await button.click({ timeout: 2_000 });
    }
    await expect(panel).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout });

  return panel;
}

/**
 * Requests one end turn and proves the live UI acknowledged it. A resolved
 * Playwright click is not evidence that the game's callback ran.
 */
export async function requestEndTurn(
  page: Page,
  visibleOutcome: Locator,
  timeout = 30_000,
): Promise<void> {
  const button = page.getByRole('button', { name: 'End Turn', exact: true });
  const busyButton = page.locator('button[aria-label="End Turn"][aria-busy="true"]');
  const accepted = visibleOutcome.or(busyButton).first();

  await expect(async () => {
    if (await accepted.isVisible()) return;
    await button.click({ timeout: 2_000 });
    await expect(accepted).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout });
}
