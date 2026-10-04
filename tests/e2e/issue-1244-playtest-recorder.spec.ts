import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openPrimaryPanel, requestEndTurn } from './helpers/primary-action-bar';

// #1244: the local-only playtest recorder, driven through a real Continue Campaign load.
//   - flag off (no query, or any value but 1): no recorder, no export button -- nothing changes;
//   - ?playtest=1: play real end-turns, use the Council and a card action, then export through the
//     real download path and check the metrics in the downloaded JSON.
// The crowded-map save has one city; its land is turned to desert so the Council has a real,
// actionable "Open city" card to act on. The city keeps a long queue and the civ a research target so
// the game's own required-choice prompts do not cover the HUD.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript((fixtureText) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    civ.techState.currentResearch = 'natural-philosophy';
    for (const cityId of civ.cities) {
      fixture.cities[cityId].productionQueue = ['warrior', 'warrior', 'warrior', 'warrior'];
    }
    for (const tile of Object.values(fixture.map.tiles) as Array<Record<string, unknown>>) {
      tile.terrain = 'desert';
      tile.improvement = 'none';
      tile.improvementTurnsLeft = 0;
      tile.resource = null;
    }
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, FIXTURE_TEXT);
}

async function continueFixture(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  await expect(page.getByRole('dialog', { name: 'Choose Opponent Challenge' })).toBeVisible();
  await page.locator(
    '[data-opponent-challenge-selector="migration"] [data-challenge="standard"]',
  ).click();
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  await expect(continueButton).toBeHidden();
}

/**
 * One real end turn, handled the way a player handles the game's prompts: press End Turn; if the game
 * asks for a production choice take its recommendation and press End Turn again; confirm the
 * unmoved-units prompt; and wait for the new turn to begin.
 */
async function endTurn(page: Page, nextTurn: number): Promise<void> {
  const newTurn = page.getByText(new RegExp(`^Turn ${nextTurn} ·`));
  const warning = page.locator('#end-turn-warning-panel');
  const requiredChoice = page.locator('#required-choice-panel');
  const visibleOutcome = warning.or(requiredChoice).or(newTurn).first();

  // The game opens its end-of-round prompt (production choice) on its own schedule, sometimes just
  // after the new turn's HUD appears. Each request is accepted only when the button becomes busy or
  // one of these semantic outcomes appears; resolving the click task alone is not success.
  const pressEndTurn = async (): Promise<void> => {
    if (await requiredChoice.count() > 0) {
      await requiredChoice.getByRole('button', { name: /turns?$/ }).first().click({ timeout: 2_000 });
      await expect(requiredChoice).toHaveCount(0, { timeout: 2_000 });
    }
    await requestEndTurn(page, visibleOutcome);
  };

  await pressEndTurn();
  for (let prompt = 0; prompt < 5; prompt++) {
    await warning.or(requiredChoice).or(newTurn).first().waitFor({ timeout: 30_000 });
    if (await newTurn.count() > 0) return;
    if (await requiredChoice.count() > 0) {
      await pressEndTurn();
      continue;
    }
    await warning.getByRole('button', { name: /end turn anyway/i }).click();
  }
  await expect(newTurn).toBeVisible({ timeout: 30_000 });
}

test.describe('playtest recorder (#1244)', () => {
  for (const query of ['', '?playtest=0', '?playtest=true']) {
    test(`flag off (${query || 'no query'}): no export button, game plays as normal`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await installFixture(page);
      await continueFixture(page, query);
      await openPrimaryPanel(page, 'Council', '#council-panel');

      await expect(page.locator('[data-role="playtest-export"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Export playtest log' })).toHaveCount(0);
    });
  }

  test('?playtest=1: plays two turns, uses the Council, and exports the metrics as local JSON', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFixture(page);
    await continueFixture(page, '?playtest=1');

    const exportButton = page.getByRole('button', { name: 'Export playtest log' });
    await expect(exportButton).toBeVisible();

    // Turn 1: open the Council, act on its starving-city card.
    await openPrimaryPanel(page, 'Council', '#council-panel');
    await page.locator('#council-panel').getByRole('button', { name: 'Open city', exact: true }).click();
    await expect(page.locator('#city-panel')).toBeVisible();
    // The city panel covers the End Turn button, as it would for a real player: close it first.
    await page.locator('#city-close').click();
    await expect(page.locator('#city-panel')).toHaveCount(0);

    await endTurn(page, 43);
    await endTurn(page, 44);

    // The game may still be showing its end-of-round "Choose Production" prompt over the screen; a
    // player answers it before reaching for the export button, so the click retries around it.
    const requiredChoice = page.locator('#required-choice-panel');
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await expect(async () => {
      if (await requiredChoice.count() > 0) {
        await requiredChoice.getByRole('button', { name: /turns?$/ }).first().click({ timeout: 2_000 });
        await expect(requiredChoice).toHaveCount(0, { timeout: 2_000 });
      }
      await exportButton.click({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('conquestoria-playtest-log.json');
    const exportedText = readFileSync((await download.path())!, 'utf8');
    // Optional: keep the real exported file (e.g. to attach a sample to a PR).
    if (process.env.PLAYTEST_SAMPLE_OUT) writeFileSync(process.env.PLAYTEST_SAMPLE_OUT, exportedText);
    const log = JSON.parse(exportedText);
    await expect(page.getByText('Playtest log saved on this device.')).toBeVisible();

    expect(log).toMatchObject({ schema: 'conquestoria-playtest-log', schemaVersion: 1 });
    expect(log.note).toContain('Local only');
    expect(log.games).toHaveLength(1);
    const seats = Object.values(log.games[0].seats) as Array<{ turns: Array<Record<string, any>>; constraintLifetimes: unknown[] }>;
    expect(seats).toHaveLength(1);
    const turns = seats[0].turns;

    // Turns 42 and 43 were ended by the player; turn 44 is the turn in progress at export.
    expect(turns.map(row => row.turn)).toEqual([42, 43, 44]);
    expect(turns.map(row => row.closed)).toEqual([true, true, false]);
    expect(turns[0].endRequested).toBe(true);
    expect(turns[1].endRequested).toBe(true);
    expect(turns[2].endRequested).toBe(false);
    for (const row of turns.slice(0, 2)) {
      expect(row.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof row.idleCitiesAtEnd).toBe('number');
      expect(typeof row.idleUnitsAtEnd).toBe('number');
      expect(typeof row.goldAtEnd).toBe('number');
    }
    // The crowded save has unmoved units; the end-turn prompt and the recorder use the same predicate.
    expect(turns[0].idleUnitsAtEnd).toBeGreaterThan(0);

    // Turn 42: the Council was opened, its cards counted, and the card action recorded.
    expect(turns[0].panelOpens.council).toBeGreaterThanOrEqual(1);
    expect(turns[0].panelOpens.city).toBeGreaterThanOrEqual(1);
    expect(turns[0].council.cardsShown).toBeGreaterThan(0);
    expect(turns[0].council.constraintKindsShown).toContain('food');
    expect(turns[0].council.actionsTaken).toEqual(['constraint-food']);
    expect(turns[0].constraintsShown).toContain('food');
    // Turn 43 did not open the Council.
    expect(turns[1].council.cardsShown).toBe(0);
    // The starving city's problem was first seen on turn 42 and was still there at the last turn start.
    expect(seats[0].constraintLifetimes).toEqual(expect.arrayContaining([
      { kind: 'food', firstSeenTurn: 42, resolvedTurn: null, turnsToResolve: null },
    ]));

    // Local only: nothing identifies a person or a device.
    const text = JSON.stringify(log);
    expect(text).not.toMatch(/userAgent|http:|https:|email/i);
  });
});
