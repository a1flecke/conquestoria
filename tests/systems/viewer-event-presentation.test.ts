import { describe, expect, it } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { buildMovePresentationByViewer, buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, HexCoord, Unit, UnitType } from '@/core/types';

const HOT_SEAT_CONFIG = {
  playerCount: 2,
  mapSize: 'medium' as const,
  players: [
    { slotId: 'p1', name: 'Alice', civType: 'france', isHuman: true },
    { slotId: 'p2', name: 'Bob', civType: 'zulu', isHuman: true },
  ],
};

function setTerrain(state: GameState, position: HexCoord, terrain: 'ocean' | 'plains'): void {
  state.map.tiles[hexKey(position)].terrain = terrain;
}

function placeUnit(state: GameState, civId: string, type: UnitType, position: HexCoord): Unit {
  const unit = createUnit(type, civId, position, state.idCounters);
  state.units[unit.id] = unit;
  state.civilizations[civId].units.push(unit.id);
  return unit;
}

describe('viewer event presentation', () => {
  it('captures only event-time contiguous visible movement segments', () => {
    const state = createNewGame(undefined, 'viewer-segments', 'small');
    const unit = Object.values(state.units).find(candidate => candidate.owner !== 'player')!;
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
      '2,0': 'fog',
      '3,0': 'visible',
      '4,0': 'visible',
    };

    const presentation = buildMovePresentationByViewer(state, unit, path);

    expect(presentation.player.visibleSegments).toEqual([
      [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      [{ q: 3, r: 0 }, { q: 4, r: 0 }],
    ]);
  });

  it('omits a viewer with no event-time visible segment even if fog changes later', () => {
    const state = createNewGame(undefined, 'viewer-hidden', 'small');
    const unit = Object.values(state.units).find(candidate => candidate.owner !== 'player')!;
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    state.civilizations.player.visibility.tiles = { '0,0': 'fog', '1,0': 'fog' };
    const presentation = buildMovePresentationByViewer(state, unit, path);
    state.civilizations.player.visibility.tiles['0,0'] = 'visible';
    state.civilizations.player.visibility.tiles['1,0'] = 'visible';

    expect(presentation.player).toBeUndefined();
  });
});

describe('hot-seat submarine visibility isolation (#542)', () => {
  function hotSeatStateWithThirdCivSubmarine(): { state: GameState; sub: Unit } {
    const state = createHotSeatGame(HOT_SEAT_CONFIG, 'hot-seat-submarine-vis');
    // Third civ: the submarine's owner, hostile-adjacent to both human seats -- hot-seat
    // configs only ever create the explicitly listed human players, so this is added
    // directly, mirroring the pattern used elsewhere for a synthetic extra civ in tests.
    state.civilizations['ai-1'] = {
      ...structuredClone(state.civilizations.p1),
      id: 'ai-1',
      isHuman: false,
      units: [],
      cities: [],
    };
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    return { state, sub };
  }

  it('civ A (with a detector) sees the submarine that civ B (no detector) cannot', () => {
    const { state, sub } = hotSeatStateWithThirdCivSubmarine();
    placeUnit(state, 'p1', 'galley', { q: 1, r: 0 });
    // p2 has no unit anywhere near the submarine.

    expect(isUnitConcealedFrom(state, sub, 'p1')).toBe(false);
    expect(isUnitConcealedFrom(state, sub, 'p2')).toBe(true);
  });

  it('switching state.currentPlayer between seats does not leak detection from one seat to the other', () => {
    const { state, sub } = hotSeatStateWithThirdCivSubmarine();
    placeUnit(state, 'p1', 'galley', { q: 1, r: 0 });

    state.currentPlayer = 'p1';
    expect(isUnitConcealedFrom(state, sub, state.currentPlayer)).toBe(false);

    state.currentPlayer = 'p2';
    expect(isUnitConcealedFrom(state, sub, state.currentPlayer)).toBe(true);
  });

  it('revealedThisTurn is symmetric: a civ with fog visibility sees the reveal even without its own detector or the attack', () => {
    const { state, sub } = hotSeatStateWithThirdCivSubmarine();
    sub.revealedThisTurn = true;
    // p2 has no detector unit at all, but does have ordinary fog visibility of the tile
    // (e.g. from a scout that has since moved away) -- the reveal is a GameState fact,
    // not scoped to whichever civ "caused" it.
    state.civilizations.p2.visibility.tiles[hexKey(sub.position)] = 'visible';

    expect(isUnitConcealedFrom(state, sub, 'p2')).toBe(false);
  });

  it('buildCombatPresentation is visible to both human seats when a revealed submarine is the attacker', () => {
    const { state, sub } = hotSeatStateWithThirdCivSubmarine();
    sub.revealedThisTurn = true;
    const defender = placeUnit(state, 'p1', 'galley', { q: 1, r: 0 });
    state.civilizations.p1.visibility.tiles[hexKey(sub.position)] = 'visible';
    state.civilizations.p2.visibility.tiles[hexKey(sub.position)] = 'visible';

    const presentation = buildCombatPresentation(
      state,
      {
        attackerId: sub.id, defenderId: defender.id, attackerDamage: 0, defenderDamage: 20,
        attackerSurvived: true, defenderSurvived: true, attackerStrength: 20, defenderStrength: 20,
        attackerPosition: sub.position, defenderPosition: defender.position,
      },
      sub,
      defender,
    );

    expect(presentation.visibleToViewerIds).toContain('p1');
    expect(presentation.visibleToViewerIds).toContain('p2');
  });
});
