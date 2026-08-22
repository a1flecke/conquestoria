import type { Camera } from './camera';
import type { HerdRoutePresentationItem } from '@/systems/stampede-route-system';
import { hexToPixel } from '@/systems/hex-utils';

export function drawStampedeRouteOverlay(ctx: CanvasRenderingContext2D, camera: Camera, routes: readonly HerdRoutePresentationItem[]): void {
  ctx.save(); ctx.fillStyle = '#f6d365'; ctx.strokeStyle = '#4b2e12'; ctx.lineWidth = 2;
  for (const route of routes) for (const step of route.steps) {
    const pixel = hexToPixel(step, camera.hexSize); const screen = camera.worldToScreen(pixel.x, pixel.y); const size = camera.hexSize * camera.zoom * .16;
    ctx.beginPath(); ctx.moveTo(screen.x, screen.y - size); ctx.lineTo(screen.x + size, screen.y + size); ctx.lineTo(screen.x - size, screen.y + size); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
