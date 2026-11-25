import { hexToPixel, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import type { BorderTensionPresentation } from '@/systems/border-confrontation';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

const AREA_FILL = 'rgba(255, 152, 0, 0.14)';
const EDGE_STROKE = 'rgba(255, 183, 77, 0.85)';

/**
 * The disputed-radius overlay (#1766): a faint amber wash over every hex within the border-tension radius of a
 * threatened city, with a dashed outline on the outermost ring. The outline means the boundary is readable without
 * relying on the colour alone. Drawn before fog, like the supply overlay, so fog still dims what the viewer cannot see.
 */
export function drawBorderTensionOverlay(
  ctx: CanvasRenderingContext2D,
  presentation: BorderTensionPresentation,
  mapWidth: number,
  camera: Camera,
  wrapsHorizontally: boolean,
): void {
  if (presentation.tiles.length === 0) return;
  const size = camera.hexSize;
  const scaledSize = size * camera.zoom;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  for (const tile of presentation.tiles) {
    const renderCoords = wrapsHorizontally ? getHorizontalWrapRenderCoords(tile.coord, mapWidth, camera) : [tile.coord];
    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = HEX_CORNERS_POINTY[i];
        const x = screen.x + corner.dx * scaledSize;
        const y = screen.y + corner.dy * scaledSize;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = AREA_FILL;
      ctx.fill();
      if (tile.edge) {
        ctx.strokeStyle = EDGE_STROKE;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
