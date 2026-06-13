export type ImprovementTreatmentFamily =
  | 'field-rows'
  | 'worked-rock'
  | 'managed-timber'
  | 'water-wheel'
  | 'orchard-rows'
  | 'fence-lines'
  | 'small-camp';

const TREATMENT_FAMILIES: Record<string, ImprovementTreatmentFamily> = {
  farm: 'field-rows',
  mine: 'worked-rock',
  quarry: 'worked-rock',
  lumber_camp: 'managed-timber',
  watermill: 'water-wheel',
  plantation: 'orchard-rows',
  pasture: 'fence-lines',
  camp: 'small-camp',
};

export function getImprovementTreatmentFamily(improvement: string): ImprovementTreatmentFamily | null {
  return TREATMENT_FAMILIES[improvement] ?? null;
}

function markTreatment(ctx: CanvasRenderingContext2D, improvement: string): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`improvement-treatment:${improvement}`);
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  count: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.035);
  for (let row = 0; row < count; row++) {
    const y = cy + size * (0.02 + row * 0.1);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.4, y + size * 0.05);
    ctx.lineTo(cx + size * 0.4, y - size * 0.05);
    ctx.stroke();
  }
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x - radius, y + radius * 0.6);
  ctx.lineTo(x - radius * 0.45, y - radius * 0.75);
  ctx.lineTo(x + radius * 0.55, y - radius);
  ctx.lineTo(x + radius, y + radius * 0.55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(45,40,34,0.65)';
  ctx.stroke();
}

export function drawImprovementTreatment(
  ctx: CanvasRenderingContext2D,
  improvement: string,
  cx: number,
  cy: number,
  size: number,
): boolean {
  const family = getImprovementTreatmentFamily(improvement);
  if (!family) return false;
  markTreatment(ctx, improvement);

  switch (improvement) {
    case 'farm':
      drawRows(ctx, cx, cy, size, 'rgba(223,202,91,0.78)', 4);
      break;
    case 'mine':
      drawRock(ctx, cx - size * 0.2, cy + size * 0.18, size * 0.15, 'rgba(91,82,72,0.86)');
      drawRock(ctx, cx + size * 0.03, cy + size * 0.25, size * 0.19, 'rgba(112,101,87,0.88)');
      drawRock(ctx, cx + size * 0.28, cy + size * 0.2, size * 0.12, 'rgba(79,74,69,0.84)');
      break;
    case 'quarry':
      for (let step = 0; step < 3; step++) {
        const width = size * (0.68 - step * 0.16);
        ctx.beginPath();
        ctx.rect(cx - width / 2, cy + size * (0.28 - step * 0.1), width, size * 0.08);
        ctx.fillStyle = `rgba(${174 + step * 15},${166 + step * 15},${150 + step * 16},0.78)`;
        ctx.fill();
      }
      break;
    case 'lumber_camp':
      ctx.strokeStyle = 'rgba(91,57,31,0.9)';
      ctx.lineWidth = Math.max(2, size * 0.07);
      for (let row = 0; row < 3; row++) {
        const y = cy + size * (0.12 + row * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.32, y);
        ctx.lineTo(cx + size * 0.3, y - size * 0.04);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx + size * 0.34, cy + size * 0.02, size * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(151,105,61,0.88)';
      ctx.fill();
      break;
    case 'watermill':
      ctx.strokeStyle = 'rgba(83,151,190,0.78)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.42, cy + size * 0.28);
      ctx.lineTo(cx + size * 0.42, cy + size * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + size * 0.16, cy + size * 0.12, size * 0.19, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(105,72,42,0.9)';
      ctx.stroke();
      for (let spoke = 0; spoke < 4; spoke++) {
        const angle = (Math.PI / 4) * spoke;
        const spokeX = Math.cos(angle) * size * 0.18;
        const spokeY = Math.sin(angle) * size * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx + size * 0.16 - spokeX, cy + size * 0.12 - spokeY);
        ctx.lineTo(cx + size * 0.16 + spokeX, cy + size * 0.12 + spokeY);
        ctx.stroke();
      }
      break;
    case 'plantation':
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 4; column++) {
          ctx.beginPath();
          ctx.arc(
            cx - size * 0.3 + column * size * 0.2,
            cy + size * 0.03 + row * size * 0.13,
            size * 0.055,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = 'rgba(76,121,55,0.82)';
          ctx.fill();
        }
      }
      break;
    case 'pasture':
      ctx.strokeStyle = 'rgba(112,79,45,0.88)';
      ctx.lineWidth = Math.max(1, size * 0.035);
      for (const xOffset of [-0.36, 0, 0.36]) {
        ctx.beginPath();
        ctx.moveTo(cx + size * xOffset, cy - size * 0.02);
        ctx.lineTo(cx + size * xOffset, cy + size * 0.36);
        ctx.stroke();
      }
      for (const yOffset of [0.08, 0.26]) {
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.4, cy + size * yOffset);
        ctx.lineTo(cx + size * 0.4, cy + size * (yOffset - 0.04));
        ctx.stroke();
      }
      break;
    case 'camp':
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.24, cy + size * 0.3);
      ctx.lineTo(cx, cy - size * 0.04);
      ctx.lineTo(cx + size * 0.24, cy + size * 0.3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(190,148,96,0.84)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(85,58,35,0.9)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + size * 0.3, cy + size * 0.28, size * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226,145,48,0.9)';
      ctx.fill();
      break;
  }

  return true;
}
