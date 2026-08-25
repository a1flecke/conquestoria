import { describe, it, expect } from 'vitest';
import type { GameState, HexCoord, HexTile } from '@/core/types';
import { getStrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return { coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
}

describe('getStrategicLaunchPreviewPresentation (#545 MR4 §14 stage 2 map overlay)', () => {
  it('presents every tile getStrategicStrikeBlastRadiusPreview returns, as hex coords', () => {
    const targetPos: HexCoord = { q: 0, r: 0 };
    const tiles: Record<string, HexTile> = {};
    for (const coord of hexesInRange(targetPos, 4)) tiles[hexKey(coord)] = makeTile(coord, 'defender');
    const state = {
      map: { width: 40, height: 40, tiles, wrapsHorizontally: false, rivers: [] },
      cities: { target: { id: 'target', owner: 'defender', position: targetPos } as any },
    } as unknown as GameState;

    const presentation = getStrategicLaunchPreviewPresentation(state, 'target');
    expect(presentation.tiles.length).toBeGreaterThan(0);
    expect(presentation.tiles.every(t => tiles[hexKey(t.coord)]?.owner === 'defender')).toBe(true);
  });

  it('is empty for an unknown city', () => {
    const state = { map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] }, cities: {} } as unknown as GameState;
    expect(getStrategicLaunchPreviewPresentation(state, 'nope').tiles).toEqual([]);
  });
});
