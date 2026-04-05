import { describe, it, expect } from 'vitest';
import type { HexHighlight } from '@/renderer/render-loop';
import type { HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

// Mirror the classification logic from main.ts for testability
function classifyHighlights(
  movementRange: HexCoord[],
  unitPositions: Record<string, string>,
  unitOwners: Record<string, string>,
  currentPlayer: string,
): HexHighlight[] {
  return movementRange.map(coord => {
    const k = hexKey(coord);
    const occupantId = unitPositions[k];
    if (occupantId && unitOwners[occupantId] !== currentPlayer) {
      return { coord, type: 'attack' as const };
    }
    return { coord, type: 'move' as const };
  });
}

describe('movement highlights (#4)', () => {
  it('classifies empty hex as move', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }], {}, {}, 'player',
    );
    expect(highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'move' }]);
  });

  it('classifies enemy-occupied hex as attack', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }],
      { '1,0': 'enemy-unit' },
      { 'enemy-unit': 'ai-1' },
      'player',
    );
    expect(highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'attack' }]);
  });

  it('classifies barbarian-occupied hex as attack', () => {
    const highlights = classifyHighlights(
      [{ q: 2, r: 0 }],
      { '2,0': 'barb-1' },
      { 'barb-1': 'barbarian' },
      'player',
    );
    expect(highlights[0].type).toBe('attack');
  });

  it('classifies own unit hex as move (friendly blocking — move would fail but shows as move)', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }],
      { '1,0': 'my-unit' },
      { 'my-unit': 'player' },
      'player',
    );
    expect(highlights[0].type).toBe('move');
  });

  it('mixed range produces correct types', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      { '2,0': 'enemy-1' },
      { 'enemy-1': 'ai-1' },
      'player',
    );
    expect(highlights.map(h => h.type)).toEqual(['move', 'attack', 'move']);
  });

  it('HexHighlight interface has coord and type', () => {
    const h: HexHighlight = { coord: { q: 0, r: 0 }, type: 'move' };
    expect(h.coord).toEqual({ q: 0, r: 0 });
    expect(h.type).toBe('move');
  });
});
