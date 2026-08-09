export type FortMarkerTier = 'fort' | 'citadel';

export function drawFortMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tier: FortMarkerTier,
): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`fort-marker:${tier}`);
  const height = tier === 'citadel' ? size * 0.42 : size * 0.28;
  const top = cy + size * 0.28 - height;
  ctx.fillStyle = tier === 'citadel' ? 'rgba(126, 112, 92, 0.96)' : 'rgba(104, 91, 72, 0.92)';
  ctx.fillRect(cx - size * 0.3, top, size * 0.6, height);
  ctx.strokeStyle = 'rgba(53, 43, 34, 0.95)';
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(cx - size * 0.3, top, size * 0.6, height);
  if (tier === 'citadel') {
    ctx.fillStyle = 'rgba(232, 193, 112, 0.9)';
    ctx.fillRect(cx - size * 0.04, top - size * 0.12, size * 0.08, size * 0.16);
  }
}
