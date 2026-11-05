import { describe, expect, it } from 'vitest';
import playwrightConfig, { resolvePlaywrightDevCommand, resolvePlaywrightProjects } from '../../playwright.config';

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

  // #1466: audio compatibility needs WebKit and Firefox evidence, but the default browser job stays Chromium-only
  // because the rest of the suite assumes Chromium.
  it('adds WebKit and Firefox only when the cross-engine audio run opts in', () => {
    expect(resolvePlaywrightProjects(undefined).map(project => project.name)).toEqual(['chromium']);
    expect(resolvePlaywrightProjects('').map(project => project.name)).toEqual(['chromium']);
    expect(resolvePlaywrightProjects('1').map(project => project.name)).toEqual(['chromium', 'webkit', 'firefox']);
    expect(playwrightConfig.projects?.map(project => project.name)).toEqual(
      resolvePlaywrightProjects(process.env.CONQUESTORIA_PLAYWRIGHT_CROSS_ENGINE).map(project => project.name),
    );
  });

  it('retains first-attempt failure traces and a stable HTML report for CI artifacts', () => {
    expect(playwrightConfig.use?.trace).toBe('retain-on-failure');
    expect(playwrightConfig.reporter).toEqual([
      ['line'],
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ]);
  });
});
