import { describe, expect, it, vi } from 'vitest';
import type { GameMap } from '@/core/types';
import { Camera } from '@/renderer/camera';
import { drawAirDefenseOverlay } from '@/renderer/air-defense-overlay';

function context(): CanvasRenderingContext2D {
  return { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), strokeStyle: '', fillStyle: '', lineWidth: 0 } as unknown as CanvasRenderingContext2D;
}
const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} } as GameMap;

describe('drawAirDefenseOverlay', () => {
  it('renders only the viewer-safe providers supplied by the canonical resolver', () => {
    const ctx = context(); const camera = new Camera(); camera.setViewport(320, 240);
    drawAirDefenseOverlay(ctx, camera, map, [{ id: 'city:alpha:anti_air_battery', label: 'Anti-Air Battery', ownerId: 'viewer', position: { q: 1, r: 1 }, radius: 0, defenseModifier: 8, stackingGroup: 'ground-air-defense' }]);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith('AA', expect.any(Number), expect.any(Number));
  });

  it('draws no geometry when the viewer has no known providers', () => {
    const ctx = context(); const camera = new Camera(); camera.setViewport(320, 240);
    drawAirDefenseOverlay(ctx, camera, map, []);
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});
