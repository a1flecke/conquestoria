import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, LastSeenTilePresentation, UnitType } from '@/core/types';
import { buildViewerMilitaryIntel, estimatePerceivedCivStrength } from '@/systems/diplomatic-strength';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-lifecycle';

// #1334: the shared diplomatic strength is a function of what the viewer legitimately knows. Hidden enemy military
// must not move it; a unit the viewer can see (or remembers inside the decay window) must.
const VIEWER = 'ai-1';
const TARGET = 'player';
const SEEN = { q: 8, r: 4 };
const HIDDEN = { q: 12, r: 4 };

function makeState(): GameState {
  const state = createNewGame(undefined, 'diplomatic-strength-privacy', 'small');
  state.turn = 10;
  state.civilizations[VIEWER].knownCivilizations = [TARGET];
  state.civilizations[VIEWER].visibility.tiles = {};
  state.civilizations[VIEWER].visibility.lastSeen = {};
  return state;
}

function addUnit(state: GameState, type: UnitType, position: { q: number; r: number }, id: string) {
  const unit = createUnit(type, TARGET, position, state.idCounters);
  unit.id = id;
  state.units[id] = unit;
  state.civilizations[TARGET].units.push(id);
  return unit;
}

function snapshot(state: GameState, observedTurn: number, units: LastSeenTilePresentation['units']): LastSeenTilePresentation {
  const tile = state.map.tiles[hexKey(SEEN)];
  return {
    coord: { ...SEEN },
    terrain: tile.terrain,
    elevation: tile.elevation,
    resource: tile.resource,
    improvement: tile.improvement,
    improvementTurnsLeft: tile.improvementTurnsLeft,
    owner: tile.owner,
    hasRiver: tile.hasRiver,
    wonder: tile.wonder,
    observedTurn,
    source: 'observed',
    units,
  };
}

const estimate = (state: GameState) =>
  estimatePerceivedCivStrength(buildViewerMilitaryIntel(state, VIEWER), TARGET, 5);

describe('shared diplomatic strength is viewer-safe (#1334)', () => {
  it('is unknown, not zero, when the viewer has met a civilization it has never seen fight', () => {
    const state = makeState();
    const result = estimate(state);
    expect(result.hasUsableObservation).toBe(false);
    expect(result.exactVisible).toBe(0);
    expect(result.uncertaintyUpper).toBeGreaterThan(0);
  });

  it('ignores hidden enemy units entirely (differential)', () => {
    const base = makeState();
    const withHidden = makeState();
    addUnit(withHidden, 'tank', HIDDEN, 'hidden-tank');
    addUnit(withHidden, 'tank', HIDDEN, 'hidden-tank-2');
    withHidden.civilizations[VIEWER].visibility.tiles[hexKey(HIDDEN)] = 'fog';
    expect(estimate(withHidden)).toEqual(estimate(base));
  });

  it('ignores a hidden production change or a hidden treasury (differential)', () => {
    const base = makeState();
    const changed = makeState();
    changed.civilizations[TARGET].gold = 99999;
    changed.civilizations[TARGET].techState.completed = ['cyber-warfare', 'jet-aviation'];
    expect(estimate(changed)).toEqual(estimate(base));
  });

  it('counts a unit the viewer currently sees', () => {
    const base = makeState();
    const seen = makeState();
    const unit = addUnit(seen, 'swordsman', SEEN, 'seen-swordsman');
    seen.civilizations[VIEWER].visibility.tiles[hexKey(unit.position)] = 'visible';
    const before = estimate(base);
    const after = estimate(seen);
    expect(after.hasUsableObservation).toBe(true);
    expect(after.exactVisible).toBeGreaterThan(0);
    expect(after.uncertaintyUpper).toBeGreaterThan(before.uncertaintyUpper);
  });

  it('counts a remembered unit inside the decay window and drops it after', () => {
    const fresh = makeState();
    fresh.civilizations[VIEWER].visibility.tiles[hexKey(SEEN)] = 'fog';
    fresh.civilizations[VIEWER].visibility.lastSeen![hexKey(SEEN)] = snapshot(fresh, fresh.turn - 2, [
      { id: 'remembered-tank', type: 'tank', owner: TARGET, healthBand: 'healthy' },
    ]);
    expect(estimate(fresh).hasUsableObservation).toBe(true);
    expect(estimate(fresh).remembered).toBeGreaterThan(0);

    const stale = makeState();
    stale.civilizations[VIEWER].visibility.tiles[hexKey(SEEN)] = 'fog';
    stale.civilizations[VIEWER].visibility.lastSeen![hexKey(SEEN)] = snapshot(stale, stale.turn - 6, [
      { id: 'remembered-tank', type: 'tank', owner: TARGET, healthBand: 'healthy' },
    ]);
    const result = estimate(stale);
    expect(result.hasUsableObservation).toBe(false);
    expect(result.remembered).toBe(0);
  });

  it('does not count a civilian or a spy seen next to the border as military', () => {
    const state = makeState();
    const worker = addUnit(state, 'worker', SEEN, 'seen-worker');
    state.civilizations[VIEWER].visibility.tiles[hexKey(worker.position)] = 'visible';
    expect(estimate(state).hasUsableObservation).toBe(false);
  });

  it('uses the viewer\'s own authoritative units for its own strength', () => {
    const state = makeState();
    const intel = buildViewerMilitaryIntel(state, VIEWER);
    const own = estimatePerceivedCivStrength(intel, VIEWER, 5);
    expect(own.hasUsableObservation).toBe(state.civilizations[VIEWER].units.length > 0
      && state.civilizations[VIEWER].units.some(id => state.units[id].type === 'warrior'));
    expect(own.uncertaintyLower).toBe(own.uncertaintyUpper);
  });
});
