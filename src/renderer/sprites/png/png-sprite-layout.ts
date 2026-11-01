import type { PngUnitSprite } from './png-sprite-types';

/**
 * Where a strip cell's ground line lands in the square unit box, as a fraction of its height. Puppet units put their feet at
 * 0.74–0.8 (`rigs/*.json` `baseline`) and the health bar sits at 0.78, so a strip's own 176/192 baseline would hang below it.
 */
export const PNG_STRIP_FEET_LINE = 0.8;

/** The cell's box inside the unit box, as percentages of it. A puppet cell is the whole box. */
export interface PngCellPlacement {
  widthPct: number;
  leftPct: number;
  topPct: number;
}

export function getPngCellPlacement(sprite: PngUnitSprite): PngCellPlacement {
  if (sprite.baseline === null) return { widthPct: 100, leftPct: 0, topPct: 0 };
  // a strip cell is as tall as the box and as wide as its own aspect needs, centred, then lifted so the ground line sits on the feet line
  const widthPct = (sprite.cellWidth / sprite.cellHeight) * 100;
  return {
    widthPct,
    leftPct: 50 - widthPct / 2,
    topPct: (PNG_STRIP_FEET_LINE - sprite.baseline / sprite.cellHeight) * 100,
  };
}

/**
 * Where the Canvas bake copies a cell from and to. The bake draws into a square `side x side` image (the unit box), so a
 * strip cell, wider than the box, is centred in it and lifted onto the feet line exactly as the DOM player places it; a
 * puppet cell is already square and fills it (`dx = dy = 0`). `col` is the sheet column of the frame being baked.
 */
export interface PngBakeGeometry {
  side: number;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
}

export function getPngBakeGeometry(sprite: PngUnitSprite, row: number, col: number): PngBakeGeometry {
  const side = sprite.cellHeight;
  return {
    side,
    sx: col * sprite.cellWidth,
    sy: row * sprite.cellHeight,
    dx: (side - sprite.cellWidth) / 2,
    dy: (getPngCellPlacement(sprite).topPct / 100) * side,
  };
}
