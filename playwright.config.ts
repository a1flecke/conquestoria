import { defineConfig, devices } from '@playwright/test';

export function resolvePlaywrightDevCommand(ci = process.env.CI): string {
  return ci
    ? 'yarn dev --mode e2e --host 127.0.0.1'
    : './scripts/run-with-mise.sh yarn dev --mode e2e --host 127.0.0.1';
}

export default defineConfig({
  testDir: './tests/e2e',
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  webServer: {
    command: resolvePlaywrightDevCommand(),
    url: 'http://127.0.0.1:5173/conquestoria/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173/conquestoria/',
    trace: 'retain-on-failure',
    // Run the app in its reduced-motion mode by default: the DOM sprites' infinite CSS idle
    // animations and the canvas unit-movement tweens are decorative, add per-frame style/paint
    // work, and on GitHub's GPU-less shared runners every extra frame competes with the
    // campaign mount that already runs close to the test budgets (see CAMPAIGN_READY_TIMEOUT_MS
    // in issue-910-vassalage.spec.ts). Specs that assert motion opt back in with
    // `page.emulateMedia({ reducedMotion: 'no-preference' })` (issue-365-map-presentation.spec.ts).
    // Must be a context option: `reducedMotion` is not a Playwright Test `use` fixture and is
    // silently ignored there.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
