import { describe, it, expect } from 'vitest';
import { derivePalette } from '@/renderer/sprites/sprite-system';

describe('derivePalette', () => {
  it('returns an object with dark, mid, bright, trim as valid hex strings', () => {
    const p = derivePalette('#4a90d9');
    expect(p.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.mid).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.bright).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.trim).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('mid is the original input color', () => {
    expect(derivePalette('#4a90d9').mid).toBe('#4a90d9');
  });

  it('preserves hue identity — blue input stays blue', () => {
    const p = derivePalette('#4a90d9');
    const [h] = hexToHsl(p.mid);
    expect(h).toBeGreaterThan(195);
    expect(h).toBeLessThan(225);
  });

  it('preserves hue identity — red input stays red', () => {
    const p = derivePalette('#d94a4a');
    const [h] = hexToHsl(p.mid);
    expect(h < 15 || h > 345).toBe(true);
  });
});

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}
