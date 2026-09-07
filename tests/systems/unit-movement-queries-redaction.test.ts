import { describe, it, expect } from 'vitest';
import {
  redactMovementRejectionForViewer,
  findZoneOfControlStop,
} from '@/systems/unit-movement-queries';
import { createUnit } from '@/systems/unit-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameMap, GameState } from '@/core/types';

function zocState(): { state: GameState; mover: ReturnType<typeof createUnit> } {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 6; q++) for (let r = 0; r < 3; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  const map: GameMap = { width: 6, height: 3, wrapsHorizontally: false, tiles, rivers: [] };
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, c);
  mover.movementPointsLeft = 4;
  // Enemy at (2,1) exerts ZoC over its neighbours, which includes (2,0).
  const enemy = createUnit('warrior', 'civ-b', { q: 2, r: 1 }, c);
  // ZoC only applies between HOSTILE owners — isHostileOwnerTo checks atWarWith.
  const diploA = { ...createDiplomacyState(['civ-a', 'civ-b'], 'civ-a'), atWarWith: ['civ-b'] };
  const diploB = { ...createDiplomacyState(['civ-a', 'civ-b'], 'civ-b'), atWarWith: ['civ-a'] };
  const state = {
    turn: 1, era: 1, gameId: 'zoc', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [mover.id]: mover, [enemy.id]: enemy }, cities: {}, barbarianCamps: {}, tribalVillages: {},
    civilizations: {
      'civ-a': { id: 'civ-a', units: [mover.id], techState: { completed: [] }, diplomacy: diploA },
      'civ-b': { id: 'civ-b', units: [enemy.id], techState: { completed: [] }, diplomacy: diploB },
    },
  } as unknown as GameState;
  return { state, mover };
}

describe('#1025 MR4 — viewer redaction', () => {
  const specific = { code: 'impassable-water' as const, message: 'Land units cannot cross water yet.' };

  it('redacts any reason to the generic one when the destination is unexplored', () => {
    expect(redactMovementRejectionForViewer(specific, 'unexplored'))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('passes the reason through unchanged when the destination is explored', () => {
    // VisibilityState is 'unexplored' | 'fog' | 'visible' (src/core/types.ts:431) —
    // there is no 'fogged'.
    expect(redactMovementRejectionForViewer(specific, 'visible')).toEqual(specific);
    expect(redactMovementRejectionForViewer(specific, 'fog')).toEqual(specific);
  });

  it('passes through when the viewer supplied no visibility', () => {
    expect(redactMovementRejectionForViewer(specific, undefined)).toEqual(specific);
  });
});

describe('#1025 MR4 — zone-of-control stop detection', () => {
  it('reports the first ZoC-limited tile on the path', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toEqual({ q: 2, r: 0 });
  });

  it('returns null when no path tile is ZoC-limited', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toBeNull();
  });
});
