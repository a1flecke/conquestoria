import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawCityProductionBadgePass, type CityRenderItem } from '@/renderer/city-render-passes';
import { spriteCache } from '@/renderer/sprites/sprite-loader';
import { getLegendaryWonderArtImage } from '@/renderer/wonders/legendary-wonder-art-loader';

vi.mock('@/renderer/wonders/legendary-wonder-art-loader', () => ({ getLegendaryWonderArtImage: vi.fn() }));

class MockCtx {
  fillTextCalls: Array<{ text: string; x: number; y: number; font: string; measuredWidth: number; maxWidth?: number }> = [];
  drawImageCalls: unknown[][] = [];
  font = '';
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.fillTextCalls.push({
      text,
      x,
      y,
      font: this.font,
      measuredWidth: this.measureText(text).width,
      maxWidth,
    });
  }
  measureText(text: string): TextMetrics {
    const fontSize = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10');
    const width = [...text].reduce((sum, character) => {
      if (character === 'i' || character === 'l' || character === ' ') return sum + fontSize * 0.28;
      if (character === 'W' || character === 'M') return sum + fontSize * 0.92;
      if (character.codePointAt(0)! > 0xffff) return sum + fontSize;
      return sum + fontSize * 0.58;
    }, 0);
    return { width } as TextMetrics;
  }
  beginPath(): void {}
  rect(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  arc(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  drawImage(...args: unknown[]): void { this.drawImageCalls.push(args); }
}

function makeItem(overrides: Partial<CityRenderItem> = {}): CityRenderItem {
  return {
    projection: {
      name: 'Alexandroupolis',
      position: { q: 0, r: 0 },
      population: 7,
      owner: 'player',
      isLive: true,
    },
    presentation: {
      architectureEra: 1,
      populationTier: 'outpost',
      visualFamily: 'generic',
      specializations: [],
      isCapital: false,
      isBreakawayCapital: false,
      primaryWonder: undefined,
      completedWonderOverflowCount: 0,
      visibilityMode: 'live' as const,
      underSiege: false,
    damageTier: 'none' as const,
    },
    screen: { x: 100, y: 100 },
    size: 80,
    ownerColor: '#4488cc',
    playerCivId: 'player',
    isMinorCiv: false,
    intel: { hasEmbeddedSpy: false, hasInfiltratedSpy: false },
    landmarkEntries: [],
    lowZoom: false,
    reducedMotion: false,
    nowMs: 0,
    ...overrides,
  };
}

const ART = { tag: 'art' } as unknown as HTMLImageElement;

describe('city production badge shows queued legendary wonder art (#613)', () => {
  const lookup = vi.mocked(getLegendaryWonderArtImage);
  beforeEach(() => {
    vi.restoreAllMocks();
    lookup.mockReset();
    lookup.mockReturnValue(null);
  });

  const badge = (queue: string[], owner = 'player') => {
    const ctx = new MockCtx();
    const city = { id: 'city-1', owner, productionQueue: queue, idleProduction: null, unrestLevel: 0 } as CityRenderItem['city'];
    drawCityProductionBadgePass(ctx as unknown as CanvasRenderingContext2D, makeItem({ city }));
    return ctx;
  };

  it('draws the wonder art instead of the construction emoji when it is loaded', () => {
    lookup.mockImplementation(id => (id === 'crystal-palace' ? ART : null));
    const ctx = badge(['legendary:crystal-palace']);
    expect(lookup).toHaveBeenCalledWith('crystal-palace');
    expect(ctx.drawImageCalls).toHaveLength(1);
    expect(ctx.drawImageCalls[0]![0]).toBe(ART);
    expect(ctx.fillTextCalls).toHaveLength(0);
  });

  it('keeps the construction emoji while the art is missing or failed', () => {
    const ctx = badge(['legendary:crystal-palace']);
    expect(ctx.drawImageCalls).toHaveLength(0);
    expect(ctx.fillTextCalls.map(call => call.text)).toEqual(['🏗️']);
  });

  it('keeps the emoji for a legendary wonder without art, even when art is cached for others', () => {
    lookup.mockImplementation(id => (id === 'crystal-palace' ? ART : null));
    const ctx = badge(['legendary:oracle-of-delphi']);
    expect(ctx.drawImageCalls).toHaveLength(0);
    expect(ctx.fillTextCalls).toHaveLength(1);
  });

  it('only looks at the head of the queue and ignores ordinary items and malformed ids', () => {
    lookup.mockImplementation(id => (id === 'crystal-palace' ? ART : null)); // like the real loader: null for any other id
    vi.spyOn(spriteCache, 'getBuilding').mockReturnValue(null);
    vi.spyOn(spriteCache, 'getUnit').mockReturnValue(null);
    expect(badge(['granary', 'legendary:crystal-palace']).drawImageCalls).toHaveLength(0);
    expect(badge(['legendary:']).drawImageCalls).toHaveLength(0);
    expect(badge(['legendary:crystal-palace']).drawImageCalls).toHaveLength(1);
  });

  it('never reveals another civ\'s production: a non-owned city draws no badge at all', () => {
    lookup.mockImplementation(id => (id === 'crystal-palace' ? ART : null));
    const ctx = badge(['legendary:crystal-palace'], 'ai-1');
    expect(ctx.drawImageCalls).toHaveLength(0);
    expect(ctx.fillTextCalls).toHaveLength(0);
  });
});
