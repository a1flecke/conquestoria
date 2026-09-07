import { expect, test, type Page } from '@playwright/test';
import { hexKey } from '@/systems/hex-utils';
import { getAvailableTechs } from '@/systems/tech-system';
import { installAutosave } from './helpers/save-fixture';
import { addAuditCompact, makeMinorCivLeagueAuditFixture } from '../systems/helpers/minor-civ-league-audit-fixture';

function fixture() {
  const { state, firstId, secondId } = makeMinorCivLeagueAuditFixture('mc-496-e2e-disclosure');
  const compacted = addAuditCompact(state, firstId, secondId);
  compacted.tutorial.active = false;
  compacted.settings.tutorialEnabled = false;
  compacted.civilizations.player.techState.currentResearch = getAvailableTechs(
    compacted.civilizations.player.techState,
  )[0]?.id ?? null;
  compacted.civilizations.player.visibility.tiles[hexKey(compacted.cities[compacted.minorCivs[firstId]!.cityId]!.position)] = 'fog';
  return compacted;
}

async function enterAutosave(page: Page): Promise<void> {
  const state = fixture();
  await installAutosave(page, state);
  await page.goto('/?e2e=autosave');
  await expect.poll(
    () => page.evaluate(() => (
      window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness().includes('campaign-ready') ?? false
    )),
    { timeout: 15_000, message: 'expected the compact fixture to reach campaign-ready' },
  ).toBe(true);
}

test('opens, keyboard-toggles, and reopens the safe compact disclosure on desktop', async ({ page }) => {
  await enterAutosave(page);
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();

  const panel = page.locator('#diplomacy-panel');
  const details = panel.locator('details.minor-civ-compact-details');
  const summary = details.locator('summary');
  await expect(summary).toHaveText('About this compact');
  await expect(panel).toContainText('Other members not yet met.');
  await expect(details).not.toHaveAttribute('open', '');

  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open', '');

  await panel.locator('#diplo-close').click();
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();
  await expect(panel.locator('details.minor-civ-compact-details summary')).toHaveText('About this compact');
});

test('keeps compact disclosure readable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAutosave(page);
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();

  const details = page.locator('#diplomacy-panel details.minor-civ-compact-details');
  await details.locator('summary').click();
  await expect(details).toContainText('Each city-state makes its own peace and war decisions.');
  await expect(details).toContainText('Other members not yet met.');
});
