import { describe, expect, it } from 'vitest';
import playwrightConfig, { resolvePlaywrightDevCommand } from '../../playwright.config';

describe('playwright config', () => {
  it('starts the dev server without requiring mise on CI runners', () => {
    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer;

    expect(resolvePlaywrightDevCommand('true')).toBe('yarn dev --host 127.0.0.1');
    expect(resolvePlaywrightDevCommand('true')).not.toContain('run-with-mise');
    expect(webServer?.command).toBe(resolvePlaywrightDevCommand());
  });

  it('uses the worktree-aware wrapper for local browser tests', () => {
    expect(resolvePlaywrightDevCommand(undefined))
      .toBe('./scripts/run-with-mise.sh yarn dev --host 127.0.0.1');
  });
});
