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

import {
  SPRITE_DIAGNOSTIC_METADATA,
  getSpriteDiagnosticMetadata,
  spriteCache,
  initSprites,
} from '@/renderer/sprites/sprite-loader';

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

  it('getUnitMotion returns moving frames for a loaded civ', () => {
    expect(spriteCache.getUnitMotion('warrior', 'player', 'move-a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'player', 'move-b')).toBeInstanceOf(HTMLImageElement);
  });

  it('getUnitMotion returns null for an uncached civ', () => {
    expect(spriteCache.getUnitMotion('warrior', 'uncached-civ', 'move-a')).toBeNull();
  });

  it('can load a neutral civ palette on demand', async () => {
    spriteCache.ensureCiv('mc-on-demand-test', '#8a6f2a');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(spriteCache.getUnit('warrior', 'mc-on-demand-test')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'mc-on-demand-test', 'move-a')).toBeInstanceOf(HTMLImageElement);
  });

  it('loads pirate units once under the neutral pirate owner family', () => {
    expect(spriteCache.getUnit('pirate_galley', 'pirates')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnit('pirate_mothership', 'pirates')).toBeInstanceOf(HTMLImageElement);
  });

  it('loads every pirate headquarters image and returns null for missing IDs', () => {
    expect(spriteCache.getLandmark('pirate_enclave_stage_1')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getLandmark('pirate_flotilla_stage_5')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getLandmark('missing')).toBeNull();
  });

  it('attaches immutable, non-enumerable diagnostic provenance to cached sprites', () => {
    const unit = spriteCache.getUnit('warrior', 'player')!;
    const building = spriteCache.getBuilding('granary', 'player')!;
    const landmark = spriteCache.getLandmark('pirate_enclave_stage_1')!;

    expect(getSpriteDiagnosticMetadata(unit)).toEqual({
      kind: 'unit', itemId: 'warrior', civilization: 'player', motion: 'idle',
    });
    expect(getSpriteDiagnosticMetadata(building)).toEqual({
      kind: 'building', itemId: 'granary', civilization: 'player',
    });
    expect(getSpriteDiagnosticMetadata(landmark)).toEqual({
      kind: 'landmark', itemId: 'pirate_enclave_stage_1', civilization: 'pirates',
    });
    expect(Object.keys(unit)).not.toContain(String(SPRITE_DIAGNOSTIC_METADATA));
    expect(Object.isFrozen(getSpriteDiagnosticMetadata(unit))).toBe(true);
  });
});
