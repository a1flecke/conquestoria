// Startup cost of a built dist/: served gzip-compressed under /conquestoria/, loaded in headless Chromium.
// usage: node measure-startup.cjs <distDir> <label> [runs] [cpuThrottle]
// Reports per-run: bytes transferred (gzip), JS requests, CDP ScriptDuration/TaskDuration, and the page-clock time
// until the start surface's "New Game" button is visible. Cold = fresh context per run (empty HTTP cache, no SW).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('@playwright/test');

const [distDir, label, runsArg, throttleArg] = process.argv.slice(2);
const runs = Number(runsArg || 7);
const throttle = Number(throttleArg || 1);
const root = path.resolve(distDir);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };
const gzCache = new Map();
const served = [];

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/conquestoria/')) { res.writeHead(404); res.end(); return; }
  url = url.slice('/conquestoria'.length) || '/';
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' };
  if (['.js', '.css', '.html', '.json', '.svg'].includes(ext)) {
    if (!gzCache.has(file)) gzCache.set(file, zlib.gzipSync(body, { level: 6 }));
    body = gzCache.get(file);
    headers['content-encoding'] = 'gzip';
  }
  served.push({ url, bytes: body.length });
  res.writeHead(200, { ...headers, 'content-length': body.length });
  res.end(body);
});

function median(values) { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const results = [];
  for (let i = 0; i < runs; i++) {
    served.length = 0;
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/conquestoria/`, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'New Game' }).waitFor({ state: 'visible', timeout: 120000 });
    const interactiveMs = Date.now() - t0;
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const jsHeap = metrics.JSHeapUsedSize;
    results.push({
      interactiveMs,
      scriptMs: Math.round(metrics.ScriptDuration * 1000),
      taskMs: Math.round(metrics.TaskDuration * 1000),
      jsHeapMB: Math.round(jsHeap / 1048576 * 10) / 10,
      transferKB: Math.round(served.reduce((s, r) => s + r.bytes, 0) / 1024),
      jsRequests: served.filter(r => r.url.endsWith('.js')).length,
    });
    await context.close();
  }
  await browser.close();
  server.close();
  const keys = Object.keys(results[0]);
  const summary = Object.fromEntries(keys.map(k => [k, { median: median(results.map(r => r[k])), min: Math.min(...results.map(r => r[k])), max: Math.max(...results.map(r => r[k])) }]));
  console.log(JSON.stringify({ label, runs, cpuThrottle: throttle, summary, raw: results }, null, 1));
})();
