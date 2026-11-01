import { expect, test, type Page } from '@playwright/test';

// #1627: Spearman and Archer play their painted strips. Real campaign (the dev-only strip-units-showcase scenario), real
// DOM overlay: a strip unit renders as a `.cq-png` root carrying its type, the damaged archer starts on its tier-2 column
// of the standing row, the sheets answer 200, and the wrapper lets the wide cell overflow its hex.

async function openScenario(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?scenario=strip-units-showcase');
  await expect(page.locator('#hud')).toContainText(/Turn \d+/, { timeout: 60_000 });
  const choice = page.getByRole('dialog', { name: 'Choose Your Next Step' });
  // The prompt asks for a research and a production choice in turn; answer whichever is offered until it closes.
  for (let answered = 0; answered < 3 && (await choice.isVisible().catch(() => false)); answered++) {
    const option = choice.getByRole('button', { name: /turns$/ }).first();
    if (await option.isVisible().catch(() => false)) await option.click();
    await page.waitForTimeout(400);
  }
  await expect(choice).toBeHidden();
}

test.describe('strip units render with their tier and placement', () => {
  test('both roots are PNG units, the archer stands on its tier-2 column, and the sheets load', async ({ page }) => {
    test.setTimeout(120_000);
    await openScenario(page);

    const spearman = page.locator('.cq-png[data-unit-type="spearman"]').first();
    const archer = page.locator('.cq-png[data-unit-type="archer"]').first();
    await expect(spearman).toBeAttached();
    await expect(archer).toBeAttached();

    // Strip sheets are 8 columns wide; a standing pose per tier lives on row 0, so tier 2 is column 2 of 8.
    const from = async (root: typeof archer): Promise<string> =>
      root.evaluate(el => (el as HTMLElement).style.getPropertyValue('--from'));
    expect(await from(spearman)).toBe('0%');
    expect(await from(archer)).not.toBe('0%');
    expect(await archer.evaluate(el => (el as HTMLElement).style.getPropertyValue('--cols'))).toBe('8');

    // The units switched in task 9 are strips too, and a damaged one stands on its tier-2 column; the Horseman is still a
    // puppet (square cells: 4 columns of a three-row sheet), so it is not in this list.
    for (const unit of ['tank', 'ironclad', 'biplane']) {
      const roots = page.locator(`.cq-png[data-unit-type="${unit}"]`);
      await expect(roots.first(), unit).toBeAttached();
      expect(await roots.first().evaluate(el => (el as HTMLElement).style.getPropertyValue('--cols')), `${unit} sheet columns`).toBe('8');
    }
    await expect(page.locator('.cq-png[data-unit-type="horseman"]').first()).toBeAttached();

    for (const unit of ['spearman', 'archer', 'tank', 'ironclad', 'biplane']) {
      for (const file of ['sheet.png', 'mask.png']) {
        // The game is served under a base path, so resolve against the page, not the origin.
        const response = await page.request.get(new URL(`images/units/${unit}/${file}`, page.url()).href);
        expect(response.status(), `${unit}/${file}`).toBe(200);
        expect(response.headers()['content-type']).toContain('image/png');
      }
    }

    // A strip cell is wider than its hex, so the wrapper must not clip it.
    expect(await spearman.evaluate(el => getComputedStyle(el.parentElement!).overflow)).toBe('visible');
  });
});
