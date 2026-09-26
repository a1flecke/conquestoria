import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord } from '@/core/types';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { createUnit } from '@/systems/unit-system';
import { getLandUnitWaterRecovery } from '@/systems/unit-water-recovery';

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

function feedbackState(onWater: boolean): GameState {
  const state = createNewGame(undefined, `water-feedback-${onWater}`, 'small');
  const unit = { ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()), id: 'warrior' };
  state.currentPlayer = 'player';
  state.units = { warrior: unit };
  state.civilizations.player.units = ['warrior'];
  state.map.tiles = {
    '1,1': tile({ q: 1, r: 1 }, onWater ? 'coast' : 'plains'),
    '2,1': tile({ q: 2, r: 1 }, 'plains'),
    '1,2': tile({ q: 1, r: 2 }, 'coast'),
  };
  state.civilizations.player.visibility.tiles = {
    '1,1': 'visible',
    '2,1': 'visible',
    '1,2': 'visible',
  };
  return state;
}

describe('selected-unit blocked movement feedback', () => {
  it('shows contextual recovery copy and reselects after a water tap', () => {
    const state = feedbackState(true);
    const recovery = getLandUnitWaterRecovery(
      state,
      'warrior',
      [{ q: 2, r: 1 }],
    );
    const showNotification = vi.fn();
    const reselectUnit = vi.fn();
    const playError = vi.fn();

    const handled = handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit, playError },
    );

    expect(handled).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(
      'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.',
      'warning',
    );
    expect(reselectUnit).toHaveBeenCalledWith('warrior');
    expect(playError).toHaveBeenCalledTimes(1);
  });

  it('keeps generic water copy for an ordinary land unit on land', () => {
    const state = feedbackState(false);
    const recovery = getLandUnitWaterRecovery(state, 'warrior', []);
    const showNotification = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit: vi.fn(), playError: vi.fn() },
    );

    expect(showNotification).toHaveBeenCalledWith(
      'Land units cannot cross water yet.',
      'warning',
    );
  });

  it('uses blocked recovery copy when no land exit is reachable', () => {
    const state = feedbackState(true);
    const recovery = getLandUnitWaterRecovery(state, 'warrior', []);
    const showNotification = vi.fn();
    const playError = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit: vi.fn(), playError },
    );

    expect(showNotification).toHaveBeenCalledWith(
      'This land unit is stranded on water with no reachable land escape this turn.',
      'warning',
    );
    expect(playError).toHaveBeenCalledTimes(1);
  });

  it('#1002: an unseen raider on a fogged tile is never named in the live notification', () => {
    const state = feedbackState(false);
    state.civilizations.player.visibility.tiles['2,1'] = 'fog';
    const raider = { ...createUnit('warrior', 'barbarian', { q: 2, r: 1 }, mkC()), id: 'raider' };
    state.units.raider = raider;
    const showNotification = vi.fn();
    const playError = vi.fn();

    const handled = handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 2, r: 1 },
      getLandUnitWaterRecovery(state, 'warrior', []),
      { showNotification, reselectUnit: vi.fn(), playError },
    );

    // The move is still refused (canonical legality), but the copy names no enemy.
    expect(handled).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('Something out of sight is in the way.', 'info');
    expect(playError).not.toHaveBeenCalled();

    // Earned control: once the tile is in view the specific reason returns.
    state.civilizations.player.visibility.tiles['2,1'] = 'visible';
    const seen = vi.fn();
    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 2, r: 1 },
      getLandUnitWaterRecovery(state, 'warrior', []),
      { showNotification: seen, reselectUnit: vi.fn(), playError: vi.fn() },
    );
    expect(seen).toHaveBeenCalledWith('An enemy unit is blocking the way.', 'warning');
  });

  it('does not play the error cue for informational fog feedback', () => {
    // #1025 MR4: redaction now applies to a REJECTION, not a legal move. (2,1) is made
    // impassable water AND unexplored, so the tap is genuinely refused and then redacted
    // to the informational "Too far away to spot." (shown as info, no error cue).
    const state = feedbackState(false);
    state.map.tiles['2,1'] = tile({ q: 2, r: 1 }, 'coast');
    state.civilizations.player.visibility.tiles['2,1'] = 'unexplored';
    const showNotification = vi.fn();
    const playError = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 2, r: 1 },
      getLandUnitWaterRecovery(state, 'warrior', []),
      { showNotification, reselectUnit: vi.fn(), playError },
    );

    expect(showNotification).toHaveBeenCalledWith('Too far away to spot.', 'info');
    expect(playError).not.toHaveBeenCalled();
  });
});
