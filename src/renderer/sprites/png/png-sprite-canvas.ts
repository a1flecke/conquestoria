import type { UnitSpriteMotion } from '../units';
import { pngSpriteUrl } from './png-sprite-html';
import { getPngBakeGeometry } from './png-sprite-layout';
import { toPngDamageTier } from './png-sprite-playback';
import type { PngDamageTier, PngPuppetState, PngUnitSprite } from './png-sprite-types';

/**
 * Canvas counterpart of the DOM player, for the low-zoom map layer (and anywhere an HTMLImageElement is needed).
 * It composes exactly what CSS composes — base frame, then the civ colour cut to the mask and multiplied on — so the two
 * renderers show the same unit.
 */

/** Which sheet frame stands in for each static motion the Canvas layer asks for, at the unit's damage tier (#1627). */
export function getPngCanvasFrame(
  manifest: PngUnitSprite,
  motion: UnitSpriteMotion,
  tier: PngDamageTier = 0,
): { state: PngPuppetState; frame: number } {
  if (motion === 'move-a') return { state: 'walk', frame: 1 % manifest.clips.walk[tier].frames };
  if (motion === 'move-b') return { state: 'walk', frame: 5 % manifest.clips.walk[tier].frames };
  return { state: 'idle', frame: 0 };
}

/** The damage tiers (1..3) whose idle or walk art differs from the healthy art, so only those are baked separately. */
export function getPngCanvasDamageTiers(manifest: PngUnitSprite): PngDamageTier[] {
  const tiers: PngDamageTier[] = [];
  for (const t of [1, 2, 3] as const) {
    const differs = (['idle', 'walk'] as const).some(state => {
      const a = manifest.clips[state][0];
      const b = manifest.clips[state][t];
      return a.row !== b.row || a.firstCol !== b.firstCol;
    });
    if (differs) tiers.push(t);
  }
  return tiers;
}

/** The cache key of one baked frame. Tier 0 keeps the historical key so every existing lookup still works. */
export function pngCanvasCacheKey(id: string, motion: UnitSpriteMotion, tier: number): string {
  const t = toPngDamageTier(tier);
  return t === 0 ? `${id}:${motion}` : `${id}:${motion}:d${t}`;
}

const imageLoads = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let load = imageLoads.get(url);
  if (!load) {
    load = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { imageLoads.delete(url); reject(new Error(`PNG sprite failed to load: ${url}`)); };
      img.src = url;
    });
    imageLoads.set(url, load);
  }
  return load;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Bake one tinted frame to an image. Rejects when no 2D canvas or sheet is available; callers fall back to SVG. */
export async function bakePngUnitImage(
  manifest: PngUnitSprite,
  tint: string,
  motion: UnitSpriteMotion,
  tier: PngDamageTier = 0,
): Promise<HTMLImageElement> {
  const [sheet, mask] = await Promise.all([
    loadImage(pngSpriteUrl(manifest, 'sheet')),
    loadImage(pngSpriteUrl(manifest, 'mask')),
  ]);
  const { state, frame } = getPngCanvasFrame(manifest, motion, tier);
  const clip = manifest.clips[state][tier];
  const { side: S, sx, sy, dx, dy } = getPngBakeGeometry(manifest, clip.row, clip.firstCol + frame);
  const { cellWidth: W, cellHeight: H } = manifest;

  const out = makeCanvas(S);
  const ctx = out.getContext('2d');
  const tintCanvas = makeCanvas(S);
  const tctx = tintCanvas.getContext('2d');
  if (!ctx || !tctx) throw new Error('2D canvas unavailable');

  ctx.drawImage(sheet, sx, sy, W, H, dx, dy, W, H);
  // civ colour cut to the mask, then multiplied onto the grey tint region of the base
  tctx.drawImage(mask, sx, sy, W, H, dx, dy, W, H);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = tint;
  tctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(tintCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(S, S);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('baked PNG sprite failed to decode'));
    img.src = out.toDataURL('image/png');
  });
}
