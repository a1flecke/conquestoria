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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
