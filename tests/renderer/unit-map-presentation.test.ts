import { describe, expect, it } from 'vitest';
import type { GameState, Unit, VisibilityMap } from '@/core/types';
import {
  buildUnitMapPresentations,
  getUnitLayoutMetrics,
} from '@/renderer/unit-map-presentation';

function unit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    type: 'warrior',
    owner: 'player',
    position: { q: 1, r: 1 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    ...overrides,
  };
}

function state(units: Unit[]): GameState {
  const visibility: VisibilityMap = { tiles: { '1,1': 'visible', '2,2': 'visible' } };
  return {
    currentPlayer: 'player',
    units: Object.fromEntries(units.map(entry => [entry.id, entry])),
    cities: {},
    civilizations: {
      player: {
        id: 'player', civType: 'rome', color: '#c33', visibility,
        diplomacy: { atWarWith: ['enemy'] },
      } as any,
      enemy: { id: 'enemy', civType: 'england', color: '#33c', visibility: { tiles: {} } } as any,
      ally: { id: 'ally', civType: 'greece', color: '#3c3', visibility: { tiles: {} } } as any,
    },
    minorCivs: {},
    map: {
      width: 8,
      height: 8,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '1,1': { coord: { q: 1, r: 1 }, terrain: 'plains' },
        '2,2': { coord: { q: 2, r: 2 }, terrain: 'plains' },
      },
    },
  } as unknown as GameState;
}

describe('unit map presentation', () => {
  it('uses one invariant half-hex layout for every renderer', () => {
    expect(getUnitLayoutMetrics(40)).toMatchObject({
      displaySize: 36,
      halfDisplaySize: 18,
    });
  });

  it('uses the selected friendly member as lead without shrinking the stack', () => {
    const units = [
      unit('ready'),
      unit('selected', { movementPointsLeft: 0, hasActed: true }),
    ];

    const [presentation] = buildUnitMapPresentations(
      state(units),
      'player',
      { tiles: { '1,1': 'visible' } },
      new Set(),
      'selected',
    );

    expect(presentation.leadUnitId).toBe('selected');
    expect(presentation.memberIds).toEqual(['ready', 'selected']);
    expect(presentation.stackCount).toBe(2);
  });

  it('falls back to the existing readiness ordering for a friendly stack', () => {
    const units = [
      unit('spent', { type: 'archer', movementPointsLeft: 0, hasActed: true }),
      unit('ready-worker', { type: 'worker' }),
    ];

    const [presentation] = buildUnitMapPresentations(
      state(units),
      'player',
      { tiles: { '1,1': 'visible' } },
      new Set(),
      null,
    );

    expect(presentation.leadUnitId).toBe('ready-worker');
  });

  it('uses the canonical combat defender as hostile lead', () => {
    const units = [
      unit('a-weak', { owner: 'enemy', health: 20 }),
      unit('z-strong', { owner: 'enemy', type: 'swordsman', health: 100 }),
    ];

    const [presentation] = buildUnitMapPresentations(
      state(units),
      'player',
      { tiles: { '1,1': 'visible' } },
      new Set(),
      null,
    );

    expect(presentation.leadUnitId).toBe('z-strong');
  });

  it('excludes moving and transported units before grouping', () => {
    const units = [
      unit('static'),
      unit('moving'),
      unit('cargo', { transportId: 'ship' }),
    ];

    const [presentation] = buildUnitMapPresentations(
      state(units),
      'player',
      { tiles: { '1,1': 'visible' } },
      new Set(['moving']),
      null,
    );

    expect(presentation.memberIds).toEqual(['static']);
  });

  it('keeps co-located units from different owners in separate offset presentations', () => {
    const units = [
      unit('player-caravan', { type: 'caravan' }),
      unit('ally-warrior', { owner: 'ally' }),
      unit('ally-archer', { owner: 'ally', type: 'archer' }),
    ];

    const presentations = buildUnitMapPresentations(
      state(units),
      'player',
      { tiles: { '1,1': 'visible' } },
      new Set(),
      null,
    );

    expect(presentations).toHaveLength(2);
    expect(presentations.map(presentation => presentation.memberIds)).toEqual([
      ['player-caravan'],
      ['ally-archer', 'ally-warrior'],
    ]);
    expect(presentations[0].anchorOffsetFactor.x).toBeLessThan(0);
    expect(presentations[1].anchorOffsetFactor.x).toBeGreaterThan(0);
  });
});
