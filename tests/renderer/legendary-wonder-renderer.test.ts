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
  arc(): void { this.operations.push('arc'); }
  rect(): void { this.operations.push('rect'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
  fillText(text: string): void { this.operations.push(`text:${text}`); }
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

  it('keeps generic silhouette fallback for completed landmarks without bespoke assets', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata: getLegendaryWonderLandmarkMetadata('world-archive'),
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
      ...getLegendaryWonderLandmarkMetadata('world-archive'),
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
