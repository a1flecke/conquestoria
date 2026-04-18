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
          isHuman: true,
          score: 0,
          gold: 0,
          visibility: { tiles: {} },
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: { military: 'medium', economy: 'medium', science: 'medium', civics: 'medium', exploration: 'medium', agriculture: 'medium', medicine: 'medium', philosophy: 'medium', arts: 'medium', maritime: 'medium', metallurgy: 'medium', construction: 'medium', communication: 'medium', espionage: 'medium', spirituality: 'medium' } },
          diplomacy: { relationships: {}, atWarWith: [], treaties: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, events: [] },
        }
      },
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        tiles: {
          [hexKey(startPos)]: { coord: startPos, terrain: terrainType, elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          [hexKey(intermediatePos)]: { coord: intermediatePos, terrain: terrainType, elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          [hexKey(destPos)]: { coord: destPos, terrain: terrainType, elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
        rivers: [],
      },
      cities: {},
      tribalVillages: {},
    };

    const unitBefore = state.units!['unit-1'];
    const initialMovementPoints = unitBefore.movementPointsLeft;
    expect(initialMovementPoints).toBe(2);

    executeUnitMove(state as GameState, 'unit-1', destPos, { actor: 'player', civId: 'player' });

    const unitAfter = state.units!['unit-1'];
    const expectedPathCost = 2 * tileCost;

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
          isHuman: true,
          score: 0,
          gold: 0,
          visibility: { tiles: {} },
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: { military: 'medium', economy: 'medium', science: 'medium', civics: 'medium', exploration: 'medium', agriculture: 'medium', medicine: 'medium', philosophy: 'medium', arts: 'medium', maritime: 'medium', metallurgy: 'medium', construction: 'medium', communication: 'medium', espionage: 'medium', spirituality: 'medium' } },
          diplomacy: { relationships: {}, atWarWith: [], treaties: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, events: [] },
        }
      },
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        tiles: {
          [hexKey(startPos)]: { coord: startPos, terrain: terrainType, elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          [hexKey(destPos)]: { coord: destPos, terrain: terrainType, elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
        rivers: [],
      },
      cities: {},
      tribalVillages: {},
    };

    const unitBefore = state.units!['unit-2'];
    const initialMovementPoints = unitBefore.movementPointsLeft;
    expect(initialMovementPoints).toBe(2);

    executeUnitMove(state as GameState, 'unit-2', destPos, { actor: 'player', civId: 'player' });

    const unitAfter = state.units!['unit-2'];
    const expectedPathCost = 1 * tileCost;

    expect(unitAfter.movementPointsLeft).toBe(initialMovementPoints - expectedPathCost);
    expect(unitAfter.position).toEqual(destPos);
    expect(unitAfter.hasMoved).toBe(true);
  });
});
