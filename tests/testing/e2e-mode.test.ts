import { describe, expect, it } from 'vitest';
import { isExactAutosaveE2ERequest } from '@/testing/e2e-mode';

describe('isExactAutosaveE2ERequest', () => {
  it.each([
    ['production', '?e2e=autosave'],
    ['development', '?e2e=autosave'],
    ['tauri', '?e2e=autosave'],
    ['e2e', ''],
    ['e2e', '?e2e=true'],
    ['e2e', '?e2e=autosave&state={}'],
  ])('rejects mode %s and query %s', (mode, search) => {
    expect(isExactAutosaveE2ERequest(mode, search)).toBe(false);
  });

  it('accepts only the literal e2e autosave request', () => {
    expect(isExactAutosaveE2ERequest('e2e', '?e2e=autosave')).toBe(true);
  });
});
