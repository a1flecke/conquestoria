import { describe, expect, it } from 'vitest';
import {
  CANVAS_WONDER_SPECTACLE_PRIMITIVES,
  drawNaturalWonderSpectacleEffects,
} from '@/renderer/wonders/natural-wonder-effects-renderer';
import { getNaturalWonderSpectacleRecipes } from '@/systems/wonder-spectacle/presentation';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = '';

  save(): void { this.operations.push('save'); }
  restore(): void { this.operations.push('restore'); }
  beginPath(): void { this.operations.push('beginPath'); }
  arc(): void { this.operations.push('arc'); }
  ellipse(): void { this.operations.push('ellipse'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  bezierCurveTo(): void { this.operations.push('bezierCurveTo'); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
}

describe('natural wonder spectacle canvas adapter', () => {
  it('supports every primitive used by recipes', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      for (const primitive of [...recipe.mapPrimitives, ...recipe.codexPrimitives, ...recipe.revealPrimitives]) {
        expect(CANVAS_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
      }
    }
  });

  it('draws animated map effects only for map-animated mode', () => {
    const animated = new MockCanvasContext();
    drawNaturalWonderSpectacleEffects({
      ctx: animated as unknown as CanvasRenderingContext2D,
      wonderId: 'great_volcano',
      cx: 50,
      cy: 50,
      size: 40,
      nowMs: 1200,
      mode: 'map-animated',
    });
    expect(animated.operations).toContain('save');
    expect(animated.operations).toContain('restore');
    expect(animated.operations.some(operation => operation.startsWith('fill:'))).toBe(true);

    const staticCtx = new MockCanvasContext();
    drawNaturalWonderSpectacleEffects({
      ctx: staticCtx as unknown as CanvasRenderingContext2D,
      wonderId: 'great_volcano',
      cx: 50,
      cy: 50,
      size: 40,
      nowMs: 1200,
      mode: 'map-static',
    });
    expect(staticCtx.operations).toEqual([]);
  });
});
