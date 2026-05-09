import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config';

describe('playwright config', () => {
  it('starts the dev server without requiring mise on CI runners', () => {
    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer;

    expect(webServer?.command).toBe('yarn dev --host 127.0.0.1');
    expect(webServer?.command).not.toContain('run-with-mise');
  });
});
