import { describe, it, expect } from 'vitest';
import {
  drawCityLabelPass,
  formatCityBannerLabel,
  type CityRenderItem,
} from '@/renderer/city-render-passes';

class MockCtx {
  fillTextCalls: Array<{ text: string; x: number; y: number; maxWidth?: number }> = [];
  font = '';
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.fillTextCalls.push({ text, x, y, maxWidth });
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

describe('formatCityBannerLabel', () => {
  it('returns name + population for short names', () => {
    expect(formatCityBannerLabel('Rome', 3)).toBe('Rome (3)');
  });

  it('truncates names longer than 14 chars and appends ellipsis', () => {
    const label = formatCityBannerLabel('Constantinopolis', 5);
    expect(label).toBe('Constantinopo… (5)');
  });

  it('respects custom maxNameLength', () => {
    const label = formatCityBannerLabel('Alexandroupolis', 4, 8);
    expect(label).toContain('…');
    expect(label.indexOf('…')).toBeLessThanOrEqual(8);
  });
});

describe('drawCityLabelPass', () => {
  it('passes maxWidth to fillText so long labels cannot overflow the banner', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem();

    drawCityLabelPass(ctx, item);

    const bannerWidth = item.size * 1.22;
    const labelCall = (ctx as unknown as MockCtx).fillTextCalls.find(c =>
      c.text.startsWith('Alexandroup'),
    );
    expect(labelCall).toBeDefined();
    expect(labelCall!.maxWidth).toBeCloseTo(bannerWidth * 0.92, 5);
  });

  it('passes maxWidth at small zoom sizes too', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem({ size: 20 });

    drawCityLabelPass(ctx, item);

    const bannerWidth = item.size * 1.22;
    const labelCall = (ctx as unknown as MockCtx).fillTextCalls.find(c =>
      c.text.includes('('),
    );
    expect(labelCall).toBeDefined();
    expect(labelCall!.maxWidth).toBeCloseTo(bannerWidth * 0.92, 5);
  });

  it('skips render when renderMode is landmark-only', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem({
      projection: {
        name: 'Rome',
        position: { q: 0, r: 0 },
        population: 1,
        owner: 'player',
        isLive: true,
        renderMode: 'landmark-only',
      },
    });

    drawCityLabelPass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });
});
