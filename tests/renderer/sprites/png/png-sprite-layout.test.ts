import { describe, expect, it } from 'vitest';
import { PNG_STRIP_FEET_LINE, getPngCellPlacement } from '@/renderer/sprites/png/png-sprite-layout';
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
    const puppet = getPngUnitManifest('horseman')!;
    expect(getPngCellPlacement(puppet)).toEqual({ widthPct: 100, leftPct: 0, topPct: 0 });
  });
});
