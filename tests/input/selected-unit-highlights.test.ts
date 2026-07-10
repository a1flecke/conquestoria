import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('selected-unit-highlights', () => {
  it('marks legal non-combat land exits as water-recovery without changing movement truth', () => {
    const state = createNewGame(undefined, 'water-recovery-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: {
        ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()),
        id: 'warrior',
        movementPointsLeft: 2,
      },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
    state.map.tiles['1,1'] = {
      ...state.map.tiles['1,1'],
      coord: { q: 1, r: 1 },
      terrain: 'coast',
    };
    state.map.tiles['2,1'] = {
      ...state.map.tiles['2,1'],
      coord: { q: 2, r: 1 },
      terrain: 'plains',
    };

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.waterRecovery.kind).toBe('recoverable');
    expect(result.movementRange.map(hexKey)).toContain('2,1');
    expect(result.highlights).toContainEqual({
      coord: { q: 2, r: 1 },
      type: 'water-recovery',
    });
  });

  it('derives recovery for the active hot-seat player instead of a hardcoded owner', () => {
    const state = createNewGame(undefined, 'water-recovery-hot-seat-viewer', 'small');
    state.currentPlayer = 'ai-1';
    state.hotSeat = {
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Player One', slotId: 'player', civType: 'generic', isHuman: true },
        { name: 'Player Two', slotId: 'ai-1', civType: 'generic', isHuman: true },
      ],
    };
    state.units = {
      warrior: {
        ...createUnit('warrior', 'ai-1', { q: 1, r: 1 }, mkC()),
        id: 'warrior',
        movementPointsLeft: 2,
      },
    };
    state.civilizations.player.units = [];
    state.civilizations['ai-1'].units = ['warrior'];
    state.civilizations['ai-1'].visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
    state.map.tiles['1,1'] = {
      ...state.map.tiles['1,1'],
      coord: { q: 1, r: 1 },
      terrain: 'coast',
    };
    state.map.tiles['2,1'] = {
      ...state.map.tiles['2,1'],
      coord: { q: 2, r: 1 },
      terrain: 'plains',
    };

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.waterRecovery.kind).toBe('recoverable');
    expect(result.highlights).toContainEqual({
      coord: { q: 2, r: 1 },
      type: 'water-recovery',
    });
  });

  it('keeps hostile land targets as attack highlights during water recovery', () => {
    const state = createNewGame(undefined, 'water-recovery-attack', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: {
        ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()),
        id: 'warrior',
        movementPointsLeft: 2,
      },
      enemy: {
        ...createUnit('warrior', 'ai-1', { q: 2, r: 1 }, mkC()),
        id: 'enemy',
      },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
    state.map.tiles['1,1'] = { ...state.map.tiles['1,1'], terrain: 'coast' };
    state.map.tiles['2,1'] = { ...state.map.tiles['2,1'], terrain: 'plains' };

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.highlights).toContainEqual({
      coord: { q: 2, r: 1 },
      type: 'attack',
    });
    expect(result.highlights).not.toContainEqual({
      coord: { q: 2, r: 1 },
      type: 'water-recovery',
    });
  });

  it('does not offer water recovery to a route-committed land unit', () => {
    const state = createNewGame(undefined, 'water-recovery-committed-route', 'small');
    state.currentPlayer = 'player';
    state.units = {
      caravan: {
        ...createUnit('caravan', 'player', { q: 1, r: 1 }, mkC()),
        id: 'caravan',
        movementPointsLeft: 3,
        committedToRouteId: 'route-1',
      },
    };
    state.civilizations.player.units = ['caravan'];
    state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
    state.map.tiles['1,1'] = {
      ...state.map.tiles['1,1'],
      coord: { q: 1, r: 1 },
      terrain: 'coast',
    };
    state.map.tiles['2,1'] = {
      ...state.map.tiles['2,1'],
      coord: { q: 2, r: 1 },
      terrain: 'plains',
    };

    const result = buildSelectedUnitHighlights(state, 'caravan');

    expect(result.waterRecovery).toEqual({ kind: 'none', destinations: [] });
    expect(result.movementRange).toEqual([]);
    expect(result.attackTargets).toEqual([]);
    expect(result.highlights).toEqual([]);
  });

  it('does not mark non-adjacent melee targets as attack highlights', () => {
    const state = createNewGame(undefined, 'melee-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '2,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('marks visible archer targets as attack and not movement', () => {
    const state = createNewGame(undefined, 'archer-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }, mkC()), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles = { '2,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).toContain('2,0');
    expect(result.highlights).toContainEqual({ coord: { q: 2, r: 0 }, type: 'attack' });
    expect(result.highlights.filter(h => h.type === 'move').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('does not highlight fogged archer targets', () => {
    const state = createNewGame(undefined, 'archer-fog-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }, mkC()), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles = { '2,0': 'fog' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack')).toHaveLength(0);
  });

  it('leaves adjacent hostile cities on the city-assault path instead of combat-preview attack targets', () => {
    const state = createNewGame(undefined, 'city-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.cities.enemyCity = {
      ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
      id: 'enemyCity',
      name: 'Enemy City',
      owner: 'ai-1',
      position: { q: 1, r: 0 },
      population: 4,
      ownedTiles: [{ q: 1, r: 0 }],
    };

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('1,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('1,0');
  });

  it('adds worker guidance highlights for buildable, owned-blocked, and foreign-blocked movement-preview tiles', () => {
    const state = createNewGame(undefined, 'worker-guidance-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }, mkC()), id: 'worker', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['worker'];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
      '29,0': 'visible',
      '1,-1': 'visible',
    };
    state.map.tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: 'player', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    // S2a: tundra is now buildable (camp improvement is valid there) — use snow for "owned-blocked" since no improvements work on snow
    state.map.tiles['29,0'] = { coord: { q: 29, r: 0 }, terrain: 'snow', elevation: 'lowland', resource: null, owner: 'player', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    state.map.tiles['1,-1'] = { coord: { q: 1, r: -1 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: 'ai-1', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };

    const result = buildSelectedUnitHighlights(state, 'worker');

    expect(result.highlights).toContainEqual({ coord: { q: 1, r: 0 }, type: 'worker-buildable' });
    expect(result.highlights).toContainEqual({ coord: { q: 29, r: 0 }, type: 'worker-owned-blocked' });
    expect(result.highlights).toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
  });

  it('shows worker-buildable (restore_land) on a currently-devastated tile, and stops once devastation naturally expires (MR2 catastrophe)', () => {
    const state = createNewGame(undefined, 'restore-land-highlight', 'small');
    state.currentPlayer = 'player';
    state.turn = 40;
    state.units = {
      worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }, mkC()), id: 'worker', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['worker'];
    state.civilizations.player.visibility.tiles = { '0,0': 'visible', '1,0': 'visible' };
    // snow has no valid worker improvement (see the "owned-blocked" test above), so any
    // worker-buildable highlight here is caused specifically by restore_land eligibility.
    state.map.tiles['1,0'] = {
      coord: { q: 1, r: 0 }, terrain: 'snow', elevation: 'lowland', resource: null,
      owner: 'player', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      devastatedUntilTurn: 45, // still devastated at turn 40
    };

    const stillDevastated = buildSelectedUnitHighlights(state, 'worker');
    expect(stillDevastated.highlights).toContainEqual({ coord: { q: 1, r: 0 }, type: 'worker-buildable' });

    // Devastation has passed (state.turn now equals the old devastatedUntilTurn) — the
    // stale field lingers on the tile (nothing clears it automatically), so eligibility
    // must be gated on currentTurn, not just "field is present".
    state.turn = 45;
    const expired = buildSelectedUnitHighlights(state, 'worker');
    expect(expired.highlights).not.toContainEqual({ coord: { q: 1, r: 0 }, type: 'worker-buildable' });
  });

  it('neutral (non-war) AI unit hex does not appear as a move highlight (#250)', () => {
    const state = createNewGame(undefined, 'neutral-stack-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
      neutral: { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'neutral' },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = [];  // ai-1 is NOT at war — neutral

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.movementRange.some(c => hexKey(c) === '1,0')).toBe(false);
    expect(result.highlights.some(h => hexKey(h.coord) === '1,0')).toBe(false);
  });

  it('at-war AI unit hex still appears as a move highlight (#250)', () => {
    const state = createNewGame(undefined, 'atwar-stack-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.movementRange.some(c => hexKey(c) === '1,0')).toBe(true);
  });

  it('shows only one-step exploratory movement into unexplored tiles', () => {
    const state = createNewGame(undefined, 'movement-preview-unexplored-step-limit', 'small');
    state.currentPlayer = 'player';
    state.units = {
      scout: { ...createUnit('scout', 'player', { q: 0, r: 0 }, mkC()), id: 'scout', movementPointsLeft: 3 },
    };
    state.civilizations.player.units = ['scout'];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'unexplored',
      '2,0': 'unexplored',
    };
    state.map.tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    state.map.tiles['2,0'] = { coord: { q: 2, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };

    const result = buildSelectedUnitHighlights(state, 'scout');

    expect(result.movementRange.map(hexKey)).toContain('1,0');
    expect(result.movementRange.map(hexKey)).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'move').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('does not add foreign-blocked worker guidance on unexplored plausible terrain', () => {
    const state = createNewGame(undefined, 'worker-guidance-unexplored-no-leak', 'small');
    state.currentPlayer = 'player';
    state.units = {
      worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }, mkC()), id: 'worker', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['worker'];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
    };
    state.map.tiles['1,-1'] = {
      coord: { q: 1, r: -1 },
      terrain: 'plains',
      elevation: 'lowland',
      resource: null,
      owner: 'ai-1',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };

    const result = buildSelectedUnitHighlights(state, 'worker');

    expect(result.highlights).not.toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
  });

  it('does not highlight Transport coast movement before Galleys and does after unlock', () => {
    const state = createNewGame(undefined, 'transport-highlight-tech-gate', 'small');
    state.currentPlayer = 'player';
    state.units = {
      transport: { ...createUnit('transport', 'player', { q: 0, r: 0 }, mkC()), id: 'transport', movementPointsLeft: 3 },
    };
    state.civilizations.player.units = ['transport'];
    state.map.tiles['0,0'] = {
      coord: { q: 0, r: 0 },
      terrain: 'coast',
      elevation: 'lowland',
      resource: null,
      owner: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };
    state.map.tiles['1,0'] = {
      coord: { q: 1, r: 0 },
      terrain: 'coast',
      elevation: 'lowland',
      resource: null,
      owner: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };

    expect(buildSelectedUnitHighlights(state, 'transport').movementRange.map(hexKey)).not.toContain('1,0');

    state.civilizations.player.techState.completed = ['galleys'];
    expect(buildSelectedUnitHighlights(state, 'transport').movementRange.map(hexKey)).toContain('1,0');
  });
});
