import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import {
  getUnmovedUnitsForEndTurn,
  removePlayerUnitFromState,
  skipUnitForTurn,
  skipUnitInState,
} from '@/systems/unit-lifecycle-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';

describe('unit-lifecycle-system', () => {
  it('marks a skipped unit as done for the current turn without moving it', () => {
    const unit = createUnit('scout', 'player', { q: 2, r: 3 });

    const skipped = skipUnitForTurn(unit);

    expect(skipped.position).toEqual({ q: 2, r: 3 });
    expect(skipped.hasMoved).toBe(false);
    expect(skipped.hasActed).toBe(false);
    expect(skipped.movementPointsLeft).toBe(0);
    expect(skipped.isResting).toBe(false);
    expect(skipped.skippedTurn).toBe(true);
  });

  it('updates only the current player unit when skipping through state', () => {
    const state = createNewGame(undefined, 'issue-154-skip-state', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];
    const originalUnit = state.units[unitId];

    const next = skipUnitInState(state, playerId, unitId);

    expect(next).not.toBe(state);
    expect(next.units[unitId]).toEqual({
      ...originalUnit,
      movementPointsLeft: 0,
      isResting: false,
      skippedTurn: true,
    });
    expect(next.units[unitId].hasMoved).toBe(false);
    expect(next.units[unitId].hasActed).toBe(false);
    expect(state.units[unitId].skippedTurn).toBeUndefined();
  });

  it('does not skip an enemy unit through the current player path', () => {
    const state = createNewGame(undefined, 'issue-154-skip-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyId = 'ai-1';
    const enemyUnitId = state.civilizations[enemyId].units[0];
    const originalEnemy = state.units[enemyUnitId];

    const next = skipUnitInState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toEqual(originalEnemy);
  });

  it('removes a current player unit from the map and civilization roster', () => {
    const state = createNewGame(undefined, 'issue-154-delete-unit', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];

    const next = removePlayerUnitFromState(state, playerId, unitId);

    expect(next.units[unitId]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(unitId);
    expect(state.units[unitId]).toBeDefined();
    expect(state.civilizations[playerId].units).toContain(unitId);
  });

  it('does not remove units owned by another civilization', () => {
    const state = createNewGame(undefined, 'issue-154-delete-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    const next = removePlayerUnitFromState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toBeDefined();
  });

  it('cleans up matching spy records when deleting a spy unit', () => {
    const state = createNewGame(undefined, 'issue-154-delete-spy', 'small');
    const playerId = state.currentPlayer;
    const spyUnit = createUnit('spy_scout', playerId, { q: 1, r: 1 });
    state.units[spyUnit.id] = spyUnit;
    state.civilizations[playerId].units.push(spyUnit.id);

    const baseEspionage = { ...createEspionageCivState(), maxSpies: 1 };
    const created = createSpyFromUnit(baseEspionage, spyUnit.id, playerId, 'spy_scout', 'issue-154-spy');
    state.espionage = { [playerId]: created.state };

    const next = removePlayerUnitFromState(state, playerId, spyUnit.id);

    expect(next.units[spyUnit.id]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(spyUnit.id);
    expect(next.espionage?.[playerId]?.spies[spyUnit.id]).toBeUndefined();
  });

  it('returns only current-player units that still need orders at end turn', () => {
    const state = createNewGame(undefined, 'issue-154-unmoved', 'small');
    const playerId = state.currentPlayer;
    const firstUnitId = state.civilizations[playerId].units[0];
    const secondUnitId = state.civilizations[playerId].units[1];
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    state.units[firstUnitId] = { ...state.units[firstUnitId], hasMoved: true, movementPointsLeft: 0 };
    state.units[secondUnitId] = { ...state.units[secondUnitId], skippedTurn: true, movementPointsLeft: 0 };
    state.units['fresh-player-unit'] = {
      ...createUnit('warrior', playerId, { q: 4, r: 4 }),
      id: 'fresh-player-unit',
    };
    state.civilizations[playerId].units.push('fresh-player-unit');

    const warningUnits = getUnmovedUnitsForEndTurn(state, playerId).map(unit => unit.id);

    expect(warningUnits).toContain('fresh-player-unit');
    expect(warningUnits).not.toContain(firstUnitId);
    expect(warningUnits).not.toContain(secondUnitId);
    expect(warningUnits).not.toContain(enemyUnitId);
  });
});
