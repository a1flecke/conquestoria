import { describe, expect, it } from 'vitest';
import { drawNaturalWonderLandmark } from '@/renderer/wonders/natural-wonder-renderer';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  globalAlpha = 1;

  save(): void { this.operations.push('save'); }
  restore(): void { this.operations.push('restore'); }
  beginPath(): void { this.operations.push('beginPath'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  quadraticCurveTo(): void { this.operations.push('quadraticCurveTo'); }
  bezierCurveTo(): void { this.operations.push('bezierCurveTo'); }
  arc(): void { this.operations.push('arc'); }
  ellipse(): void { this.operations.push('ellipse'); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
}

describe('natural-wonder-renderer', () => {
  it('draws a known natural wonder landmark without throwing', () => {
    const ctx = new MockCanvasContext();

    drawNaturalWonderLandmark({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 40,
      cy: 40,
      size: 32,
      wonderId: 'great_volcano',
      presentationKind: 'live',
      nowMs: 1200,
      reducedMotion: false,
    });

    expect(ctx.operations).toContain('save');
    expect(ctx.operations).toContain('restore');
    expect(ctx.operations.some(operation => operation.startsWith('fill:'))).toBe(true);
  });

  it('uses a safe fallback for unknown wonder visuals', () => {
    const ctx = new MockCanvasContext();

    drawNaturalWonderLandmark({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 40,
      cy: 40,
      size: 32,
      wonderId: 'missing-wonder',
      presentationKind: 'last-seen',
      nowMs: 2400,
      reducedMotion: true,
    });

    expect(ctx.operations).toContain('save');
    expect(ctx.operations).toContain('restore');
  });
});
