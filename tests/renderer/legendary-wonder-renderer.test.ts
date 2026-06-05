import { describe, expect, it } from 'vitest';
import {
  drawLegendaryWonderLandmarkGlyph,
  drawLegendaryWonderLandmarks,
} from '@/renderer/wonders/legendary-wonder-renderer';
import {
  getLegendaryWonderLandmarkMetadata,
  getLegendaryWonderLandmarkMetadataCatalog,
} from '@/systems/legendary-wonder-landmark-catalog';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  save(): void { this.operations.push('save'); }
  restore(): void { this.operations.push('restore'); }
  beginPath(): void { this.operations.push('beginPath'); }
  arc(x = 0, y = 0, radius = 0): void { this.operations.push(`arc:${x.toFixed(2)}:${y.toFixed(2)}:${radius.toFixed(2)}`); }
  rect(x = 0, y = 0, width = 0, height = 0): void { this.operations.push(`rect:${x.toFixed(2)}:${y.toFixed(2)}:${width.toFixed(2)}:${height.toFixed(2)}`); }
  moveTo(x = 0, y = 0): void { this.operations.push(`moveTo:${x.toFixed(2)}:${y.toFixed(2)}`); }
  lineTo(x = 0, y = 0): void { this.operations.push(`lineTo:${x.toFixed(2)}:${y.toFixed(2)}`); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
  fillText(text: string): void { this.operations.push(`text:${text}`); }
}

function drawCompletedGlyphForWonder(wonderId: string, options: { reducedMotion?: boolean } = {}): MockCanvasContext {
  const ctx = new MockCanvasContext();
  drawLegendaryWonderLandmarkGlyph({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    cx: 80,
    cy: 80,
    radius: 12,
    metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    state: 'completed',
    reducedMotion: options.reducedMotion === true,
    nowMs: 1000,
  });
  return ctx;
}

function expectNonblankCanvasGlyph(ctx: MockCanvasContext, label: string): void {
  expect(ctx.operations.length, label).toBeGreaterThan(4);
  expect(
    ctx.operations.some(operation =>
      operation.startsWith('fill:')
      || operation.startsWith('stroke:')
      || operation.startsWith('arc:')
      || operation.startsWith('rect:')
      || operation.startsWith('lineTo:'),
    ),
    label,
  ).toBe(true);
}

function getGlyphGeometryProfile(ctx: MockCanvasContext): string {
  return ctx.operations
    .filter(operation =>
      operation.startsWith('arc:')
      || operation.startsWith('rect:')
      || operation.startsWith('moveTo:')
      || operation.startsWith('lineTo:'),
    )
    .join('|');
}

describe('legendary-wonder-renderer', () => {
  it('draws completed legendary landmarks with canvas primitives', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarks({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      size: 48,
      reducedMotion: false,
      lowZoom: false,
      entries: [
        { wonderId: 'oracle-of-delphi', label: 'Oracle of Delphi', turnCompleted: 20, visual: getWonderVisualDefinition('oracle-of-delphi') },
      ],
    });

    expect(ctx.operations).toContain('save');
    expect(ctx.operations).toContain('restore');
    expect(ctx.operations.some(operation => operation.startsWith('fill:'))).toBe(true);
    expect(ctx.operations).not.toContain('text:✦');
  });

  it('draws an overflow medallion when many wonders share a city', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarks({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      size: 48,
      reducedMotion: true,
      lowZoom: true,
      entries: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((wonderId, index) => ({
        wonderId,
        label: wonderId,
        turnCompleted: index + 1,
        visual: getWonderVisualDefinition('oracle-of-delphi'),
      })),
    });

    expect(ctx.operations).toContain('text:+2');
  });

  it('draws every authored family with nonblank canvas operations', () => {
    const families = getLegendaryWonderLandmarkMetadataCatalog().map(entry => entry.family);
    for (const family of families) {
      const ctx = new MockCanvasContext();
      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata: { ...getLegendaryWonderLandmarkMetadata('oracle-of-delphi'), family },
        state: 'completed',
        reducedMotion: false,
        nowMs: 1000,
      });
      expect(ctx.operations.length, family).toBeGreaterThan(3);
      expect(ctx.operations.some(operation => operation.startsWith('fill:') || operation.startsWith('stroke:')), family).toBe(true);
    }
  });

  it('draws first-slice completed landmarks through bespoke asset renderers', () => {
    const wonderIds = ['oracle-of-delphi', 'grand-canal', 'sun-spire'];

    for (const wonderId of wonderIds) {
      const ctx = new MockCanvasContext();
      const metadata = getLegendaryWonderLandmarkMetadata(wonderId);

      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata,
        state: 'completed',
        reducedMotion: false,
        nowMs: 1000,
      });

      expect(ctx.operations, wonderId).toContain(`bespoke:${metadata.assetKey}`);
    }
  });

  it('draws knowledge-and-signal completed landmarks through bespoke asset renderers', () => {
    const expected = [
      ['world-archive', 'world-archive-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['internet', 'internet-bespoke'],
    ] as const;

    for (const [wonderId, assetKey] of expected) {
      const ctx = drawCompletedGlyphForWonder(wonderId);

      expect(ctx.operations, wonderId).toContain(`bespoke:${assetKey}`);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });

  it('draws material-and-maritime completed landmarks through bespoke asset renderers', () => {
    const expected = [
      ['moonwell-gardens', 'moonwell-gardens-bespoke'],
      ['ironroot-foundry', 'ironroot-foundry-bespoke'],
      ['tidecaller-bastion', 'tidecaller-bastion-bespoke'],
      ['leviathan-drydock', 'leviathan-drydock-bespoke'],
    ] as const;

    for (const [wonderId, assetKey] of expected) {
      const ctx = drawCompletedGlyphForWonder(wonderId);

      expect(ctx.operations, wonderId).toContain(`bespoke:${assetKey}`);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });

  it('draws distinct material-and-maritime bespoke glyph geometry', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];
    const profiles = new Set<string>();

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId);
      const profile = getGlyphGeometryProfile(ctx);

      expect(profile.length, wonderId).toBeGreaterThan(0);
      profiles.add(profile);
    }

    expect(profiles.size).toBe(wonderIds.length);
  });

  it('keeps material-and-maritime glyph geometry distinct from close existing bespoke landmarks', () => {
    const comparedWonderIds = [
      'grand-canal',
      'sun-spire',
      'world-archive',
      'starvault-observatory',
      'storm-signal-spire',
      'internet',
      'moonwell-gardens',
      'ironroot-foundry',
      'tidecaller-bastion',
      'leviathan-drydock',
    ];
    const profiles = new Set<string>();

    for (const wonderId of comparedWonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId);
      const profile = getGlyphGeometryProfile(ctx);

      expect(profile.length, wonderId).toBeGreaterThan(0);
      profiles.add(profile);
    }

    expect(profiles.size).toBe(comparedWonderIds.length);
  });

  it('draws distinct knowledge-and-signal bespoke glyph geometry', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];
    const profiles = new Set<string>();

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId);
      const profile = getGlyphGeometryProfile(ctx);

      expect(profile.length, wonderId).toBeGreaterThan(0);
      profiles.add(profile);
    }

    expect(profiles.size).toBe(wonderIds.length);
  });

  it('keeps generic silhouette fallback for completed landmarks without bespoke assets', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata: getLegendaryWonderLandmarkMetadata('whispering-exchange'),
      state: 'completed',
      reducedMotion: false,
      nowMs: 1000,
    });

    expect(ctx.operations.some(operation => operation.startsWith('bespoke:'))).toBe(false);
    expect(ctx.operations.some(operation => operation.startsWith('fill:') || operation.startsWith('stroke:'))).toBe(true);
  });

  it('keeps generic silhouette fallback for completed landmarks with unsupported bespoke asset keys', () => {
    const ctx = new MockCanvasContext();
    const metadata = {
      ...getLegendaryWonderLandmarkMetadata('whispering-exchange'),
      assetKey: 'unsupported-bespoke-test-key',
    };

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata,
      state: 'completed',
      reducedMotion: false,
      nowMs: 1000,
    });

    expect(ctx.operations.some(operation => operation.startsWith('bespoke:'))).toBe(false);
    expect(ctx.operations.some(operation => operation.startsWith('fill:') || operation.startsWith('stroke:'))).toBe(true);
  });

  it('keeps construction ghosts instead of completed bespoke art for first-slice builds', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata: getLegendaryWonderLandmarkMetadata('oracle-of-delphi'),
      state: 'under-construction',
      reducedMotion: false,
      nowMs: 1000,
    });

    expect(ctx.operations.some(operation => operation.startsWith('bespoke:'))).toBe(false);
    expect(ctx.operations.some(operation => operation.startsWith('stroke:'))).toBe(true);
  });

  it('keeps construction ghosts instead of completed bespoke art for knowledge-and-signal builds', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];

    for (const wonderId of wonderIds) {
      const ctx = new MockCanvasContext();

      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata: getLegendaryWonderLandmarkMetadata(wonderId),
        state: 'under-construction',
        reducedMotion: false,
        nowMs: 1000,
      });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(false);
      expect(ctx.operations.some(operation => operation.startsWith('stroke:')), wonderId).toBe(true);
    }
  });

  it('keeps construction ghosts instead of completed bespoke art for material-and-maritime builds', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];

    for (const wonderId of wonderIds) {
      const ctx = new MockCanvasContext();

      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata: getLegendaryWonderLandmarkMetadata(wonderId),
        state: 'under-construction',
        reducedMotion: false,
        nowMs: 1000,
      });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(false);
      expect(ctx.operations.some(operation => operation.startsWith('stroke:')), wonderId).toBe(true);
    }
  });

  it('draws nonblank material-and-maritime bespoke glyphs with reduced motion', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId, { reducedMotion: true });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(true);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });

  it('draws nonblank knowledge-and-signal bespoke glyphs with reduced motion', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId, { reducedMotion: true });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(true);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });

  it('draws active construction ghosts as scaffold or outline operations', () => {
    const ctx = new MockCanvasContext();
    drawLegendaryWonderLandmarks({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      size: 48,
      reducedMotion: false,
      lowZoom: false,
      turn: 20,
      entries: [
        {
          wonderId: 'oracle-of-delphi',
          label: 'Oracle of Delphi',
          turnCompleted: Number.MAX_SAFE_INTEGER,
          visual: getWonderVisualDefinition('oracle-of-delphi'),
          state: 'under-construction',
          metadata: getLegendaryWonderLandmarkMetadata('oracle-of-delphi'),
          progressRatio: 0.6,
        },
      ],
    });

    expect(ctx.operations.some(operation => operation.includes('ghost') || operation.startsWith('stroke:'))).toBe(true);
  });
});
