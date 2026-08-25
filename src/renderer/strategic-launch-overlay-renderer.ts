import { hexToPixel, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import type { StrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

// Distinct from supply-overlay-renderer.ts's greens/yellows -- a strike
// preview must read as unambiguously hostile/dangerous. Never the only
// signal: the launch-flow UI's text preview (stage 2) spells out the exact
// tile count and effect in words alongside this overlay.
const BLAST_RADIUS_FILL = 'rgba(200, 60, 40, 0.30)';
const BLAST_RADIUS_STROKE = 'rgba(255, 120, 90, 0.55)';

export function drawStrategicLaunchPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  presentation: StrategicLaunchPreviewPresentation,
  mapWidth: number,
  mapHeight: number,
  camera: Camera,
  wrapsHorizontally: boolean,
): void {
  const size = camera.hexSize;
  for (const tile of presentation.tiles) {
    const renderCoords = wrapsHorizontally
      ? getHorizontalWrapRenderCoords(tile.coord, mapWidth, camera)
      : [tile.coord];
    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, size);
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
      ctx.fillStyle = BLAST_RADIUS_FILL;
      ctx.fill();
      ctx.strokeStyle = BLAST_RADIUS_STROKE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
