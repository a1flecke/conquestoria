import { describe, expect, it } from 'vitest';
import { drawLegendaryWonderLandmarks } from '@/renderer/wonders/legendary-wonder-renderer';
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
});
