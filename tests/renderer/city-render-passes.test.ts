import { describe, it, expect } from 'vitest';
import {
  drawCityIconPass,
  drawCityIdleBadgePass,
  drawCityIntelBadgePass,
  drawCityLabelPass,
  drawCityLandmarkPass,
  drawCityProductionBadgePass,
  drawCityStatusBadgePass,
  drawCityWorldPressureBadgePass,
  drawCityLoyaltyPressureBadgePass,
  fitCityBannerLabel,
  type CityRenderItem,
} from '@/renderer/city-render-passes';
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';

class MockCtx {
  fillTextCalls: Array<{ text: string; x: number; y: number; font: string; measuredWidth: number; maxWidth?: number }> = [];
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

describe('fitCityBannerLabel', () => {
  it('keeps the full label when its measured width fits', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    ctx.font = 'bold 12px system-ui';

    expect(fitCityBannerLabel(ctx, 'Rome', 3, 100, true)).toBe('Rome (3)');
  });

  it('fits by measured glyph width instead of a fixed character count', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    ctx.font = 'bold 12px system-ui';

    const narrow = fitCityBannerLabel(ctx, 'iiiiiiiiiiiiiiii', 7, 80, true);
    const wide = fitCityBannerLabel(ctx, 'WWWWWWWWWWWWWWWW', 7, 80, true);

    expect(narrow).toBe('iiiiiiiiiiiiiiii (7)');
    expect(wide.length).toBeLessThan(narrow.length);
    expect(wide).toContain('…');
    expect(ctx.measureText(wide).width).toBeLessThanOrEqual(80);
  });

  it('reserves measured width for the complete population suffix', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    ctx.font = 'bold 12px system-ui';

    const singleDigit = fitCityBannerLabel(ctx, 'Alexandroupolis', 7, 90, true);
    const tripleDigit = fitCityBannerLabel(ctx, 'Alexandroupolis', 123, 90, true);

    expect(tripleDigit.length).toBeLessThan(singleDigit.length + 2);
    expect(tripleDigit).toMatch(/\(123\)$/);
    expect(ctx.measureText(tripleDigit).width).toBeLessThanOrEqual(90);
  });

  it('omits population at low zoom and spends the width on the city name', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    ctx.font = 'bold 9px system-ui';

    const label = fitCityBannerLabel(ctx, 'Constantinopolis', 12, 55, false);

    expect(label).not.toContain('(12)');
    expect(ctx.measureText(label).width).toBeLessThanOrEqual(55);
  });
});

describe('drawCityLabelPass', () => {
  it('renders a measured label that fits without Canvas horizontal compression', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem();

    drawCityLabelPass(ctx, item);

    const availableWidth = item.size * 1.22 * 0.92;
    const labelCall = (ctx as unknown as MockCtx).fillTextCalls.at(-1);
    expect(labelCall).toBeDefined();
    expect(labelCall!.maxWidth).toBeUndefined();
    expect(labelCall!.measuredWidth).toBeLessThanOrEqual(availableWidth);
  });

  it('hides population and fits the name at low zoom', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem({ size: 20, lowZoom: true });

    drawCityLabelPass(ctx, item);

    const labelCall = (ctx as unknown as MockCtx).fillTextCalls.at(-1);
    expect(labelCall).toBeDefined();
    expect(labelCall!.text).not.toContain('(7)');
    expect(labelCall!.measuredWidth).toBeLessThanOrEqual(item.size * 1.22 * 0.92);
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

describe('city icon and badge text bounds', () => {
  it('fits minor-civ, status, production, idle, and intel glyphs to their containers', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1',
      owner: 'player',
      productionQueue: ['warrior'],
      idleProduction: null,
      unrestLevel: 2,
    } as CityRenderItem['city'];
    const item = makeItem({
      city,
      isMinorCiv: true,
      minorCivIcon: '🏛️',
      intel: { hasEmbeddedSpy: true, hasInfiltratedSpy: true },
    });

    drawCityIconPass(ctx, item);
    drawCityStatusBadgePass(ctx, item);
    drawCityProductionBadgePass(ctx, item);
    drawCityIntelBadgePass(ctx, item);

    item.city = { ...city, productionQueue: [], idleProduction: 'gold' } as CityRenderItem['city'];
    drawCityIdleBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(6);
    for (const call of (ctx as unknown as MockCtx).fillTextCalls) {
      expect(call.maxWidth).toBeUndefined();
      expect(call.measuredWidth).toBeLessThanOrEqual(item.size * 0.28);
    }
  });

  it('draws the under-siege status badge, taking priority over unrest (#522)', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'player', productionQueue: [] as string[], idleProduction: null, unrestLevel: 2,
    } as CityRenderItem['city'];
    const item = makeItem({
      city,
      presentation: { ...makeItem().presentation, underSiege: true },
    });

    drawCityStatusBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(1);
    expect((ctx as unknown as MockCtx).fillTextCalls[0]!.text).toBe('⚔️');
  });

  it('does not draw the under-siege badge when the city is not under siege', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'player', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({ city, presentation: { ...makeItem().presentation, underSiege: false } });

    drawCityStatusBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });

  it('draws a world-pressure crisis badge (intel style) when the item carries one', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'ai-1', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({ city, worldPressureCrisis: 'outbreak' });

    drawCityWorldPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(1);
    expect((ctx as unknown as MockCtx).fillTextCalls[0]!.text).toBe('⚠️');
  });

  it('draws nothing when the item carries no world-pressure crisis', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'ai-1', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({ city });

    drawCityWorldPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });

  it('skips the world-pressure badge for landmark-only (non-live) render items', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem({
      projection: { ...makeItem().projection, renderMode: 'landmark-only', isLive: false },
      city: undefined,
      worldPressureCrisis: 'catastrophe',
    });

    drawCityWorldPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });

  it('#593 MR6 — draws a loyalty-pressure badge when the item carries one', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'ai-1', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({ city, loyaltyPressure: true });

    drawCityLoyaltyPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(1);
    expect((ctx as unknown as MockCtx).fillTextCalls[0]!.text).toBe('☦');
  });

  it('#593 MR6 — draws nothing when the item carries no loyalty pressure', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'ai-1', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({ city });

    drawCityLoyaltyPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });

  it('#593 MR6 — skips the loyalty-pressure badge for landmark-only (non-live) render items', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const item = makeItem({
      projection: { ...makeItem().projection, renderMode: 'landmark-only', isLive: false },
      city: undefined,
      loyaltyPressure: true,
    });

    drawCityLoyaltyPressureBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(0);
  });

  it('lets breakaway status take priority over an active siege', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const city = {
      id: 'city-1', owner: 'player', productionQueue: [] as string[], idleProduction: null, unrestLevel: 0,
    } as CityRenderItem['city'];
    const item = makeItem({
      city,
      presentation: { ...makeItem().presentation, underSiege: true },
      breakaway: { status: 'secession' },
    });

    drawCityStatusBadgePass(ctx, item);

    expect((ctx as unknown as MockCtx).fillTextCalls).toHaveLength(1);
    expect((ctx as unknown as MockCtx).fillTextCalls[0]!.text).toBe('⛓');
  });

  it('fits the legendary-wonder overflow count without Canvas horizontal compression', () => {
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D;
    const landmark: LegendaryWonderMapEntry = {
      wonderId: 'test-wonder',
      cityId: 'city-1',
      coord: { q: 0, r: 0 },
      ownerId: 'player',
      relationship: 'owned',
      state: 'under-construction',
      turnCompleted: 0,
      label: 'Test Wonder',
      visual: {} as LegendaryWonderMapEntry['visual'],
      metadata: getLegendaryWonderLandmarkMetadata('test-wonder'),
      progressRatio: 0.8,
    };
    const item = makeItem({
      presentation: {
        ...makeItem().presentation,
        primaryWonder: landmark,
        completedWonderOverflowCount: 123,
      },
      landmarkEntries: [landmark],
    });

    drawCityLandmarkPass(ctx, item);

    const overflowCall = (ctx as unknown as MockCtx).fillTextCalls.find(call => call.text === '+123');
    expect(overflowCall).toBeDefined();
    expect(overflowCall!.maxWidth).toBeUndefined();
    expect(overflowCall!.measuredWidth).toBeLessThanOrEqual(item.size * 0.16 * 1.4);
  });
});
