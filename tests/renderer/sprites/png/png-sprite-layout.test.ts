import { describe, expect, it } from 'vitest';
import { PNG_STRIP_FEET_LINE, getPngBakeGeometry, getPngCellPlacement } from '@/renderer/sprites/png/png-sprite-layout';
import { getPngCanvasFrame } from '@/renderer/sprites/png/png-sprite-canvas';
import { buildPngUnitSpriteHtml } from '@/renderer/sprites/png/png-sprite-html';
import { getPngUnitManifest } from '@/renderer/sprites/png/png-sprite-catalog';
import type { PngUnitSprite } from '@/renderer/sprites/png/png-sprite-types';

const strip = (over: Partial<PngUnitSprite> = {}): PngUnitSprite => {
  const clip = { row: 0, firstCol: 0, frames: 2, fps: 4, loop: true };
  const tiers = [clip, clip, clip, clip] as const;
  return {
    id: 'strip', cellWidth: 240, cellHeight: 192, cols: 8, rows: 4, baseline: 176,
    clips: { idle: tiers, walk: tiers, attack: tiers },
    sheet: 'images/units/strip/sheet.png', mask: 'images/units/strip/mask.png', facing: 'right',
    ...over,
  };
};

describe('getPngCellPlacement', () => {
  it('puts a strip cell as tall as the box, centred, with its ground line on the feet line', () => {
    const p = getPngCellPlacement(strip());
    expect(p.widthPct).toBeCloseTo(125, 3);
    expect(p.leftPct).toBeCloseTo(-12.5, 3);
    // baseline 176 of 192 is 0.9167 down the cell; the feet line is 0.8 down the box, so the cell lifts by the difference
    expect(p.topPct).toBeCloseTo((PNG_STRIP_FEET_LINE - 176 / 192) * 100, 3);
    expect(p.topPct).toBeCloseTo(-11.6667, 3);
  });

  it('a square cell narrower than tall is centred inside the box', () => {
    const p = getPngCellPlacement(strip({ cellWidth: 144 })); // the ironclad
    expect(p.widthPct).toBeCloseTo(75, 3);
    expect(p.leftPct).toBeCloseTo(12.5, 3);
  });

  it('a puppet cell fills the box exactly as it always did', () => {
    const puppet = getPngUnitManifest('cavalry')!;
    expect(getPngCellPlacement(puppet)).toEqual({ widthPct: 100, leftPct: 0, topPct: 0 });
  });
});

describe('getPngBakeGeometry', () => {
  it('centres a strip cell in the baked square and lifts it onto the feet line, as the DOM player does', () => {
    const g = getPngBakeGeometry(strip(), 2, 3);
    expect(g).toMatchObject({ side: 192, sx: 3 * 240, sy: 2 * 192 });
    expect(g.dx).toBeCloseTo(-24, 3);
    expect(g.dy).toBeCloseTo(-22.4, 3);
  });

  it('a puppet cell fills the baked square exactly as it always did', () => {
    const cavalry = getPngUnitManifest('cavalry')!;
    expect(getPngBakeGeometry(cavalry, 1, 4)).toEqual({ side: 192, sx: 4 * 192, sy: 192, dx: 0, dy: 0 });
  });
});

describe('the strip frame the low-zoom bake picks', () => {
  it('uses the idle clip for idle and two distinct walk columns for the two motions, wrapped to the clip', () => {
    const sprite = strip();
    expect(getPngCanvasFrame(sprite, 'idle')).toEqual({ state: 'idle', frame: 0 });
    const walk = { row: 1, firstCol: 0, frames: 6, fps: 10, loop: true };
    const six = strip({ clips: { ...sprite.clips, walk: [walk, walk, walk, walk] } });
    expect(getPngCanvasFrame(six, 'move-a')).toEqual({ state: 'walk', frame: 1 });
    expect(getPngCanvasFrame(six, 'move-b')).toEqual({ state: 'walk', frame: 5 });
  });
});

describe('a strip unit\'s list icon and map overlay share one builder', () => {
  it('writes the cell placement into the HTML both surfaces use', () => {
    const html = buildPngUnitSpriteHtml(strip(), '#336699');
    expect(html).toContain('--cell-width:125%');
    expect(html).toContain('--cell-left:-12.5%');
    expect(html).toContain('--cell-top:-11.6667%');
  });
});
