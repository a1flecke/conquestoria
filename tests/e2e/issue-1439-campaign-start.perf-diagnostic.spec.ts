import { chromium, test, expect } from '@playwright/test';
import { runCampaignStartSample, summarize, rendererRssFromProcesses, type CampaignStartSample } from './helpers/campaign-start-perf';

/**
 * #1439 phase 4: segmented campaign-start diagnostic. OPT-IN and non-gating (excluded from default
 * web-smoke by playwright.config.ts; run with `yarn test:web-smoke:campaign-start`). It prints one
 * `[campaign-start]` JSON line per sample plus a per-scenario summary and the main-thread CPU
 * profile of the first sample. It asserts nothing about speed.
 *
 *   CONQUESTORIA_CAMPAIGN_START_SAMPLES   samples per scenario (default 5)
 *   CONQUESTORIA_CS_PROFILE               also attach a CPU profile of the first reduced-motion cold sample
 *                                         (it perturbs that sample, and hung the renderer in the motion scenario)
 *   CONQUESTORIA_PERF_BASE_URL            measure a different build (e.g. `vite preview` of a production
 *                                         build) instead of the Playwright dev server
 */
const SAMPLES = Number(process.env.CONQUESTORIA_CAMPAIGN_START_SAMPLES ?? 5);

test('#1439 renderer RSS excludes a closed priming renderer from the active page measurement', () => {
  const processes = [{ pid: 101, rssKb: 800 * 1024 }, { pid: 102, rssKb: 300 * 1024 }];
  expect(rendererRssFromProcesses(processes, 102)).toBe(300);
  expect(rendererRssFromProcesses(processes)).toBe(1100);
  expect(rendererRssFromProcesses(processes, null)).toBeNull();
  expect(rendererRssFromProcesses(processes, 103)).toBeNull();
  expect(rendererRssFromProcesses([])).toBeNull();
});

const SCENARIOS = [
  { reducedMotion: 'reduce', cache: 'cold' },
  { reducedMotion: 'no-preference', cache: 'cold' },
  { reducedMotion: 'reduce', cache: 'warm' },
] as const;

for (const scenario of process.env.CONQUESTORIA_MEMORY_DIAGNOSTICS ? [] : SCENARIOS) {
  test(`#1439 campaign start: ${scenario.reducedMotion} / ${scenario.cache} cache`, async ({ baseURL }, testInfo) => {
    test.setTimeout(5 * 60_000);
    // A fresh browser per scenario: scenarios must not share renderer/process state, and a stalled
    // sample in one (seen when two scenarios shared one browser) must not poison the next.
    const browser = await chromium.launch();
    const baseUrl = process.env.CONQUESTORIA_PERF_BASE_URL ?? baseURL!;
    const samples: CampaignStartSample[] = [];
    let warmContext: import('@playwright/test').BrowserContext | undefined;
    try {
      warmContext = scenario.cache === 'warm'
        ? await browser.newContext({ reducedMotion: scenario.reducedMotion, baseURL: baseUrl })
        : undefined;
      if (warmContext) {
        // Priming pass populates the HTTP/module cache; it is not a sample.
        await runCampaignStartSample({ browser, baseUrl, ...scenario, cache: 'warm', warmContext });
      }
      for (let i = 0; i < SAMPLES; i += 1) {
        const { sample, profile } = await runCampaignStartSample({
          browser, baseUrl, ...scenario, warmContext,
          // The sampling profiler hung the renderer in the motion-allowed scenario, so only the
          // reduced-motion cold scenario is profiled (the attribution is the same work).
          profile: Boolean(process.env.CONQUESTORIA_CS_PROFILE) && i === 0 && scenario.reducedMotion === 'reduce' && scenario.cache === 'cold',
        });
        samples.push(sample);
        console.log(`[campaign-start] ${JSON.stringify(sample)}`);
        if (profile) {
          console.log(`[campaign-start-profile] ${JSON.stringify({
            scenario: `${sample.scenario}/${sample.cache}`,
            topInclusive: profile.functions.slice(0, 60),
            topSelfByFile: profile.byFile.slice(0, 25),
          })}`);
        }
      }
      const summary = summarize(samples);
      console.log(`[campaign-start-summary] ${JSON.stringify({ scenario: `${scenario.reducedMotion}/${scenario.cache}`, samples: SAMPLES, summary })}`);
      await testInfo.attach('campaign-start-summary', { body: JSON.stringify({ samples, summary }, null, 2), contentType: 'application/json' });
    } finally {
      try { await warmContext?.close(); }
      finally { await browser.close(); }
    }
  });
}

// The attribution matrix is a separate, deliberately opt-in run of the existing non-gating tool.
if (process.env.CONQUESTORIA_MEMORY_DIAGNOSTICS) {
  test('#1439 renderer memory attribution matrix', async ({ baseURL }) => {
    test.setTimeout(60 * 60_000);
    const { runMemoryMatrix } = await import('./helpers/renderer-memory-perf');
    await runMemoryMatrix(process.env.CONQUESTORIA_PERF_BASE_URL ?? baseURL!);
  });
}
