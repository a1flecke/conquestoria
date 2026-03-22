import type { VisibilityMap } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { Camera } from './camera';

const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();

export function drawFogOfWar(
  ctx: CanvasRenderingContext2D,
  visibility: VisibilityMap,
  mapWidth: number,
  mapHeight: number,
  camera: Camera,
): void {
  const size = camera.hexSize;

  for (let r = 0; r < mapHeight; r++) {
    for (let q = 0; q < mapWidth; q++) {
      const coord = { q, r };
      if (!camera.isHexVisible(coord)) continue;

      const vis = getVisibility(visibility, coord);
      if (vis === 'visible') continue; // No overlay needed

      const pixel = hexToPixel(coord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = HEX_CORNERS_POINTY[i];
        const x = screen.x + corner.dx * scaledSize;
        const y = screen.y + corner.dy * scaledSize;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      if (vis === 'unexplored') {
        ctx.fillStyle = 'rgba(15, 15, 25, 0.95)';
      } else {
        // fog — dimmed
        ctx.fillStyle = 'rgba(15, 15, 25, 0.55)';
      }
      ctx.fill();
    }
  }
}
