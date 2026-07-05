import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import {
  getLandUnitWaterRecovery,
  getLandUnitWaterRecoveryPanelMessage,
  getLandUnitWaterRecoveryTapMessage,
} from '@/systems/unit-water-recovery';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function tile(coord: HexCoord, terrain: GameState['map']['tiles'][string]['terrain']) {
  return {
    coord,
    terrain,
    elevation: 'lowland' as const,
    resource: null,
    owner: null,
    improvement: 'none' as const,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function recoveryState(type: UnitType = 'warrior'): GameState {
  const state = createNewGame(undefined, `water-recovery-${type}`, 'small');
  const unit = { ...createUnit(type, 'player', { q: 1, r: 1 }, mkC()), id: 'subject' };
  state.currentPlayer = 'player';
  state.units = { subject: unit };
  state.civilizations.player.units = ['subject'];
  state.map.tiles = {
    '1,1': tile({ q: 1, r: 1 }, 'coast'),
    '2,1': tile({ q: 2, r: 1 }, 'plains'),
    '1,2': tile({ q: 1, r: 2 }, 'coast'),
  };
  return state;
}

describe('land-unit water recovery', () => {
  it('is recoverable only through supplied legal land destinations', () => {
    const state = recoveryState();

    const result = getLandUnitWaterRecovery(
      state,
      'subject',
      [{ q: 2, r: 1 }, { q: 1, r: 2 }],
    );

    expect(result).toEqual({
      kind: 'recoverable',
      destinations: [{ q: 2, r: 1 }],
    });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBe(
      'This land unit is on water. Move to an amber land tile to return ashore.',
    );
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBe(
      'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.',
    );
  });

  it('reports blocked when no legal non-combat land destination exists', () => {
    const result = getLandUnitWaterRecovery(recoveryState(), 'subject', []);

    expect(result).toEqual({ kind: 'blocked', destinations: [] });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBe(
      'This land unit is stranded on water. No land escape is currently reachable this turn.',
    );
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBe(
      'This land unit is stranded on water with no reachable land escape this turn.',
    );
  });

  it.each([
    ['land unit already on land', 'warrior', false],
    ['naval unit on water', 'galley', true],
    ['air unit on water', 'observation_balloon', true],
  ] as const)('returns none for %s', (_label, type, keepWater) => {
    const state = recoveryState(type);
    if (!keepWater) state.map.tiles['1,1'] = tile({ q: 1, r: 1 }, 'plains');

    const result = getLandUnitWaterRecovery(state, 'subject', [{ q: 2, r: 1 }]);

    expect(result).toEqual({ kind: 'none', destinations: [] });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBeNull();
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBeNull();
  });

  it('returns none for transported cargo synchronized onto water', () => {
    const state = recoveryState();
    state.units.subject.transportId = 'transport-1';

    expect(getLandUnitWaterRecovery(state, 'subject', [{ q: 2, r: 1 }]))
      .toEqual({ kind: 'none', destinations: [] });
  });
});
