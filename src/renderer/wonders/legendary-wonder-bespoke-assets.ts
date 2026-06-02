import type { LegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-types';

export const SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS = [
  'oracle-of-delphi-bespoke',
  'grand-canal-bespoke',
  'sun-spire-bespoke',
] as const;

export type LegendaryWonderBespokeAssetKey = typeof SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS[number];

export interface LegendaryWonderBespokeDrawOptions {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  metadata: LegendaryWonderLandmarkMetadata;
  reducedMotion: boolean;
  nowMs: number;
}

export interface LegendaryWonderBespokeAsset {
  key: LegendaryWonderBespokeAssetKey;
  draw: (options: LegendaryWonderBespokeDrawOptions) => void;
}

const BESPOKE_ASSETS: Record<LegendaryWonderBespokeAssetKey, LegendaryWonderBespokeAsset> = {
  'oracle-of-delphi-bespoke': { key: 'oracle-of-delphi-bespoke', draw: drawOracleOfDelphi },
  'grand-canal-bespoke': { key: 'grand-canal-bespoke', draw: drawGrandCanal },
  'sun-spire-bespoke': { key: 'sun-spire-bespoke', draw: drawSunSpire },
};

export function resolveLegendaryWonderBespokeAsset(assetKey: string | undefined): LegendaryWonderBespokeAsset | null {
  if (!assetKey) return null;
  return BESPOKE_ASSETS[assetKey as LegendaryWonderBespokeAssetKey] ?? null;
}

function markBespoke(ctx: CanvasRenderingContext2D, key: LegendaryWonderBespokeAssetKey): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`bespoke:${key}`);
}

function drawOracleOfDelphi(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'oracle-of-delphi-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.72);
  ctx.lineTo(cx + radius * 0.24, cy - radius * 0.1);
  ctx.lineTo(cx - radius * 0.24, cy - radius * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.18, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.46, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.18, cy - radius * 0.05);
  ctx.moveTo(cx + radius * 0.46, cy + radius * 0.58);
  ctx.lineTo(cx + radius * 0.18, cy - radius * 0.05);
  ctx.moveTo(cx - radius * 0.34, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.2);
  ctx.stroke();
}

function drawGrandCanal(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'grand-canal-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.68, cy - radius * 0.44, radius * 1.36, radius * 0.88);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy - radius * 0.18);
  ctx.lineTo(cx + radius * 0.56, cy - radius * 0.18);
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.12);
  ctx.lineTo(cx + radius * 0.56, cy + radius * 0.12);
  ctx.strokeStyle = metadata.palette.base;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.44, radius * 0.44, Math.PI, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawSunSpire(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'sun-spire-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.48, radius * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    ctx.moveTo(cx + Math.cos(angle) * radius * 0.34, cy - radius * 0.48 + Math.sin(angle) * radius * 0.34);
    ctx.lineTo(cx + Math.cos(angle) * radius * 0.52, cy - radius * 0.48 + Math.sin(angle) * radius * 0.52);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.3, cy + radius * 0.64);
  ctx.lineTo(cx, cy + radius * 0.42);
  ctx.lineTo(cx - radius * 0.3, cy + radius * 0.64);
  ctx.closePath();
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.stroke();
}
