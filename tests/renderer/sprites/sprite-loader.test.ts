// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock URL and Image before importing the module under test
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

// Auto-fire onload when src is set — jsdom doesn't load blob URLs natively
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  set(_val: string) { Promise.resolve().then(() => this.onload?.(new Event('load'))); },
  get() { return this._src ?? ''; },
  configurable: true,
});

import { spriteCache, initSprites } from '@/renderer/sprites/sprite-loader';

describe('SpriteCache before initSprites', () => {
  it('getUnit returns null before any load', () => {
    expect(spriteCache.getUnit('warrior', 'player')).toBeNull();
  });

  it('getBuilding returns null before any load', () => {
    expect(spriteCache.getBuilding('granary', 'player')).toBeNull();
  });

  it('getUnit does not throw for unknown civ', () => {
    expect(() => spriteCache.getUnit('settler', 'nonexistent')).not.toThrow();
  });
});

describe('SpriteCache after initSprites', () => {
  beforeAll(async () => {
    await initSprites({ player: '#4a90d9' });
  });

  it('getUnit returns an HTMLImageElement', () => {
    expect(spriteCache.getUnit('warrior', 'player')).toBeInstanceOf(HTMLImageElement);
  });

  it('getBuilding returns an HTMLImageElement', () => {
    expect(spriteCache.getBuilding('granary', 'player')).toBeInstanceOf(HTMLImageElement);
  });

  it('getUnit returns null for an uncached civ', () => {
    expect(spriteCache.getUnit('warrior', 'uncached-civ')).toBeNull();
  });
});
