import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);
const ORIGIN = { q: 17, r: 4 };
const LAND_EXIT = { q: 18, r: 4 };
const WATER_TARGET = { q: 18, r: 3 };

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript((fixtureText) => {
    localStorage.setItem('conquestoria-autosave', fixtureText);
    window.__issue447ToneFrequencies = [];
    window.__issue447AmberFills = 0;

    const originalCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function patchedCreateOscillator() {
      const oscillator = originalCreateOscillator.call(this);
      const originalSetValueAtTime = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
      oscillator.frequency.setValueAtTime = (value, startTime) => {
        window.__issue447ToneFrequencies?.push(value);
        return originalSetValueAtTime(value, startTime);
      };
      return oscillator;
    };

    const originalFill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function patchedFill(
      ...args:
        | [fillRule?: CanvasFillRule]
        | [path: Path2D, fillRule?: CanvasFillRule]
    ) {
      if (String(this.fillStyle) === 'rgba(245, 184, 73, 0.55)') {
        window.__issue447AmberFills = (window.__issue447AmberFills ?? 0) + 1;
      }
      return Reflect.apply(originalFill, this, args);
    };
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
  const requiredChoices = page.locator('#required-choice-panel');
  await expect(requiredChoices).toBeVisible();
  await requiredChoices.locator('section').first().getByRole('button').first().click();
  await expect(requiredChoices).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
}

async function clickVisibleHex(page: Page, coord: { q: number; r: number }): Promise<void> {
  const point = await page.evaluate((target) => (
    window.__CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__?.(target)[0]
  ), coord);
  expect(point, `Expected ${coord.q},${coord.r} to be visible in the live camera`).toBeDefined();
  await page.mouse.click(point!.x, point!.y);
}

async function selectLeadWarrior(page: Page): Promise<void> {
  await clickVisibleHex(page, ORIGIN);
  const leadButton = page.locator(
    '[data-unit-stack-item="true"][data-unit-id="issue-365-lead"]',
  );
  await expect(leadButton).toBeVisible();
  await leadButton.click();
}

test('saved water unit stays selected after a blocked tap and can return ashore', async ({ page }, testInfo) => {
  await installFixture(page);
  await continueFixture(page);
  await selectLeadWarrior(page);
  const guidance = page.locator('[data-water-recovery-kind="recoverable"]');

  await expect(guidance).toContainText('Move to an amber land tile to return ashore.');
  expect(await page.evaluate(() => window.__issue447AmberFills ?? 0)).toBeGreaterThan(0);

  await page.evaluate(() => { window.__issue447ToneFrequencies = []; });
  await clickVisibleHex(page, WATER_TARGET);

  await page.locator('#btn-notif-log').click();
  await expect(page.locator('#notification-log')).toContainText(
    'Move this land unit to an amber land tile to return ashore',
  );
  await page.locator('#close-log').click();
  await expect(guidance).toBeVisible();
  const blockedTapTones = await page.evaluate(() => window.__issue447ToneFrequencies ?? []);
  expect(blockedTapTones).toContain(200);
  expect(blockedTapTones).not.toContain(600);
  await page.screenshot({
    path: testInfo.outputPath('issue-447-desktop-recovery.png'),
    fullPage: true,
  });

  await clickVisibleHex(page, LAND_EXIT);

  await expect(guidance).toHaveCount(0);
  await expect(page.locator(
    '#unit-sprites > [data-entity-id="issue-365-lead"]',
  )).not.toHaveCount(0);
});

test('recovery guidance remains legible and contained on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page);
  await continueFixture(page);
  await selectLeadWarrior(page);

  const guidance = page.locator('[data-water-recovery-kind="recoverable"]');
  await expect(guidance).toBeVisible();
  const box = await guidance.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  expect(await guidance.evaluate(element => getComputedStyle(element).fontSize)).toBe('12px');
  expect(await guidance.getAttribute('role')).toBe('status');
  await page.screenshot({
    path: testInfo.outputPath('issue-447-mobile-recovery.png'),
    fullPage: true,
  });
});

declare global {
  interface Window {
    __issue447ToneFrequencies?: number[];
    __issue447AmberFills?: number;
  }
}
