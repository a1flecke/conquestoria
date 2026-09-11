import { describe, expect, it } from 'vitest';
import playwrightConfig, {
  resolvePlaywrightDevCommand,
  resolvePlaywrightWorkers,
} from '../../playwright.config';

describe('playwright config', () => {
  it('starts the dev server without requiring mise on CI runners', () => {
    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer;

    expect(resolvePlaywrightDevCommand('true')).toBe('yarn dev --mode e2e --host 127.0.0.1');
    expect(resolvePlaywrightDevCommand('true')).not.toContain('run-with-mise');
    expect(webServer?.command).toBe(resolvePlaywrightDevCommand());
  });

  it('uses the worktree-aware wrapper for local browser tests', () => {
    expect(resolvePlaywrightDevCommand(''))
      .toBe('./scripts/run-with-mise.sh yarn dev --mode e2e --host 127.0.0.1');
  });

  it('serializes CI browser specs that share a development-server origin', () => {
    expect(resolvePlaywrightWorkers('true')).toBe(1);
    expect(resolvePlaywrightWorkers('')).toBeUndefined();
  });

  it('retains first-attempt failure traces and a stable HTML report for CI artifacts', () => {
    expect(playwrightConfig.use?.trace).toBe('retain-on-failure');
    expect(playwrightConfig.reporter).toEqual([
      ['line'],
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ]);
  });
});
