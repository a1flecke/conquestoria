/**
 * #1025 — the movement family's canonical validation/execution contract.
 *
 * `resolveUnitMoveIntent` is the single legality+cost check that previews, AI and
 * the executor share; `executeValidatedUnitMove` is the only executor and it
 * accepts only a `ValidatedUnitMove` the resolver produced.
 */
import { describe, it, expect } from 'vitest';
import type { GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createUnit } from '@/systems/unit-system';
import {
  resolveUnitMoveIntent,
  executeUnitMove,
  executeValidatedUnitMove,
} from '@/systems/unit-movement-system';

function grasslandMap(w: number, h: number): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < w; q++) {
    for (let r = 0; r < h; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
      };
    }
  }
  return { width: w, height: h, wrapsHorizontally: false, tiles, rivers: [] };
}

function makeState(opts: { movementPointsLeft?: number } = {}): { state: GameState; unitId: string } {
  const map = grasslandMap(6, 4);
  const unit: Unit = {
    id: 'unit-w1', type: 'warrior', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: opts.movementPointsLeft ?? 3, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  };
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible' as const])) };
  const state = {
    turn: 1, era: 1, gameId: 'movement-resolver', currentPlayer: 'player',
    gameOver: false, winner: null, map,
    units: { [unit.id]: unit },
    cities: {},
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic',
        cities: [], units: [unit.id],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
        gold: 0, visibility, knownCivilizations: [], score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {}, minorCivs: {}, tribalVillages: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
  } as unknown as GameState;
  return { state, unitId: unit.id };
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

const asPlayer = { actor: 'player', civId: 'player' } as const;

describe('#1025 resolveUnitMoveIntent — the canonical movement resolver', () => {
  it('a resolved command executes to the identical result as the one-call executor', () => {
    const a = makeState();
    const b = makeState();

    const viaWrapper = executeUnitMove(a.state, a.unitId, { q: 3, r: 0 }, asPlayer);

    const resolution = resolveUnitMoveIntent(b.state, b.unitId, { q: 3, r: 0 }, asPlayer);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const viaCommand = executeValidatedUnitMove(b.state, resolution.command);

    expect(viaCommand).toEqual(viaWrapper);
    expect(a.state.units[a.unitId]!.position).toEqual(b.state.units[b.unitId]!.position);
  });

  it('the resolved command carries the validated path and cost', () => {
    const { state, unitId } = makeState();
    const resolution = resolveUnitMoveIntent(state, unitId, { q: 3, r: 0 }, asPlayer);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.command.unitId).toBe(unitId);
    expect(resolution.command.path[0]).toEqual({ q: 0, r: 0 });
    expect(resolution.command.path.at(-1)).toEqual({ q: 3, r: 0 });
    expect(resolution.command.cost).toBe(3);
  });

  it('an illegal move resolves to a typed rejection with player-facing copy — and yields no command', () => {
    const { state, unitId } = makeState({ movementPointsLeft: 1 });
    const resolution = resolveUnitMoveIntent(state, unitId, { q: 3, r: 0 }, asPlayer);
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.reason).toBe('insufficient-movement');
    expect(resolution.message).toMatch(/movement/i);
    expect(resolution).not.toHaveProperty('command');
  });

  it('a rejected move mutates nothing when pushed through the one-call executor', () => {
    const { state, unitId } = makeState({ movementPointsLeft: 1 });
    const before = clone(state);
    const result = executeUnitMove(state, unitId, { q: 3, r: 0 }, asPlayer);
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('is deterministic — identical inputs give an identical command', () => {
    const a = makeState();
    const b = makeState();
    const ra = resolveUnitMoveIntent(a.state, a.unitId, { q: 3, r: 0 }, asPlayer);
    const rb = resolveUnitMoveIntent(b.state, b.unitId, { q: 3, r: 0 }, asPlayer);
    expect(ra).toEqual(rb);
  });

  it('legality is owner-scoped, not viewer-scoped — a different currentPlayer does not change the resolution', () => {
    const a = makeState();
    const b = makeState();
    b.state.currentPlayer = 'someone-else';
    const ra = resolveUnitMoveIntent(a.state, a.unitId, { q: 3, r: 0 }, asPlayer);
    const rb = resolveUnitMoveIntent(b.state, b.unitId, { q: 3, r: 0 }, asPlayer);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(rb.command.path).toEqual(ra.command.path);
    expect(rb.command.cost).toEqual(ra.command.cost);
  });
});

describe('#1025 MR4 — impassable-terrain copy', () => {
  it('a naval unit onto land gets the naval-specific message, not the generic one', () => {
    const map = grasslandMap(4, 3);
    map.tiles[hexKey({ q: 0, r: 0 })]!.terrain = 'coast';
    const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const galley = createUnit('galley', 'player', { q: 0, r: 0 }, c);
    const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible' as const])) };
    const state = {
      turn: 1, era: 1, gameId: 'naval-copy', currentPlayer: 'player', gameOver: false, winner: null, map,
      units: { [galley.id]: galley }, cities: {}, barbarianCamps: {}, tribalVillages: {},
      civilizations: {
        player: {
          id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic',
          cities: [], units: [galley.id],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
          gold: 0, visibility, knownCivilizations: [], score: 0,
          diplomacy: createDiplomacyState(['player'], 'player'),
        },
      },
    } as unknown as GameState;

    const res = resolveUnitMoveIntent(state, galley.id, { q: 1, r: 0 }, asPlayer);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('impassable-terrain');
    expect(res.message).toBe('Naval units cannot move on land.');
  });
});
