import { hexToPixel, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import type { SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

const COVERAGE_FILL: Record<'full' | 'stable-unsupported', string> = {
  full: 'rgba(80, 200, 120, 0.28)',
  'stable-unsupported': 'rgba(232, 193, 112, 0.22)',
};

const SOURCE_COLOR: Record<'city' | 'fort' | 'ship', string> = {
  city: '#f8d28a',
  fort: '#8b7355',
  ship: '#5dd5ff',
};

/**
 * Toggleable supply overlay (#544 MR2, contract §12). Mirrors
 * `fog-renderer.ts`'s `drawFogOfWar` shape, but iterates the already
 * viewer/visibility-filtered `presentation.tiles`/`presentation.sources`
 * arrays instead of scanning every map coordinate -- the filtering already
 * happened once in `getSupplyOverlayPresentationForViewer`.
 *
 * Colorblind note: `full` and `stable-unsupported` are hue-distinct but both
 * read as muted yellow-green under deuteranopia. Same accommodation this
 * codebase already uses for `paradrop-target`/`air-assault-target`
 * highlights: the unit panel's status line (src/ui/selected-unit-info.ts)
 * spells out "Full Supply" vs. "Stable but Unsupported" in words, so color
 * is never the only signal.
 */
export function drawSupplyOverlay(
  ctx: CanvasRenderingContext2D,
  presentation: SupplyOverlayPresentation,
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
      ctx.fillStyle = COVERAGE_FILL[tile.coverage];
      ctx.fill();
    }
  }

  for (const source of presentation.sources) {
    const pixel = hexToPixel(source.coord, size);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * camera.zoom * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = SOURCE_COLOR[source.kind];
    ctx.fill();
  }
}
