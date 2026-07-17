import type { HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { Camera } from './camera';

/**
 * Pick the render copy of `to` (canonical, or a ±mapWidth ghost) nearest to
 * `from`, so a segment crossing the horizontal wrap seam draws as a short
 * step instead of a line spanning the whole map. Pass mapWidth <= 0 for
 * non-wrapping maps to get `to` unchanged.
 */
export function nearestWrappedCoord(from: HexCoord, to: HexCoord, mapWidth: number): HexCoord {
  if (mapWidth <= 0) return { ...to };
  const directDelta = to.q - from.q;
  const westDelta = to.q - mapWidth - from.q;
  const eastDelta = to.q + mapWidth - from.q;
  const bestDelta = [directDelta, westDelta, eastDelta].sort((a, b) => Math.abs(a) - Math.abs(b))[0]!;
  return { q: from.q + bestDelta, r: to.r };
}

export function getHorizontalWrapRenderCoords(
  coord: HexCoord,
  mapWidth: number,
  camera: Camera,
): HexCoord[] {
  if (mapWidth <= 0) {
    return [{ ...coord }];
  }

  if (
    !Number.isFinite(camera.x) ||
    !Number.isFinite(camera.width) ||
    !Number.isFinite(camera.zoom) ||
    camera.width <= 0 ||
    camera.zoom <= 0
  ) {
    return [
      { q: coord.q - mapWidth, r: coord.r },
      { ...coord },
      { q: coord.q + mapWidth, r: coord.r },
    ];
  }

  const basePixel = hexToPixel(coord, camera.hexSize);
  const wrappedPixel = hexToPixel({ q: coord.q + mapWidth, r: coord.r }, camera.hexSize);
  const wrapSpan = wrappedPixel.x - basePixel.x;
  if (wrapSpan === 0) {
    return [{ ...coord }];
  }

  const margin = camera.hexSize * 2;
  const visibleWorldLeft = camera.x - margin;
  const visibleWorldRight = camera.x + (camera.width / camera.zoom) + margin;

  const minOffset = Math.floor((visibleWorldLeft - basePixel.x) / wrapSpan);
  const maxOffset = Math.ceil((visibleWorldRight - basePixel.x) / wrapSpan);
  const coords: HexCoord[] = [];

  for (let offset = minOffset; offset <= maxOffset; offset++) {
    coords.push({ q: coord.q + offset * mapWidth, r: coord.r });
  }

  return coords;
}
