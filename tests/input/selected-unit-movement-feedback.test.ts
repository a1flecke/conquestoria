import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord } from '@/core/types';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
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

  // #966: the controller's blocked-movement handler recomputes the reason itself, so the
  // truthful "can't attack cities" copy has to come out of this path -- not just the raw
  // resolveMapTapIntent result.
  function cityBlockState(attackerType: 'archer' | 'warrior'): GameState {
    const state = createNewGame(undefined, `city-block-${attackerType}`, 'small');
    state.currentPlayer = 'player';
    const unit = { ...createUnit(attackerType, 'player', { q: 1, r: 1 }, mkC()), id: 'attacker' };
    state.units = { attacker: unit };
    state.civilizations.player.units = ['attacker'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.map.tiles = {
      '1,1': tile({ q: 1, r: 1 }, 'plains'),
      '2,1': tile({ q: 2, r: 1 }, 'plains'),
    };
    state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
    state.cities = {};
    const city = { ...foundCity('ai-1', { q: 2, r: 1 }, state.map, state.idCounters), id: 'greek-city', owner: 'ai-1', position: { q: 2, r: 1 } };
    state.cities = { 'greek-city': city };
    state.civilizations['ai-1'].cities = ['greek-city'];
    return state;
  }

  it('tells the player why an archer cannot attack an adjacent enemy city', () => {
    const state = cityBlockState('archer');
    const showNotification = vi.fn();
    const playError = vi.fn();

    const handled = handleSelectedUnitMovementBlocker(
      state,
      'attacker',
      { q: 2, r: 1 },
      getLandUnitWaterRecovery(state, 'attacker', []),
      { showNotification, reselectUnit: vi.fn(), playError },
    );

    expect(handled).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(
      "This unit can't attack cities. Send a melee unit to capture it, or a siege unit to bombard it.",
      'warning',
    );
    expect(playError).toHaveBeenCalledTimes(1);
  });

  it('keeps the ordinary city-assault hint for a melee unit (no regression)', () => {
    const state = cityBlockState('warrior');
    const showNotification = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'attacker',
      { q: 2, r: 1 },
      getLandUnitWaterRecovery(state, 'attacker', []),
      { showNotification, reselectUnit: vi.fn(), playError: vi.fn() },
    );

    expect(showNotification).toHaveBeenCalledWith(
      'Move adjacent, then use the city assault action.',
      'warning',
    );
  });

  it('does not play the error cue for informational fog feedback', () => {
    const state = feedbackState(false);
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
