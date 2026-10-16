import { expect, test, type Page } from '@playwright/test';
import { assertScreen, focusIsWithin } from './helpers/a11y-audit';

// #1459: the hot-seat setup stages after "Player Names" (civilization pick, pass-the-device, personal difficulty, review
// and start). issue-1459-pregame-keyboard.spec.ts drives the stages up to the names; these used to be covered only by
// unit tests of what they declare. Keyboard only, same four checks on every screen.

async function activate(page: Page, name: RegExp | string): Promise<void> {
  const button = page.getByRole('button', { name }).first();
  await button.focus();
  await page.keyboard.press('Enter');
}

async function pickCivilization(page: Page, civName: string): Promise<void> {
  const card = page.locator('#civ-select .civ-card', { hasText: civName });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await activate(page, 'Next');
}

test.describe('hot-seat later stages are keyboard-complete', () => {
  test('civilization pick, pass the device, personal difficulty, review and start', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#save-panel')).toBeVisible();

    await activate(page, 'New Game');
    await activate(page, /^Hot Seat/);
    await page.locator('#hotseat-setup .map-size-card[data-size="small"]').focus();
    await page.keyboard.press('Enter');
    await activate(page, 'Next');
    await activate(page, 'Next');
    await page.locator('#hotseat-setup .count-card[data-count="2"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Player Names');
    await page.locator('#hs-names-next').focus();
    await page.keyboard.press('Enter');

    // Player 1 chooses a civilization in the shared picker, which names whose turn it is.
    await assertScreen(page, 'civ-select', { tabs: 20, initial: page.locator('#civ-select .civ-card').first() });
    await expect(page.locator('#civ-select')).toContainText('Player 1, choose your civilization');
    await pickCivilization(page, 'Rome');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Your Personal Difficulty');
    await assertScreen(page, 'hotseat-setup', { tabs: 10 });
    await expect(page.locator('#hotseat-setup [aria-pressed="true"]')).toHaveCount(1);
    await activate(page, 'Next Player');

    // The device is passed: a screen of its own, focused on the single way forward, naming the next player.
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Pass the device to Player 2');
    await assertScreen(page, 'hotseat-setup', { tabs: 4, initial: page.locator('#hs-civ-ready') });
    await expect(page.locator('#hs-civ-ready')).toHaveText("I'm Player 2");
    await page.keyboard.press('Enter');

    // Rome is already taken: its card leaves the tab order instead of being a dead control.
    await assertScreen(page, 'civ-select', { tabs: 20 });
    await expect(page.locator('#civ-select')).toContainText('Player 2, choose your civilization');
    const taken = page.locator('#civ-select .civ-card', { hasText: 'Rome' });
    await expect(taken).toBeDisabled();
    await pickCivilization(page, 'Egypt');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Your Personal Difficulty');
    await assertScreen(page, 'hotseat-setup', { tabs: 10 });
    await activate(page, 'Start Game');

    // Review: a named stage; no control is focused so a stray Enter cannot start the game before it is read.
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Review Campaign');
    await assertScreen(page, 'hotseat-setup', { tabs: 16 });
    const superweapons = page.getByRole('group', { name: /Superweapons/i });
    if (await superweapons.count() > 0) {
      const off = page.locator('[data-superweapons-option="off"]');
      await off.focus();
      await page.keyboard.press('Enter');
      await expect(off).toHaveAttribute('aria-pressed', 'true');
    }

    await page.locator('#hs-review-start').focus();
    await page.keyboard.press('Enter');
    // A crowded roster asks for a second, deliberate confirmation; either way no pointer is used.
    const confirm = page.locator('#hs-review-start');
    if (await confirm.count() > 0 && (await confirm.textContent())?.includes('Crowded')) {
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('#hotseat-setup')).toHaveCount(0, { timeout: 90_000 });
    // A hot-seat campaign opens on the handoff for the first player: keyboard-complete, then the game.
    const handoff = page.locator('#turn-handoff');
    await expect(handoff).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => focusIsWithin(page, '#turn-handoff')).toBe(true);
    await page.locator('#handoff-confirm').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#handoff-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(handoff).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('#hud')).toContainText(/Turn \d+/, { timeout: 90_000 });
  });

  test('Escape from the personal-difficulty and review stages never strands focus on the page body', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#save-panel')).toBeVisible();
    await activate(page, 'New Game');
    await activate(page, /^Hot Seat/);
    await page.locator('#hotseat-setup .map-size-card[data-size="small"]').focus();
    await page.keyboard.press('Enter');
    await activate(page, 'Next');
    await activate(page, 'Next');
    await page.locator('#hotseat-setup .count-card[data-count="2"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#hs-names-next').focus();
    await page.keyboard.press('Enter');
    await pickCivilization(page, 'Rome');

    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Your Personal Difficulty');
    // A decision stage with no Back control ignores Escape: the choice stays and focus stays inside.
    await page.keyboard.press('Escape');
    await expect(page.locator('#hotseat-setup')).toHaveAttribute('aria-label', 'Your Personal Difficulty');
    await assertScreen(page, 'hotseat-setup', { tabs: 4 });
  });
});
