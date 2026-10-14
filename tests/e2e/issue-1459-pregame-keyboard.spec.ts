import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin, tabStops } from './helpers/a11y-audit';

// #1459: starting a campaign with no pointer at all, on every pre-game screen. Each step asserts the same four
// things, because each was a real failure before this spec existed:
//   1. focus lands on a real control inside the new screen (it used to stay on the page body, so the next Tab
//      started in the in-game toolbar hidden behind the screen);
//   2. Tab cannot leave the screen (13 in-game buttons used to sit in front of "New Game");
//   3. axe-core finds nothing (an unlabeled text field was a critical failure);
//   4. nothing the pointer can click is unreachable by keyboard (the civilization cards were clickable divs).

async function activate(page: Page, name: RegExp | string): Promise<void> {
  const button = page.getByRole('button', { name }).first();
  await button.focus();
  await page.keyboard.press('Enter');
}

/** The one screen that should own the keyboard right now, by DOM id. */
async function assertScreen(page: Page, id: string, options: { tabs?: number; initial?: Locator } = {}): Promise<void> {
  const screen = page.locator(`#${id}`);
  await expect(screen).toBeVisible();
  await expect.poll(() => focusIsWithin(page, `#${id}`), { message: `focus should be inside #${id}` }).toBe(true);
  // Checked before the Tab loop below moves focus on.
  if (options.initial) await expect(options.initial).toBeFocused();
  await expect(screen).toHaveAttribute('role', 'dialog');
  await expect(screen).toHaveAttribute('aria-modal', 'true');
  expect(await screen.getAttribute('aria-label'), `#${id} needs an accessible name`).toBeTruthy();

  // Tab (and Shift+Tab) wrap inside the screen: never to the in-game toolbar underneath.
  const stops = await tabStops(page, options.tabs ?? 12);
  for (const stop of stops) expect(await focusIsWithin(page, `#${id}`), `Tab left #${id}: ${stop}`).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await focusIsWithin(page, `#${id}`), `Shift+Tab left #${id}`).toBe(true);

  expect(await auditWithAxe(page, `#${id}`), `axe findings on #${id}`).toEqual([]);
  expect(await findPointerOnlyControls(page, `#${id}`), `pointer-only controls on #${id}`).toEqual([]);
}

test.describe('pre-game screens are keyboard-complete', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#save-panel')).toBeVisible();
  });

  test('solo: menu, mode, setup, civilization picker, back out, then start', async ({ page }) => {
    test.setTimeout(120_000);

    // First focus is the primary action; the first Tab from page load must not be in the game toolbar.
    await assertScreen(page, 'save-panel', { initial: page.locator('#btn-new-game') });

    await activate(page, 'New Game');
    await assertScreen(page, 'mode-select', { initial: page.getByRole('textbox', { name: 'Campaign title' }) });

    await activate(page, /^Solo/);
    await assertScreen(page, 'campaign-setup', { tabs: 20, initial: page.locator('#campaign-title') });
    // The selected map and size are announced, not only drawn in gold.
    await expect(page.getByRole('button', { name: /Earth/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Old World/ })).toHaveAttribute('aria-pressed', 'false');

    // The civilization picker is a screen of its own on top: Tab and focus belong to it.
    await activate(page, 'Choose civilization');
    await assertScreen(page, 'civ-select', { tabs: 20, initial: page.locator('#civ-select .civ-card').first() });

    // Pick Rome with the keyboard only.
    const rome = page.locator('#civ-select .civ-card', { hasText: 'Rome' });
    await rome.focus();
    await page.keyboard.press('Enter');
    await expect(rome).toHaveAttribute('aria-pressed', 'true');
    await activate(page, 'Confirm Civilization');
    await expect(page.locator('#civ-select')).toHaveCount(0);

    // Back on the setup screen, focus returns to the control that opened the picker, and the choice is announced.
    await expect(page.getByRole('button', { name: 'Choose civilization' })).toBeFocused();
    await expect(page.locator('#campaign-setup [aria-live="polite"]', { hasText: 'Leading civilization: Rome' })).toBeVisible();

    // Escape steps back one screen at a time and always lands on a control.
    await page.keyboard.press('Escape');
    await assertScreen(page, 'mode-select');
    await page.keyboard.press('Escape');
    // Back out of the whole new-game flow lands on the menu, focused on its primary action.
    await assertScreen(page, 'save-panel', { initial: page.locator('#btn-new-game') });

    // And forward again to start: Start Campaign is reachable and works from the keyboard.
    await activate(page, 'New Game');
    await activate(page, /^Solo/);
    await activate(page, 'Choose civilization');
    await page.locator('#civ-select .civ-card', { hasText: 'Rome' }).focus();
    await page.keyboard.press('Enter');
    await activate(page, 'Confirm Civilization');
    await activate(page, 'Start Campaign');
    await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test('custom civilization editor: labelled fields, pressed traits, Escape goes back', async ({ page }) => {
    test.setTimeout(90_000);
    await activate(page, 'New Game');
    await activate(page, /^Solo/);
    await activate(page, 'Choose civilization');
    await activate(page, 'Create Custom Civilization');
    await assertScreen(page, 'custom-civ-panel', { tabs: 24, initial: page.getByRole('textbox', { name: 'Civilization Name' }) });

    await page.getByRole('button', { name: 'Aggressive', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Aggressive', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('#custom-civ-panel')).toHaveCount(0);
  });

  test('hot seat: every stage takes focus, names its title and goes back with Escape', async ({ page }) => {
    test.setTimeout(150_000);
    await activate(page, 'New Game');
    await activate(page, /^Hot Seat/);

    await assertScreen(page, 'hotseat-setup', { tabs: 6, initial: page.locator('#hotseat-setup .map-size-card').first() });
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Hot Seat Setup');
    await page.locator('#hotseat-setup .map-size-card[data-size="small"]').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Choose Map Type');
    await assertScreen(page, 'hotseat-setup', { tabs: 10 });
    await activate(page, 'Next');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Choose Opponent Challenge');
    await assertScreen(page, 'hotseat-setup', { tabs: 10 });
    await activate(page, 'Next');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'How Many Players?');
    await assertScreen(page, 'hotseat-setup', { tabs: 6 });
    // Escape is Back (the wizard's own back step), never "close the whole wizard".
    await page.keyboard.press('Escape');
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Choose Map Type');
    await activate(page, 'Next');
    await activate(page, 'Next');
    await page.locator('#hotseat-setup .count-card[data-count="2"]').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Player Names');
    await assertScreen(page, 'hotseat-setup', { tabs: 12, initial: page.getByRole('textbox', { name: 'Player 1 name' }) });
    await expect(page.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
