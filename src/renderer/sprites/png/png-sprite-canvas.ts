import type { UnitSpriteMotion } from '../units';
import { pngSpriteUrl } from './png-sprite-html';
import type { PngPuppetState, PngUnitSprite } from './png-sprite-types';

/**
 * Canvas counterpart of the DOM player, for the low-zoom map layer (and anywhere an HTMLImageElement is needed).
 * It composes exactly what CSS composes — base frame, then the civ colour cut to the mask and multiplied on — so the two
 * renderers show the same unit.
 */

/** Which sheet frame stands in for each static motion the Canvas layer asks for. */
export function getPngCanvasFrame(manifest: PngUnitSprite, motion: UnitSpriteMotion): { state: PngPuppetState; frame: number } {
  if (motion === 'move-a') return { state: 'walk', frame: 1 % manifest.clips.walk[0].frames };
  if (motion === 'move-b') return { state: 'walk', frame: 5 % manifest.clips.walk[0].frames };
  return { state: 'idle', frame: 0 };
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
): Promise<HTMLImageElement> {
  const [sheet, mask] = await Promise.all([
    loadImage(pngSpriteUrl(manifest, 'sheet')),
    loadImage(pngSpriteUrl(manifest, 'mask')),
  ]);
  const { state, frame } = getPngCanvasFrame(manifest, motion);
  const S = manifest.cellHeight; // puppet cells are square; strip framing arrives with #1627 Task 6
  const sx = frame * S;
  const sy = manifest.clips[state][0].row * S;

  const out = makeCanvas(S);
  const ctx = out.getContext('2d');
  const tintCanvas = makeCanvas(S);
  const tctx = tintCanvas.getContext('2d');
  if (!ctx || !tctx) throw new Error('2D canvas unavailable');

  ctx.drawImage(sheet, sx, sy, S, S, 0, 0, S, S);
  // civ colour cut to the mask, then multiplied onto the grey tint region of the base
  tctx.drawImage(mask, sx, sy, S, S, 0, 0, S, S);
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
