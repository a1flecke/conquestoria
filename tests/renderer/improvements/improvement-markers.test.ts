import { describe, it, expect } from 'vitest';

// Verify each marker module exports the required preload + getImage functions.
// Actual preloading requires browser Image API (not available in node/vitest).

const markerPaths = [
  '@/renderer/improvements/farm-marker',
  '@/renderer/improvements/mine-marker',
  '@/renderer/improvements/lumber-camp-marker',
  '@/renderer/improvements/watermill-marker',
  '@/renderer/improvements/plantation-marker',
  '@/renderer/improvements/pasture-marker',
  '@/renderer/improvements/camp-marker',
  '@/renderer/improvements/quarry-marker',
];

describe('improvement marker modules', () => {
  it('each marker module exports a preload function and a getImage function', async () => {
    for (const path of markerPaths) {
      const mod = await import(path);
      const keys = Object.keys(mod);
      const hasPreload = keys.some(k => k.startsWith('preload') && k.endsWith('Marker'));
      const hasGet = keys.some(k => k.startsWith('get') && k.endsWith('MarkerImage'));
      expect(hasPreload, `${path} missing preload*Marker export`).toBe(true);
      expect(hasGet, `${path} missing get*MarkerImage export`).toBe(true);
    }
  });

  it('getImage returns null before preloading (no browser Image API in test env)', async () => {
    // In node/jsdom, preload can't run (no object URLs). getImage should return null.
    for (const path of markerPaths) {
      const mod = await import(path);
      const getKey = Object.keys(mod).find(k => k.startsWith('get') && k.endsWith('MarkerImage'));
      if (getKey) {
        expect(mod[getKey](), `${path}.${getKey}() should be null before preload`).toBeNull();
      }
    }
  });
});
