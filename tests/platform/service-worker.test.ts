import { describe, expect, it, vi } from 'vitest';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';

describe('registerConquestoriaServiceWorker', () => {
  it('registers the GitHub Pages service worker for web builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).toHaveBeenCalledWith('/conquestoria/sw.js');
  });

  it('skips service worker registration for Tauri builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('tauri', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).not.toHaveBeenCalled();
  });

  it('swallows registration failures so the game can continue', async () => {
    const register = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator)).resolves.toBeUndefined();
  });
});
