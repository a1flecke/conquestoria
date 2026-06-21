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
