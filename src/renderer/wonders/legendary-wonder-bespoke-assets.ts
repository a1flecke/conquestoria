import type { LegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-types';

export const SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS = [
  'oracle-of-delphi-bespoke',
  'grand-canal-bespoke',
  'sun-spire-bespoke',
  'world-archive-bespoke',
  'starvault-observatory-bespoke',
  'storm-signal-spire-bespoke',
  'internet-bespoke',
  'moonwell-gardens-bespoke',
  'ironroot-foundry-bespoke',
  'tidecaller-bastion-bespoke',
  'leviathan-drydock-bespoke',
  'whispering-exchange-bespoke',
  'hall-of-champions-bespoke',
  'gate-of-the-world-bespoke',
  'manhattan-project-bespoke',
  'sistine-vault-bespoke',
  'codex-eternal-bespoke',
  'navigators-compass-bespoke',
  'palace-of-the-sun-bespoke',
  'iron-arsenal-bespoke',
  'merchant-admiralty-bespoke',
  'crystal-palace-bespoke',
  'suez-canal-bespoke',
  'continental-congress-bespoke',
  'eiffel-tower-bespoke',
  'brooklyn-bridge-bespoke',
  'trans-siberian-railway-bespoke',
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
  'world-archive-bespoke': { key: 'world-archive-bespoke', draw: drawWorldArchive },
  'starvault-observatory-bespoke': { key: 'starvault-observatory-bespoke', draw: drawStarvaultObservatory },
  'storm-signal-spire-bespoke': { key: 'storm-signal-spire-bespoke', draw: drawStormSignalSpire },
  'internet-bespoke': { key: 'internet-bespoke', draw: drawInternet },
  'moonwell-gardens-bespoke': { key: 'moonwell-gardens-bespoke', draw: drawMoonwellGardens },
  'ironroot-foundry-bespoke': { key: 'ironroot-foundry-bespoke', draw: drawIronrootFoundry },
  'tidecaller-bastion-bespoke': { key: 'tidecaller-bastion-bespoke', draw: drawTidecallerBastion },
  'leviathan-drydock-bespoke': { key: 'leviathan-drydock-bespoke', draw: drawLeviathanDrydock },
  'whispering-exchange-bespoke': { key: 'whispering-exchange-bespoke', draw: drawWhisperingExchange },
  'hall-of-champions-bespoke': { key: 'hall-of-champions-bespoke', draw: drawHallOfChampions },
  'gate-of-the-world-bespoke': { key: 'gate-of-the-world-bespoke', draw: drawGateOfTheWorld },
  'manhattan-project-bespoke': { key: 'manhattan-project-bespoke', draw: drawManhattanProject },
  'sistine-vault-bespoke': { key: 'sistine-vault-bespoke', draw: drawSistineVault },
  'codex-eternal-bespoke': { key: 'codex-eternal-bespoke', draw: drawCodexEternal },
  'navigators-compass-bespoke': { key: 'navigators-compass-bespoke', draw: drawNavigatorsCompass },
  'palace-of-the-sun-bespoke': { key: 'palace-of-the-sun-bespoke', draw: drawPalaceOfTheSun },
  'iron-arsenal-bespoke': { key: 'iron-arsenal-bespoke', draw: drawIronArsenal },
  'merchant-admiralty-bespoke': { key: 'merchant-admiralty-bespoke', draw: drawMerchantAdmiralty },
  'crystal-palace-bespoke': { key: 'crystal-palace-bespoke', draw: drawCrystalPalace },
  'suez-canal-bespoke': { key: 'suez-canal-bespoke', draw: drawSuezCanal },
  'continental-congress-bespoke': { key: 'continental-congress-bespoke', draw: drawContinentalCongress },
  'eiffel-tower-bespoke': { key: 'eiffel-tower-bespoke', draw: drawEiffelTower },
  'brooklyn-bridge-bespoke': { key: 'brooklyn-bridge-bespoke', draw: drawBrooklynBridge },
  'trans-siberian-railway-bespoke': { key: 'trans-siberian-railway-bespoke', draw: drawTransSiberianRailway },
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

function drawWorldArchive(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'world-archive-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.64, cy - radius * 0.56, radius * 1.28, radius * 1.08);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 4; index += 1) {
    const x = cx - radius * 0.48 + index * radius * 0.32;
    ctx.moveTo(x, cy - radius * 0.46);
    ctx.lineTo(x, cy + radius * 0.46);
  }
  ctx.moveTo(cx - radius * 0.52, cy - radius * 0.12);
  ctx.lineTo(cx + radius * 0.52, cy - radius * 0.12);
  ctx.moveTo(cx - radius * 0.52, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.52, cy + radius * 0.2);
  ctx.strokeStyle = metadata.palette.base;
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.16, cy - radius * 0.24, radius * 0.32, radius * 0.48);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

function drawStarvaultObservatory(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'starvault-observatory-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.28, radius * 0.62, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.62, cy + radius * 0.48);
  ctx.lineTo(cx - radius * 0.62, cy + radius * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.08, radius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.42, cy - radius * 0.58);
  ctx.lineTo(cx - radius * 0.32, cy - radius * 0.46);
  ctx.moveTo(cx + radius * 0.42, cy - radius * 0.54);
  ctx.lineTo(cx + radius * 0.52, cy - radius * 0.42);
  ctx.moveTo(cx, cy - radius * 0.74);
  ctx.lineTo(cx, cy - radius * 0.56);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawStormSignalSpire(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'storm-signal-spire-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.72);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.62);
  ctx.lineTo(cx, cy + radius * 0.42);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.5, cy - radius * 0.36);
  ctx.lineTo(cx - radius * 0.28, cy - radius * 0.24);
  ctx.lineTo(cx - radius * 0.5, cy - radius * 0.12);
  ctx.moveTo(cx + radius * 0.5, cy - radius * 0.36);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.24);
  ctx.lineTo(cx + radius * 0.5, cy - radius * 0.12);
  ctx.moveTo(cx - radius * 0.68, cy + radius * 0.06);
  ctx.lineTo(cx - radius * 0.36, cy + radius * 0.18);
  ctx.moveTo(cx + radius * 0.68, cy + radius * 0.06);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.18);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawInternet(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'internet-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.06);

  const nodes = [
    { x: cx, y: cy - radius * 0.5 },
    { x: cx + radius * 0.52, y: cy - radius * 0.16 },
    { x: cx + radius * 0.32, y: cy + radius * 0.48 },
    { x: cx - radius * 0.32, y: cy + radius * 0.48 },
    { x: cx - radius * 0.52, y: cy - radius * 0.16 },
    { x: cx, y: cy },
  ];

  ctx.beginPath();
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const node = nodes[index];
    const next = nodes[(index + 1) % (nodes.length - 1)];
    ctx.moveTo(node.x, node.y);
    ctx.lineTo(next.x, next.y);
    ctx.moveTo(node.x, node.y);
    ctx.lineTo(nodes[5].x, nodes[5].y);
  }
  ctx.stroke();

  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = node === nodes[5] ? metadata.palette.glow : metadata.palette.accent;
    ctx.fill();
    ctx.strokeStyle = metadata.palette.glow;
    ctx.stroke();
  }
}

function drawMoonwellGardens(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'moonwell-gardens-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.2, radius * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.08, cy - radius * 0.42, radius * 0.28, Math.PI * 0.2, Math.PI * 1.6);
  ctx.arc(cx + radius * 0.04, cy - radius * 0.42, radius * 0.22, Math.PI * 1.55, Math.PI * 0.25, true);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.36);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.18);
  ctx.lineTo(cx - radius * 0.08, cy + radius * 0.44);
  ctx.moveTo(cx + radius * 0.56, cy + radius * 0.36);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.18);
  ctx.lineTo(cx + radius * 0.08, cy + radius * 0.44);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawIronrootFoundry(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'ironroot-foundry-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.36, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.22, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.22, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.14, cy - radius * 0.18, radius * 0.28, radius * 0.42);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.34);
  ctx.lineTo(cx - radius * 0.5, cy + radius * 0.08);
  ctx.moveTo(cx + radius * 0.56, cy + radius * 0.58);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.34);
  ctx.lineTo(cx + radius * 0.5, cy + radius * 0.08);
  ctx.moveTo(cx - radius * 0.28, cy - radius * 0.02);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.02);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawTidecallerBastion(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'tidecaller-bastion-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.58, cy + radius * 0.32);
  ctx.lineTo(cx - radius * 0.58, cy - radius * 0.28);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.28);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.16, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.16, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.16, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.16, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.58, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.58, cy + radius * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.42, radius * 0.52, Math.PI, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.52, cy + radius * 0.52);
  ctx.lineTo(cx - radius * 0.18, cy + radius * 0.42);
  ctx.lineTo(cx + radius * 0.18, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.52, cy + radius * 0.42);
  ctx.stroke();
}

function drawLeviathanDrydock(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'leviathan-drydock-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.62, cy + radius * 0.24);
  ctx.lineTo(cx - radius * 0.36, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.62, cy + radius * 0.24);
  ctx.lineTo(cx + radius * 0.34, cy - radius * 0.12);
  ctx.lineTo(cx - radius * 0.34, cy - radius * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 4; index += 1) {
    const x = cx - radius * 0.36 + index * radius * 0.24;
    ctx.moveTo(x, cy + radius * 0.5);
    ctx.lineTo(cx, cy - radius * 0.44 + index * radius * 0.05);
  }
  ctx.moveTo(cx - radius * 0.46, cy + radius * 0.04);
  ctx.lineTo(cx + radius * 0.46, cy + radius * 0.04);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.5, cy - radius * 0.58, radius * 0.16, radius * 0.36);
  ctx.rect(cx + radius * 0.34, cy - radius * 0.58, radius * 0.16, radius * 0.36);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

function drawWhisperingExchange(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'whispering-exchange-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.52, cy - radius * 0.28, radius * 1.04, radius * 0.56);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.22, cy + radius * 0.08, radius * 0.14, 0, Math.PI * 2);
  ctx.arc(cx + radius * 0.22, cy + radius * 0.08, radius * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.64, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.28, cy - radius * 0.62);
  ctx.lineTo(cx + radius * 0.08, cy - radius * 0.48);
  ctx.moveTo(cx + radius * 0.64, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.62);
  ctx.lineTo(cx - radius * 0.08, cy - radius * 0.48);
  ctx.moveTo(cx - radius * 0.38, cy + radius * 0.38);
  ctx.lineTo(cx + radius * 0.38, cy + radius * 0.38);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawHallOfChampions(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'hall-of-champions-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.58, cy - radius * 0.22);
  ctx.lineTo(cx, cy - radius * 0.58);
  ctx.lineTo(cx + radius * 0.58, cy - radius * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const x = cx - radius * 0.32 + index * radius * 0.32;
    ctx.rect(x - radius * 0.06, cy - radius * 0.18, radius * 0.12, radius * 0.58);
  }
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.18, cy + radius * 0.04, radius * 0.28, Math.PI * 0.55, Math.PI * 1.35);
  ctx.arc(cx + radius * 0.18, cy + radius * 0.04, radius * 0.28, Math.PI * 1.65, Math.PI * 0.45, true);
  ctx.moveTo(cx - radius * 0.48, cy + radius * 0.5);
  ctx.lineTo(cx + radius * 0.48, cy + radius * 0.5);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawGateOfTheWorld(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'gate-of-the-world-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.54, cy + radius * 0.56);
  ctx.lineTo(cx - radius * 0.54, cy - radius * 0.08);
  ctx.arc(cx, cy - radius * 0.08, radius * 0.54, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.54, cy + radius * 0.56);
  ctx.lineTo(cx + radius * 0.28, cy + radius * 0.56);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.02);
  ctx.arc(cx, cy - radius * 0.02, radius * 0.28, 0, Math.PI, true);
  ctx.lineTo(cx - radius * 0.28, cy + radius * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.66, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.26, cy + radius * 0.08);
  ctx.lineTo(cx + radius * 0.1, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.66, cy + radius * 0.04);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawManhattanProject(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'manhattan-project-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.06);

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.moveTo(cx - radius * 0.62, cy);
  ctx.lineTo(cx + radius * 0.62, cy);
  ctx.moveTo(cx - radius * 0.34, cy - radius * 0.5);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.5);
  ctx.moveTo(cx + radius * 0.34, cy - radius * 0.5);
  ctx.lineTo(cx - radius * 0.34, cy + radius * 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.16, cy - radius * 0.16, radius * 0.32, radius * 0.32);
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

function drawSistineVault(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'sistine-vault-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  // Arched vault body
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.54);
  ctx.lineTo(cx - radius * 0.56, cy - radius * 0.12);
  ctx.arc(cx, cy - radius * 0.12, radius * 0.56, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.56, cy + radius * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner arch
  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.04, radius * 0.34, Math.PI, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  // Columns
  ctx.beginPath();
  for (const x of [cx - radius * 0.38, cx + radius * 0.38]) {
    ctx.moveTo(x, cy + radius * 0.52);
    ctx.lineTo(x, cy - radius * 0.08);
  }
  ctx.strokeStyle = metadata.palette.base;
  ctx.stroke();
}

function drawCodexEternal(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'codex-eternal-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  // Book cover
  ctx.beginPath();
  ctx.rect(cx - radius * 0.52, cy - radius * 0.58, radius * 1.04, radius * 1.12);
  ctx.fill();
  ctx.stroke();

  // Spine
  ctx.beginPath();
  ctx.rect(cx - radius * 0.52, cy - radius * 0.58, radius * 0.14, radius * 1.12);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  // Text lines
  ctx.beginPath();
  ctx.strokeStyle = metadata.palette.base;
  for (let index = 0; index < 5; index += 1) {
    const y = cy - radius * 0.36 + index * radius * 0.22;
    ctx.moveTo(cx - radius * 0.28, y);
    ctx.lineTo(cx + radius * 0.38, y);
  }
  ctx.stroke();
}

function drawNavigatorsCompass(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'navigators-compass-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.06);

  // Outer compass ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.accent;
  ctx.stroke();

  // Cardinal points
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  ctx.beginPath();
  for (const angle of angles) {
    ctx.moveTo(cx + Math.cos(angle) * radius * 0.58, cy + Math.sin(angle) * radius * 0.58);
    ctx.lineTo(cx + Math.cos(angle) * radius * 0.44, cy + Math.sin(angle) * radius * 0.44);
  }
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  // Compass needle (north pointing up)
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.42);
  ctx.lineTo(cx + radius * 0.1, cy + radius * 0.12);
  ctx.lineTo(cx, cy + radius * 0.06);
  ctx.closePath();
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy + radius * 0.42);
  ctx.lineTo(cx - radius * 0.1, cy - radius * 0.12);
  ctx.lineTo(cx, cy - radius * 0.06);
  ctx.closePath();
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with a grand baroque palace: symmetrical wings, golden dome, formal gardens in foreground, sun-ray spires on rooftop. Use generate-sprite-prompt skill.
function drawPalaceOfTheSun(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'palace-of-the-sun-bespoke');

  // Sun corona rays
  const rayCount = 12;
  ctx.beginPath();
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 - Math.PI / 2;
    const inner = radius * 0.55;
    const outer = radius * (i % 2 === 0 ? 1.0 : 0.75);
    if (i === 0) {
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    }
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    const nextAngle = ((i + 0.5) / rayCount) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(nextAngle) * inner, cy + Math.sin(nextAngle) * inner);
  }
  ctx.closePath();
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();

  // Central palace facade
  ctx.fillStyle = metadata.palette.base;
  ctx.fillRect(cx - radius * 0.28, cy - radius * 0.2, radius * 0.56, radius * 0.5);

  // Central disc
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with a sprawling state arsenal: long brick warehouse sheds, cannon rows on foreground docks, belching foundry chimneys, military galleys being fitted in slips. Use generate-sprite-prompt skill.
function drawIronArsenal(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, metadata } = options;
  const r = options.radius;
  markBespoke(ctx, 'iron-arsenal-bespoke');

  // Star-fort silhouette (5-pointed star bastion)
  const pts = 5;
  const outerR = r;
  const innerR = r * 0.48;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    const dist = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = metadata.palette.base;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Cannon emblem in center
  ctx.fillStyle = metadata.palette.accent;
  ctx.fillRect(cx - r * 0.22, cy - r * 0.07, r * 0.44, r * 0.14);
  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Glow center
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with a harbor admiralty office: columned waterfront building, tall-masted ships at quay, heraldic anchor above arched entrance, signal lanterns on roof masts. Use generate-sprite-prompt skill.
function drawMerchantAdmiralty(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, metadata } = options;
  const r = options.radius;
  markBespoke(ctx, 'merchant-admiralty-bespoke');

  // Compass rose / admiralty wheel
  const spokes = 8;
  ctx.strokeStyle = metadata.palette.accent;
  ctx.lineWidth = 3;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r * 0.18, cy + Math.sin(angle) * r * 0.18);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.85, cy + Math.sin(angle) * r * 0.85);
    ctx.stroke();
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.base;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Ship silhouette in center
  ctx.fillStyle = metadata.palette.base;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.22);
  ctx.lineTo(cx + r * 0.18, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.18, cy + r * 0.12);
  ctx.closePath();
  ctx.fill();

  // Center glow
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with Victorian glass-and-iron exhibition hall: long barrel-vaulted nave of wrought-iron ribs filled with plate glass, arched transept, factory machinery and crystal exhibits visible inside. Use generate-sprite-prompt skill.
function drawCrystalPalace(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'crystal-palace-bespoke');

  // Iron-rib barrel vault outline
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r * 0.45, 0, Math.PI, 0);
  ctx.strokeStyle = metadata.palette.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = metadata.palette.base + 'cc';
  ctx.fill();

  // Glass pane grid — horizontal stripes
  for (let i = 0; i < 4; i++) {
    const y = cy - r * 0.35 + i * (r * 0.18);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, y);
    ctx.lineTo(cx + r * 0.8, y);
    ctx.strokeStyle = metadata.palette.accent + '88';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Iron rib verticals
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * (r * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.quadraticCurveTo(x, cy - r * 0.2, cx, cy - r * 0.45);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Central glow (light flooding through)
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with aerial view of desert canal: massive stone lock gates, steamships queuing, Mediterranean-blue sea in distance, Egyptian palms lining banks. Use generate-sprite-prompt skill.
function drawSuezCanal(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'suez-canal-bespoke');

  // Canal waterway (vertical blue stripe)
  ctx.fillStyle = metadata.palette.glow + 'aa';
  ctx.fillRect(cx - r * 0.18, cy - r, r * 0.36, r * 2);

  // Desert banks either side
  ctx.fillStyle = metadata.palette.base;
  ctx.fillRect(cx - r, cy - r * 0.85, r * 0.76, r * 1.7);
  ctx.fillRect(cx + r * 0.18, cy - r * 0.85, r * 0.82, r * 1.7);

  // Lock gates (horizontal lines across canal)
  for (const yOff of [-r * 0.35, r * 0.2]) {
    ctx.fillStyle = metadata.palette.accent;
    ctx.fillRect(cx - r * 0.22, cy + yOff, r * 0.44, r * 0.08);
  }

  // Small steamship silhouette
  ctx.fillStyle = '#333';
  ctx.fillRect(cx - r * 0.1, cy - r * 0.12, r * 0.2, r * 0.06);
  ctx.fillRect(cx - r * 0.03, cy - r * 0.2, r * 0.06, r * 0.1);

  // Gold accent — wealth of trade
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.55, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with grand domed congress hall: neoclassical facade with ionic columns, central dome above circular debating chamber, national flags flanking entrance, cobblestone plaza. Use generate-sprite-prompt skill.
function drawContinentalCongress(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'continental-congress-bespoke');

  // Dome
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.42, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = metadata.palette.base;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Lantern on dome
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.55, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();

  // Columned portico
  ctx.fillStyle = metadata.palette.base;
  ctx.fillRect(cx - r * 0.5, cy - r * 0.15, r, r * 0.45);
  const colPositions = [-0.36, -0.18, 0, 0.18, 0.36];
  for (const xOff of colPositions) {
    ctx.fillStyle = metadata.palette.accent + 'aa';
    ctx.fillRect(cx + xOff * r - r * 0.04, cy - r * 0.15, r * 0.07, r * 0.45);
  }

  // Steps at base
  ctx.fillStyle = metadata.palette.accent + '66';
  ctx.fillRect(cx - r * 0.55, cy + r * 0.28, r * 1.1, r * 0.08);
  ctx.fillRect(cx - r * 0.6, cy + r * 0.35, r * 1.2, r * 0.06);

  // Central glow
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.05, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with Eiffel Tower: tall iron-lattice pyramid tapering to needle spire, four arched base legs, observation platform visible, Parisian skyline hint. Use generate-sprite-prompt skill.
function drawEiffelTower(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'eiffel-tower-bespoke');

  // Four leg arches (two visible from front)
  for (const xOff of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.moveTo(cx + xOff * r, cy + r * 0.4);
    ctx.quadraticCurveTo(cx + xOff * r * 0.5, cy + r * 0.05, cx, cy - r * 0.05);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Central shaft
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.05);
  ctx.lineTo(cx, cy - r * 0.8);
  ctx.strokeStyle = metadata.palette.accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  // First platform
  ctx.fillStyle = metadata.palette.accent;
  ctx.fillRect(cx - r * 0.22, cy + r * 0.03, r * 0.44, r * 0.06);

  // Second platform
  ctx.fillRect(cx - r * 0.12, cy - r * 0.3, r * 0.24, r * 0.05);

  // Needle tip
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.8);
  ctx.lineTo(cx, cy - r * 1.0);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glow at apex
  ctx.beginPath();
  ctx.arc(cx, cy - r * 1.0, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with Brooklyn Bridge: twin Gothic stone towers with pointed arches, suspension cables curving down to roadway, East River below, ferry boats and tugboats in the water. Use generate-sprite-prompt skill.
function drawBrooklynBridge(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'brooklyn-bridge-bespoke');

  // River
  ctx.fillStyle = metadata.palette.glow + '44';
  ctx.fillRect(cx - r, cy + r * 0.1, r * 2, r * 0.5);

  // Roadway (horizontal span)
  ctx.fillStyle = metadata.palette.base;
  ctx.fillRect(cx - r * 0.9, cy + r * 0.02, r * 1.8, r * 0.08);

  // Two Gothic towers
  for (const xOff of [-0.35, 0.35]) {
    // Tower body
    ctx.fillStyle = metadata.palette.base;
    ctx.fillRect(cx + xOff * r - r * 0.1, cy - r * 0.5, r * 0.2, r * 0.52);
    // Pointed arch opening
    ctx.beginPath();
    ctx.moveTo(cx + xOff * r - r * 0.07, cy - r * 0.1);
    ctx.quadraticCurveTo(cx + xOff * r, cy - r * 0.25, cx + xOff * r + r * 0.07, cy - r * 0.1);
    ctx.strokeStyle = metadata.palette.glow + 'aa';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Tower top
    ctx.fillStyle = metadata.palette.accent;
    ctx.fillRect(cx + xOff * r - r * 0.1, cy - r * 0.6, r * 0.2, r * 0.1);
  }

  // Main suspension cables
  for (const xBase of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(cx + xBase * r, cy - r * 0.5);
    ctx.quadraticCurveTo(cx, cy - r * 0.2, cx - xBase * r, cy - r * 0.5);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Central glow
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}

// TODO(art): Replace with Trans-Siberian Railway: long perspective of iron rail lines vanishing into steppe horizon, steam locomotive, birch trees flanking the track, distant snow-capped peaks. Use generate-sprite-prompt skill.
function drawTransSiberianRailway(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  const r = radius;
  markBespoke(ctx, 'trans-siberian-railway-bespoke');

  // Steppe ground plane
  ctx.fillStyle = metadata.palette.base;
  ctx.fillRect(cx - r, cy + r * 0.05, r * 2, r * 0.55);

  // Perspective rail lines
  for (const xOff of [-0.15, 0.15]) {
    ctx.beginPath();
    ctx.moveTo(cx + xOff * r, cy + r * 0.5);
    ctx.lineTo(cx + xOff * r * 0.12, cy - r * 0.4);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Rail ties (horizontal)
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const y = cy + r * 0.5 - t * r * 0.9;
    const halfW = r * (0.15 - t * 0.12) + 0.01;
    ctx.fillStyle = metadata.palette.accent + 'cc';
    ctx.fillRect(cx - halfW, y, halfW * 2, r * 0.04);
  }

  // Locomotive silhouette (left of vanishing point)
  ctx.fillStyle = '#333';
  ctx.fillRect(cx - r * 0.35, cy - r * 0.25, r * 0.28, r * 0.14);
  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy - r * 0.11, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Smokestack
  ctx.fillRect(cx - r * 0.3, cy - r * 0.35, r * 0.06, r * 0.12);

  // Steam puff
  ctx.beginPath();
  ctx.arc(cx - r * 0.27, cy - r * 0.42, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow + '55';
  ctx.fill();

  // Birch tree silhouettes
  for (const xOff of [-0.7, 0.7]) {
    ctx.fillStyle = metadata.palette.accent + '88';
    ctx.fillRect(cx + xOff * r - r * 0.03, cy - r * 0.2, r * 0.06, r * 0.35);
    ctx.beginPath();
    ctx.arc(cx + xOff * r, cy - r * 0.25, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant glow (horizon)
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.4, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow + '44';
  ctx.fill();
}
