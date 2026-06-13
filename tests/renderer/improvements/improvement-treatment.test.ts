import { describe, expect, it } from 'vitest';
import {
  drawImprovementTreatment,
  getImprovementTreatmentFamily,
} from '@/renderer/improvements/improvement-treatment';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  beginPath(): void { this.operations.push('beginPath'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  closePath(): void { this.operations.push('closePath'); }
  arc(): void { this.operations.push('arc'); }
  rect(): void { this.operations.push('rect'); }
  fill(): void { this.operations.push('fill'); }
  stroke(): void { this.operations.push('stroke'); }
}

const IMPROVEMENTS = ['farm', 'mine', 'lumber_camp', 'watermill', 'plantation', 'pasture', 'camp', 'quarry'] as const;

describe('improvement terrain treatments', () => {
  it.each(IMPROVEMENTS)('draws %s as deterministic Canvas terrain geometry', improvement => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;

    expect(drawImprovementTreatment(ctx, improvement, 0, 0, 48)).toBe(true);
    expect((ctx as unknown as MockCanvasContext).operations).toContain(`improvement-treatment:${improvement}`);
  });

  it('makes farms read as field rows rather than managed trees', () => {
    expect(getImprovementTreatmentFamily('farm')).toBe('field-rows');
    expect(getImprovementTreatmentFamily('lumber_camp')).toBe('managed-timber');
    expect(getImprovementTreatmentFamily('farm')).not.toBe(getImprovementTreatmentFamily('lumber_camp'));
  });

  it('does not claim unknown improvements', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    expect(drawImprovementTreatment(ctx, 'unknown', 0, 0, 48)).toBe(false);
  });
});
