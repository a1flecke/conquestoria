import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';
import { hexKey } from '@/systems/hex-utils';
import { getAvailableTechs } from '@/systems/tech-system';
import { installAutosave } from './helpers/save-fixture';
import { addAuditCompact, makeMinorCivLeagueAuditFixture } from '../systems/helpers/minor-civ-league-audit-fixture';

const CAMPAIGN_READY_TIMEOUT_MS = 45_000;

interface DiplomacyPanelDiagnostic {
  readiness: readonly string[];
  panelExists: boolean;
  panelText: string;
  compactDetailCount: number;
  compactSummaryTexts: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

interface StartupDiagnostic {
  readiness: readonly string[];
  runtimeErrors: readonly string[];
  consoleErrors: readonly string[];
  pageErrors: readonly string[];
}

function captureBrowserErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

async function attachDiplomacyPanelDiagnostic(
  page: Page,
  testInfo: TestInfo,
  browserErrors: { consoleErrors: string[]; pageErrors: string[] },
): Promise<void> {
  const rendered = await page.evaluate(() => {
    const panel = document.querySelector('#diplomacy-panel');
    const summaries = [...document.querySelectorAll('#diplomacy-panel details.minor-civ-compact-details summary')]
      .map(summary => summary.textContent ?? '');
    return {
      readiness: window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness() ?? [],
      panelExists: panel !== null,
      panelText: (panel?.textContent ?? '').slice(0, 4_000),
      compactDetailCount: panel?.querySelectorAll('details.minor-civ-compact-details').length ?? 0,
      compactSummaryTexts: summaries,
    };
  });
  const diagnostic: DiplomacyPanelDiagnostic = {
    ...rendered,
    consoleErrors: browserErrors.consoleErrors,
    pageErrors: browserErrors.pageErrors,
  };
  await testInfo.attach('diplomacy-panel-diagnostic.json', {
    body: JSON.stringify(diagnostic, null, 2),
    contentType: 'application/json',
  });
}

async function attachStartupDiagnostic(
  page: Page,
  testInfo: TestInfo,
  browserErrors: { consoleErrors: string[]; pageErrors: string[] },
): Promise<void> {
  const diagnostic: StartupDiagnostic = {
    readiness: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness() ?? []),
    runtimeErrors: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.errors() ?? []),
    consoleErrors: browserErrors.consoleErrors,
    pageErrors: browserErrors.pageErrors,
  };
  await testInfo.attach('e2e-startup-diagnostic.json', {
    body: JSON.stringify(diagnostic, null, 2),
    contentType: 'application/json',
  });
}

async function expectCompactSummary(
  page: Page,
  testInfo: TestInfo,
  browserErrors: { consoleErrors: string[]; pageErrors: string[] },
): Promise<void> {
  try {
    await expect(page.locator('#diplomacy-panel details.minor-civ-compact-details summary'))
      .toHaveText('About this compact');
  } catch (error) {
    await attachDiplomacyPanelDiagnostic(page, testInfo, browserErrors);
    throw error;
  }
}

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

async function enterAutosave(
  page: Page,
  testInfo: TestInfo,
  browserErrors: { consoleErrors: string[]; pageErrors: string[] },
): Promise<void> {
  const state = fixture();
  await installAutosave(page, state);
  await page.goto('/?e2e=autosave');
  try {
    await expect.poll(
      () => page.evaluate(() => (
        window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness().includes('campaign-ready') ?? false
      )),
      {
        timeout: CAMPAIGN_READY_TIMEOUT_MS,
        message: 'expected the compact fixture to reach campaign-ready',
      },
    ).toBe(true);
  } catch (error) {
    await attachStartupDiagnostic(page, testInfo, browserErrors);
    throw error;
  }
}

test('opens, keyboard-toggles, and reopens the safe compact disclosure on desktop', async ({ page }, testInfo) => {
  test.slow();
  const browserErrors = captureBrowserErrors(page);
  await enterAutosave(page, testInfo, browserErrors);
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();

  const panel = page.locator('#diplomacy-panel');
  const details = panel.locator('details.minor-civ-compact-details');
  const summary = details.locator('summary');
  await expectCompactSummary(page, testInfo, browserErrors);
  await expect(panel).toContainText('Other members not yet met.');
  await expect(details).not.toHaveAttribute('open', '');

  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open', '');

  await panel.locator('#diplo-close').click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();
  await expectCompactSummary(page, testInfo, browserErrors);
});

test('keeps compact disclosure readable at 390px', async ({ page }, testInfo) => {
  test.slow();
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterAutosave(page, testInfo, browserErrors);
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();

  const details = page.locator('#diplomacy-panel details.minor-civ-compact-details');
  await details.locator('summary').click();
  await expect(details).toContainText('Each city-state makes its own peace and war decisions.');
  await expect(details).toContainText('Other members not yet met.');
});
