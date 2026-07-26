import type { AirDefenseCoverageProvider, GameMap } from '@/core/types';
import type { Camera } from './camera';
import { hexToPixel } from '@/systems/hex-utils';

export function drawAirDefenseOverlay(ctx: CanvasRenderingContext2D, camera: Camera, _map: GameMap, providers: AirDefenseCoverageProvider[]): void {
  ctx.save(); ctx.strokeStyle = 'rgba(93,213,255,.8)'; ctx.fillStyle = 'rgba(93,213,255,.12)'; ctx.lineWidth = 2;
  for (const provider of providers) { const pixel = hexToPixel(provider.position, camera.hexSize); const screen = camera.worldToScreen(pixel.x, pixel.y); const radius = camera.hexSize * camera.zoom * (provider.radius + .42); ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d9f8ff'; ctx.fillText('AA', screen.x - 7, screen.y + 4); ctx.fillStyle = 'rgba(93,213,255,.12)'; }
  ctx.restore();
}
