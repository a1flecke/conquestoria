import type { HexCoord } from '@/core/types';

// --- Key conversion ---

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

// --- Neighbors ---

const DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

// --- Distance ---

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

// --- Ring and Range ---

export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [{ ...center }];

  const results: HexCoord[] = [];
  let current: HexCoord = {
    q: center.q + DIRECTIONS[4].q * radius,
    r: center.r + DIRECTIONS[4].r * radius,
  };

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...current });
      current = {
        q: current.q + DIRECTIONS[i].q,
        r: current.r + DIRECTIONS[i].r,
      };
    }
  }

  return results;
}

export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

// --- Pixel conversion (pointy-top hexes) ---

export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = size * ((3 / 2) * coord.r);
  return { x, y };
}

export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

function hexRound(qf: number, rf: number): HexCoord {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);

  const qDiff = Math.abs(q - qf);
  const rDiff = Math.abs(r - rf);
  const sDiff = Math.abs(s - sf);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }

  return { q, r };
}

// --- Pointy-top hex corners ---

export const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();

// --- Wrapping ---

export function wrapHexCoord(coord: HexCoord, mapWidth: number): HexCoord {
  let q = coord.q % mapWidth;
  if (q < 0) q += mapWidth;
  return { q, r: coord.r };
}

export function getWrappedHexNeighbors(coord: HexCoord, mapWidth: number): HexCoord[] {
  const deduped = new Map<string, HexCoord>();
  for (const neighbor of hexNeighbors(coord)) {
    const wrapped = wrapHexCoord(neighbor, mapWidth);
    deduped.set(hexKey(wrapped), wrapped);
  }
  return Array.from(deduped.values());
}

export function wrappedHexDistance(a: HexCoord, b: HexCoord, mapWidth: number): number {
  return Math.min(
    hexDistance(a, b),
    hexDistance(a, { q: b.q - mapWidth, r: b.r }),
    hexDistance(a, { q: b.q + mapWidth, r: b.r }),
  );
}

// --- Line of sight ---

export function hexLineTo(a: HexCoord, b: HexCoord): HexCoord[] {
  const dist = hexDistance(a, b);
  if (dist === 0) return [{ ...a }];

  const results: HexCoord[] = [];
  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    const q = a.q + (b.q - a.q) * t;
    const r = a.r + (b.r - a.r) * t;
    results.push(hexRound(q, r));
  }
  return results;
}
