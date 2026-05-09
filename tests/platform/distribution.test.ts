import { describe, expect, it } from 'vitest';
import { resolveDistribution, shouldRegisterServiceWorker } from '@/platform/distribution';

describe('distribution platform detection', () => {
  it('defaults to the web distribution', () => {
    expect(resolveDistribution({})).toBe('web');
  });

  it('uses the tauri distribution when Vite mode marks it', () => {
    expect(resolveDistribution({ VITE_CONQUESTORIA_DISTRIBUTION: 'tauri' })).toBe('tauri');
  });

  it('uses the tauri distribution when Tauri build env vars are present', () => {
    expect(resolveDistribution({ TAURI_ENV_PLATFORM: 'darwin' })).toBe('tauri');
  });

  it('registers service workers only for the web distribution with browser support', () => {
    expect(shouldRegisterServiceWorker('web', { serviceWorker: {} })).toBe(true);
    expect(shouldRegisterServiceWorker('tauri', { serviceWorker: {} })).toBe(false);
    expect(shouldRegisterServiceWorker('web', {})).toBe(false);
  });
});
