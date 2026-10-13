import { expect, test, type Page, type Request } from '@playwright/test';

// #1456: the Earth / Old World / New World tile tables are separate JSON files fetched on demand. The title
// and mode screens fetch none; the solo setup prefetches the selected map in the background so Start finds it
// ready; a failed fetch keeps the setup open with a working retry and never starts a different map.

const GEO_DATA = /\/(earth|old-world|new-world)-map[^/]*\.json/;

// A service worker would answer the data request itself and hide it from page.route; this spec is about the
// page's own requests (offline behaviour through the worker is verified against the production build).
test.use({ serviceWorkers: 'block' });

function trackGeoRequests(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (request: Request) => {
    if (GEO_DATA.test(request.url())) seen.push(request.url());
  });
  return () => [...seen];
}

async function openModeSelect(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-action="choose-solo-mode"]').waitFor({ state: 'visible' });
}

async function openSoloSetup(page: Page): Promise<void> {
  await openModeSelect(page);
  await page.locator('[data-action="choose-solo-mode"]').click();
  await page.getByRole('button', { name: 'Choose civilization' }).click();
  await page.locator('.civ-card').first().click();
  await page.locator('#civ-start').click();
}

const startCampaign = (page: Page) => page.getByRole('button', { name: 'Start Campaign', exact: true });
const earthRequests = (urls: string[]) => urls.filter(url => /earth-map/.test(url));
const otherGeoRequests = (urls: string[]) => urls.filter(url => /old-world-map|new-world-map/.test(url));

test('the mode screen fetches no geography; the Earth setup prefetches only Earth, once', async ({ page }) => {
  test.setTimeout(60_000);
  const geoRequests = trackGeoRequests(page);
  await openModeSelect(page);
  expect(geoRequests()).toEqual([]);

  await page.locator('[data-action="choose-solo-mode"]').click();
  await expect.poll(() => earthRequests(geoRequests()).length).toBe(1);

  await page.getByRole('button', { name: 'Choose civilization' }).click();
  await page.locator('.civ-card').first().click();
  await page.locator('#civ-start').click();
  await expect(startCampaign(page)).toBeEnabled();
  await startCampaign(page).click();
  await expect(page.getByText(/^Turn 1\b/)).toBeVisible({ timeout: 30_000 });

  expect(earthRequests(geoRequests())).toHaveLength(1);
  expect(otherGeoRequests(geoRequests())).toEqual([]);
});

test('choosing the Old World fetches it, and still only one file per map', async ({ page }) => {
  test.setTimeout(60_000);
  const geoRequests = trackGeoRequests(page);
  await openSoloSetup(page);
  await page.locator('[data-map-script="old-world"]').click();
  await expect.poll(() => otherGeoRequests(geoRequests()).length).toBe(1);
  await startCampaign(page).click();
  await expect(page.getByText(/^Turn 1\b/)).toBeVisible({ timeout: 30_000 });
  expect(otherGeoRequests(geoRequests())).toHaveLength(1);
  expect(earthRequests(geoRequests()).length).toBeLessThanOrEqual(1);
});

test('a non-geographic map never fetches Old World or New World data and starts normally', async ({ page }) => {
  test.setTimeout(60_000);
  const geoRequests = trackGeoRequests(page);
  await openSoloSetup(page);
  await page.locator('[data-map-script="balanced"]').click();
  await startCampaign(page).click();
  await expect(page.getByText(/^Turn 1\b/)).toBeVisible({ timeout: 30_000 });
  expect(otherGeoRequests(geoRequests())).toEqual([]);
});

test('a failed map load keeps the setup open with a retry, and retrying starts the same map', async ({ page }) => {
  test.setTimeout(60_000);
  // Fail from the start, so the background prefetch fails too: it is silent, and Start asks again.
  await page.route(GEO_DATA, route => route.abort());
  await openSoloSetup(page);
  await expect(startCampaign(page)).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'could not be loaded' })).toHaveCount(0);

  await startCampaign(page).click();
  const alert = page.getByRole('alert').filter({ hasText: 'could not be loaded' });
  await expect(alert).toBeVisible();
  await expect(startCampaign(page)).toBeEnabled();
  // No campaign began: the HUD's turn line only exists once a game is running.
  await expect(page.getByText(/^Turn \d+/)).toHaveCount(0);

  await page.unroute(GEO_DATA);
  await startCampaign(page).click();
  await expect(page.getByText(/^Turn 1\b/)).toBeVisible({ timeout: 30_000 });
});
