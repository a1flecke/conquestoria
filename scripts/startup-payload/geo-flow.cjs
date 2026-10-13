// usage: node geo-flow.cjs <distDir> <label> <mode: start|offline> [runs] [cpuThrottle]
//  start:   page-clock time from pressing "Start Campaign" (Earth, the default map) to the HUD's "Turn 1" line.
//  offline: visit online so the service worker installs and precaches, go offline, reload, start an Earth
//           game, and check it begins (proves geographic play works with no network after one warm visit).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('@playwright/test');

const [distDir, label, mode, runsArg, throttleArg, dwellArg] = process.argv.slice(2);
const dwellMs = Number(dwellArg || 0);
const runs = Number(runsArg || 5);
const throttle = Number(throttleArg || 1);
const root = path.resolve(distDir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };
const gz = new Map();
const requests = [];

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/conquestoria/')) { res.writeHead(404); res.end(); return; }
  url = url.slice('/conquestoria'.length) || '/';
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  requests.push(url);
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' };
  if (['.js', '.css', '.html', '.json', '.svg'].includes(ext)) {
    if (!gz.has(file)) gz.set(file, zlib.gzipSync(body, { level: 6 }));
    body = gz.get(file);
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(200, { ...headers, 'content-length': body.length });
  res.end(body);
});

async function openSetupAndChooseCiv(page, base) {
  await page.goto(`${base}/conquestoria/`);
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-action="choose-solo-mode"]').click();
  await page.getByRole('button', { name: 'Choose civilization' }).click();
  await page.locator('.civ-card').first().click();
  await page.locator('#civ-start').click();
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  if (mode === 'start') {
    const waits = [];
    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await openSetupAndChooseCiv(page, base);
      const start = page.getByRole('button', { name: 'Start Campaign', exact: true });
      await start.waitFor({ state: 'visible' });
      if (dwellMs) await page.waitForTimeout(dwellMs);
      const waitMs = await page.evaluate(() => new Promise(resolve => {
        const t0 = performance.now();
        const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Start Campaign');
        const poll = () => {
          if ([...document.querySelectorAll('span,div')].some(e => /^Turn 1\b/.test(e.textContent || '') && e.children.length === 0)) resolve(performance.now() - t0);
          else requestAnimationFrame(poll);
        };
        button.click();
        poll();
      }));
      waits.push(Math.round(waitMs));
      await context.close();
    }
    console.log(JSON.stringify({ label, mode, cpuThrottle: throttle, dwellMs, startToTurn1Ms: { median: median(waits), runs: waits } }));
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/conquestoria/`);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    // Wait for the worker's install-time precache to finish populating.
    await page.waitForFunction(async () => (await caches.keys()).length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    // A worker only caches what it sees fetched; the first load happened before it controlled the page, so one
    // ordinary online reload (what any returning player does) lets it cache the app shell. The map JSON is
    // never fetched online here: it can only be offline-available through the install-time precache.
    await page.reload();
    await page.getByRole('button', { name: 'New Game', exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(1500);
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls = [];
      for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
      return urls.filter(u => /-map-.*\.json$/.test(u));
    });
    await context.setOffline(true);
    requests.length = 0;
    await page.reload();
    await openSetupAndChooseCiv(page, base);
    await page.getByRole('button', { name: 'Start Campaign', exact: true }).click();
    await page.getByText(/^Turn 1\b/).waitFor({ state: 'visible', timeout: 30000 });
    const alertCount = await page.getByRole('alert').filter({ hasText: 'could not be loaded' }).count();
    console.log(JSON.stringify({ label, mode, precachedMapAssets: cached, serverRequestsWhileOffline: requests.length, startedOffline: true, loadErrorShown: alertCount > 0 }));
  }
  await browser.close();
  server.close();
})().catch(error => { console.error('FLOW FAILED', error); process.exit(1); });
