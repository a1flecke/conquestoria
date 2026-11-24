import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, HexCoord, Unit } from '@/core/types';
import { usePropagandistAction } from '@/systems/propagandist-system';
import { issueSeizeTheMoment } from '@/systems/great-general-abilities';
import { resetUnitTurn } from '@/systems/unit-lifecycle';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-validation';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';

function city(id: string, owner: string, q: number): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 2, food: 0, foodNeeded: 10,
    buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

function propagandist(owner: string, q: number): Unit {
  return {
    id: 'propagandist', type: 'propagandist', owner, position: { q, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
}

function stateWithCities(): ReturnType<typeof createNewGame> {
  const state = createNewGame('rome', 'propagandist-actions', 'small');
  const own = city('own', 'player', 0);
  const enemy = city('enemy', 'ai-1', 1);
  state.cities = { own, enemy };
  state.units = { propagandist: propagandist('player', 0) };
  state.civilizations.player = {
    ...state.civilizations.player,
    cities: ['own'], units: ['propagandist'],
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'], cities: ['enemy'], units: [],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  return state;
}

describe('Propagandist actions', () => {
  it('Rally removes a bounded amount of enemy unrest pressure from a nearby friendly city', () => {
    const state = stateWithCities();
    state.cities.own.spyUnrestBonus = 14;

    const result = usePropagandistAction(state, 'propagandist', 'rally', 'own');

    expect(result.ok).toBe(true);
    expect(result.state.cities.own.spyUnrestBonus).toBe(4);
    expect(result.state.units.propagandist.hasActed).toBe(true);
  });

  it('Digital Democracy makes Rally remove an additional five pressure without strengthening Undermine', () => {
    const state = stateWithCities();
    state.cities.own.spyUnrestBonus = 20;
    state.civilizations.player.techState.completed = ['digital-democracy'];

    const rally = usePropagandistAction(state, 'propagandist', 'rally', 'own');

    expect(rally).toMatchObject({ ok: true });
    expect(rally.state.cities.own.spyUnrestBonus).toBe(5);
    const fresh = stateWithCities();
    fresh.civilizations.player.techState.completed = ['digital-democracy'];
    expect(usePropagandistAction(fresh, 'propagandist', 'undermine', 'enemy').state.cities.enemy.spyUnrestBonus).toBe(10);
  });

  it('Undermine adds bounded unrest pressure only to an adjacent civilization at bilateral war', () => {
    const state = stateWithCities();

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result.ok).toBe(true);
    expect(result.state.cities.enemy.spyUnrestBonus).toBe(10);
    expect(result.state.units.propagandist.hasActed).toBe(true);

    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];
    expect(usePropagandistAction(state, 'propagandist', 'undermine', 'enemy')).toMatchObject({ ok: false, reason: 'not-at-war' });
  });

  it('Contemplative Technology reduces incoming Undermine pressure without blocking a legal action', () => {
    const state = stateWithCities();
    state.civilizations['ai-1'].techState.completed = ['contemplative-technology'];

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result).toMatchObject({ ok: true });
    expect(result.state.cities.enemy.spyUnrestBonus).toBe(5);
  });

  it('rejects a repeated, distant, or wrong-unit action without mutating state', () => {
    const state = stateWithCities();
    state.units.propagandist.hasActed = true;
    const acted = usePropagandistAction(state, 'propagandist', 'rally', 'own');
    expect(acted).toMatchObject({ ok: false, reason: 'already-acted', state });

    state.units.propagandist.hasActed = false;
    state.cities.enemy = { ...state.cities.enemy, position: { q: 3, r: 0 } };
    expect(usePropagandistAction(state, 'propagandist', 'undermine', 'enemy')).toMatchObject({ ok: false, reason: 'out-of-range', state });
  });

  it('reaches an enemy city just across the seam of a wrapping map', () => {
    const state = stateWithCities();
    state.map = { ...state.map, wrapsHorizontally: true };
    const last = state.map.width - 1;
    state.cities.enemy = { ...state.cities.enemy, position: { q: last, r: 0 } };
    state.cities.enemy.spyUnrestBonus = 0;

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result).toMatchObject({ ok: true });
  });
});

describe('Propagandist action economy', () => {
  // Movement legality never re-reads hasActed (the resolver, the range preview and the
  // selected-unit highlights all gate on movementPointsLeft alone), so the codebase-wide
  // convention is that every action executor consumes the actor's movement together with
  // its action. The live-path regression below proves a spent propagandist cannot act
  // and then still move.
  const ENTERABLE_TERRAINS = new Set(['grassland', 'plains', 'desert', 'tundra', 'forest', 'jungle', 'hills']);

  function findEnterableAdjacentPair(state: ReturnType<typeof createNewGame>): { from: HexCoord; to: HexCoord } {
    for (const tile of Object.values(state.map.tiles)) {
      if (!ENTERABLE_TERRAINS.has(tile.terrain)) continue;
      for (const neighbor of hexNeighbors(tile.coord)) {
        const neighborTile = state.map.tiles[hexKey(neighbor)];
        if (neighborTile && ENTERABLE_TERRAINS.has(neighborTile.terrain)) {
          return { from: tile.coord, to: neighbor };
        }
      }
    }
    throw new Error('fixture map has no adjacent enterable land pair');
  }

  function stateOnRealTiles() {
    const state = stateWithCities();
    const pair = findEnterableAdjacentPair(state);
    state.units.propagandist = { ...state.units.propagandist, position: pair.from };
    state.cities.own = { ...state.cities.own, position: pair.to };
    return { state, pair };
  }

  it("ends the unit's remaining movement when its action is spent, so Rally is not followed by a free move", () => {
    const { state, pair } = stateOnRealTiles();

    // Fixture precondition: the move is otherwise legal this turn (movement allowance intact,
    // destination enterable and unoccupied) — the exploit is exactly that this stays true
    // after the civic action.
    const before = resolveUnitMoveIntent(state, 'propagandist', pair.to, { actor: 'player', civId: 'player' });
    expect(before.ok).toBe(true);
    expect(getMovementRangeDetails(state, 'propagandist').reachable.length).toBeGreaterThan(0);

    const result = usePropagandistAction(state, 'propagandist', 'rally', 'own');

    expect(result.ok).toBe(true);
    expect(result.state.units.propagandist.hasActed).toBe(true);
    // The action consumed the unit's action economy like every other in-place action
    // (fortify, rest, worker action, spy disguise).
    expect(result.state.units.propagandist.movementPointsLeft).toBe(0);
    // The live movement layer (which never re-checks hasActed) offers the unit nothing afterward.
    expect(getMovementRangeDetails(result.state, 'propagandist').reachable).toHaveLength(0);
    const after = resolveUnitMoveIntent(result.state, 'propagandist', pair.to, { actor: 'player', civId: 'player' });
    expect(after.ok).toBe(false);
  });
});

describe("a Seize the Moment grant does not refresh the once-per-turn civic action (#544 contract §19 item 67)", () => {
  function generalAt(owner: string, position: HexCoord): Unit {
    return {
      id: 'gen-1', type: 'great_general', owner, position,
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_hannibal',
    } as Unit;
  }

  /** One Undermine spent, then Seize the Moment re-opened the propagandist's generic action. */
  function seizedAfterUndermine() {
    const state = stateWithCities();
    state.units['gen-1'] = generalAt('player', { q: 0, r: 0 });
    state.civilizations.player.units = ['gen-1', 'propagandist'];

    const first = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');
    expect(first.ok).toBe(true);
    const seized = issueSeizeTheMoment(first.state, 'gen-1', ['propagandist']);
    // #1807: a grant never clears hasActed, so it cannot refresh the generic action either.
    // The grant marker is the precondition that keeps the refusal below meaningful.
    expect(seized.units.propagandist.hasActed).toBe(true);
    expect(seized.units.propagandist.seizeGrantedBy).toBeDefined();
    return seized;
  }

  it('refuses the second civic action after a Seize grant', () => {
    const seized = seizedAfterUndermine();

    const second = usePropagandistAction(seized, 'propagandist', 'undermine', 'enemy');

    expect(second).toMatchObject({ ok: false, state: seized });
    expect(['used-this-turn', 'already-acted']).toContain((second as { reason: string }).reason);
    // Exactly one use happened this turn, not two.
    expect(seized.cities.enemy.spyUnrestBonus).toBe(10);
  });

  it('records the marker on the successful action', () => {
    const state = stateWithCities();

    const result = usePropagandistAction(state, 'propagandist', 'undermine', 'enemy');

    expect(result.ok).toBe(true);
    expect(result.state.units.propagandist.specialActionUsedTurn).toBe(state.turn);
  });

  it('still refuses the generic-action repeat with the generic reason (the two gates are separate)', () => {
    const state = stateWithCities();
    state.units.propagandist.hasActed = true;

    expect(usePropagandistAction(state, 'propagandist', 'undermine', 'enemy'))
      .toMatchObject({ ok: false, reason: 'already-acted' });
  });

  it('clears the marker with the rest of the per-turn state, so the action returns next round', () => {
    const seized = seizedAfterUndermine();

    const reset = resetUnitTurn(seized.units.propagandist);
    expect(reset.specialActionUsedTurn).toBeUndefined();

    const nextRound: ReturnType<typeof createNewGame> = {
      ...seized,
      turn: seized.turn + 1,
      units: { ...seized.units, propagandist: reset },
    };
    expect(usePropagandistAction(nextRound, 'propagandist', 'undermine', 'enemy')).toMatchObject({ ok: true });
  });
});
