import { describe, it, expect } from 'vitest';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { createUnit, getMovementCost } from '@/systems/unit-system';
import type { GameState, HexCoord, TerrainType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

describe('Unit Movement Regression', () => {
  it('should correctly subtract total path cost for multi-tile moves', () => {
    const startPos: HexCoord = { q: 0, r: 0 };
    const intermediatePos: HexCoord = { q: 1, r: 0 };
    const destPos: HexCoord = { q: 2, r: 0 }; // 2 tiles away from start

    // Define a map with varying terrain costs if needed, for now all plains
    const terrainType: TerrainType = 'plains';
    const tileCost = getMovementCost(terrainType);

    const state: Partial<GameState> = {
      turn: 1,
      units: {
        'unit-1': createUnit('warrior', 'player', startPos),
      },
      civilizations: {
        'player': {
          id: 'player',
          name: 'Zulu',
          civType: 'zulu',
          color: 'red',
          units: ['unit-1'],
          cities: [],
          visibility: { tiles: {} },
          techState: { completed: [], currentTech: null, progress: 0 },
          diplomacy: { relationships: {}, atWarWith: [] },
          isAI: false,
          isEliminated: false,
          gold: 0,
        }
      },
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        tiles: {
          [hexKey(startPos)]: { terrain: terrainType },
          [hexKey(intermediatePos)]: { terrain: terrainType },
          [hexKey(destPos)]: { terrain: terrainType },
        },
      },
      cities: {},
      tribalVillages: {},
    };

    const unitBefore = state.units!['unit-1'];
    const initialMovementPoints = unitBefore.movementPointsLeft;
    expect(initialMovementPoints).toBe(2);

    // Act: Move 2 tiles away
    executeUnitMove(state as GameState, 'unit-1', destPos, { actor: 'player', civId: 'player' });

    const unitAfter = state.units!['unit-1'];
    
    // Expected movement cost for a 2-tile path (each tile is 'plains', cost 1)
    const expectedPathCost = 2 * tileCost;

    // The unit should have moved 2 tiles, costing 2 movement points
    expect(unitAfter.movementPointsLeft).toBe(initialMovementPoints - expectedPathCost);
    expect(unitAfter.position).toEqual(destPos);
    expect(unitAfter.hasMoved).toBe(true);
  });

  it('should correctly subtract path cost for a single-tile move', () => {
    const startPos: HexCoord = { q: 0, r: 0 };
    const destPos: HexCoord = { q: 1, r: 0 }; // 1 tile away from start

    const terrainType: TerrainType = 'plains';
    const tileCost = getMovementCost(terrainType);

    const state: Partial<GameState> = {
      turn: 1,
      units: {
        'unit-2': createUnit('warrior', 'player', startPos),
      },
      civilizations: {
        'player': {
          id: 'player',
          name: 'Zulu',
          civType: 'zulu',
          color: 'red',
          units: ['unit-2'],
          cities: [],
          visibility: { tiles: {} },
          techState: { completed: [], currentTech: null, progress: 0 },
          diplomacy: { relationships: {}, atWarWith: [] },
          isAI: false,
          isEliminated: false,
          gold: 0,
        }
      },
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        tiles: {
          [hexKey(startPos)]: { terrain: terrainType },
          [hexKey(destPos)]: { terrain: terrainType },
        },
      },
      cities: {},
      tribalVillages: {},
    };

    const unitBefore = state.units!['unit-2'];
    const initialMovementPoints = unitBefore.movementPointsLeft;
    expect(initialMovementPoints).toBe(2);

    // Act: Move 1 tile away
    executeUnitMove(state as GameState, 'unit-2', destPos, { actor: 'player', civId: 'player' });

    const unitAfter = state.units!['unit-2'];
    
    // Expected movement cost for a 1-tile path (each tile is 'plains', cost 1)
    const expectedPathCost = 1 * tileCost;

    // The unit should have moved 1 tile, costing 1 movement point
    expect(unitAfter.movementPointsLeft).toBe(initialMovementPoints - expectedPathCost);
    expect(unitAfter.position).toEqual(destPos);
    expect(unitAfter.hasMoved).toBe(true);
  });
});
