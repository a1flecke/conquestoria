import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createUnit, resetUnitTurn } from '@/systems/unit-lifecycle';
import { moveUnit } from '@/systems/unit-low-level-move';
import {
  getUnmovedUnitsForEndTurn,
  removePlayerUnitFromState,
  skipUnitForTurn,
  skipUnitInState,
  fortifyUnitInState,
  unfortifyUnitInState,
} from '@/systems/unit-lifecycle-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { assertAirBaseIntegrity, assertCargoReciprocity } from '../helpers/save-state-invariants';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('unit-lifecycle-system', () => {
  it('marks a skipped unit as done for the current turn without moving it', () => {
    const unit = createUnit('scout', 'player', { q: 2, r: 3 }, mkC());

    const skipped = skipUnitForTurn(unit);

    expect(skipped.position).toEqual({ q: 2, r: 3 });
    expect(skipped.hasMoved).toBe(false);
    expect(skipped.hasActed).toBe(false);
    expect(skipped.movementPointsLeft).toBe(0);
    expect(skipped.isResting).toBe(false);
    expect(skipped.skippedTurn).toBe(true);
  });

  it('updates only the current player unit when skipping through state', () => {
    const state = createNewGame(undefined, 'issue-154-skip-state', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];
    const originalUnit = state.units[unitId];

    const next = skipUnitInState(state, playerId, unitId);

    expect(next).not.toBe(state);
    expect(next.units[unitId]).toEqual({
      ...originalUnit,
      movementPointsLeft: 0,
      isResting: false,
      skippedTurn: true,
    });
    expect(next.units[unitId].hasMoved).toBe(false);
    expect(next.units[unitId].hasActed).toBe(false);
    expect(state.units[unitId].skippedTurn).toBeUndefined();
  });

  it('does not skip an enemy unit through the current player path', () => {
    const state = createNewGame(undefined, 'issue-154-skip-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyId = 'ai-1';
    const enemyUnitId = state.civilizations[enemyId].units[0];
    const originalEnemy = state.units[enemyUnitId];

    const next = skipUnitInState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toEqual(originalEnemy);
  });

  it('removes a current player unit from the map and civilization roster', () => {
    const state = createNewGame(undefined, 'issue-154-delete-unit', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];

    const next = removePlayerUnitFromState(state, playerId, unitId);

    expect(next.units[unitId]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(unitId);
    expect(state.units[unitId]).toBeDefined();
    expect(state.civilizations[playerId].units).toContain(unitId);
  });

  it('does not remove units owned by another civilization', () => {
    const state = createNewGame(undefined, 'issue-154-delete-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    const next = removePlayerUnitFromState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toBeDefined();
  });

  it('cleans up matching spy records when deleting a spy unit', () => {
    const state = createNewGame(undefined, 'issue-154-delete-spy', 'small');
    const playerId = state.currentPlayer;
    const spyUnit = createUnit('spy_scout', playerId, { q: 1, r: 1 }, mkC());
    state.units[spyUnit.id] = spyUnit;
    state.civilizations[playerId].units.push(spyUnit.id);

    const baseEspionage = { ...createEspionageCivState(), maxSpies: 1 };
    const created = createSpyFromUnit(baseEspionage, spyUnit.id, playerId, 'spy_scout', 'issue-154-spy');
    state.espionage = { [playerId]: created.state };

    const next = removePlayerUnitFromState(state, playerId, spyUnit.id);

    expect(next.units[spyUnit.id]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(spyUnit.id);
    expect(next.espionage?.[playerId]?.spies[spyUnit.id]).toBeUndefined();
  });

  it('cascades voluntary deletion from a transport to its cargo', () => {
    const state = createNewGame(undefined, 'delete-transport-cargo', 'small');
    const civId = state.currentPlayer;
    const cargoId = state.civilizations[civId].units.find(unitId =>
      state.units[unitId]?.type === 'settler');
    if (!cargoId) throw new Error('fixture requires a settler');
    const transport = createUnit('transport', civId, { q: 0, r: 0 }, {
      ...mkC(),
      nextUnitId: 999,
    });
    state.units[transport.id] = { ...transport, cargoUnitIds: [cargoId] };
    state.units[cargoId] = { ...state.units[cargoId], transportId: transport.id };
    state.civilizations[civId].units.push(transport.id);

    const next = removePlayerUnitFromState(state, civId, transport.id);

    expect(next.units[transport.id]).toBeUndefined();
    expect(next.units[cargoId]).toBeUndefined();
    expect(next.civilizations[civId].units).not.toContain(transport.id);
    expect(next.civilizations[civId].units).not.toContain(cargoId);
  });

  // #1014: every unit-removal site used to remember its own cascade. This one forgot two of them.
  it('deleting an EMBARKED unit removes it from its surviving transport manifest (cargo-reciprocity holds)', () => {
    const state = createNewGame(undefined, 'delete-embarked-cargo', 'small');
    const civId = state.currentPlayer;
    const anchor = Object.values(state.units).find(unit => unit.owner === civId)!;
    const transport = { ...createUnit('transport', civId, anchor.position, { ...mkC(), nextUnitId: 900 }), id: 'transport-1', cargoUnitIds: ['cargo-1'] };
    const cargo = { ...createUnit('warrior', civId, anchor.position, { ...mkC(), nextUnitId: 901 }), id: 'cargo-1', transportId: transport.id };
    state.units[transport.id] = transport;
    state.units[cargo.id] = cargo;
    state.civilizations[civId].units.push(transport.id, cargo.id);
    expect(() => assertCargoReciprocity(state)).not.toThrow();

    const next = removePlayerUnitFromState(state, civId, cargo.id);

    expect(next.units[cargo.id]).toBeUndefined();
    expect(next.units[transport.id]).toBeDefined();
    expect(next.units[transport.id]!.cargoUnitIds ?? []).not.toContain(cargo.id);
    expect(() => assertCargoReciprocity(next)).not.toThrow();
  });

  it('deleting a carrier removes its based aircraft with it, exactly as losing it in combat does (air-base-integrity holds)', () => {
    const state = createNewGame(undefined, 'delete-carrier-air-wing', 'small');
    const civId = state.currentPlayer;
    const anchor = Object.values(state.units).find(unit => unit.owner === civId)!;
    const carrier = { ...createUnit('carrier', civId, anchor.position, { ...mkC(), nextUnitId: 910 }), id: 'carrier-1' };
    const jet = { ...createUnit('biplane', civId, anchor.position, { ...mkC(), nextUnitId: 911 }), id: 'jet-1', airBase: { kind: 'carrier' as const, unitId: carrier.id } };
    state.units[carrier.id] = carrier;
    state.units[jet.id] = jet;
    state.civilizations[civId].units.push(carrier.id, jet.id);
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();

    const next = removePlayerUnitFromState(state, civId, carrier.id);

    expect(next.units[carrier.id]).toBeUndefined();
    expect(next.units[jet.id]).toBeUndefined();
    expect(next.civilizations[civId].units).not.toContain(jet.id);
    expect(() => assertAirBaseIntegrity(next)).not.toThrow();
  });

  // #1198: disbanding a caravan ends its route inside the removal itself. The UI used to remember to end the
  // route in a pre-step; any other caller of removePlayerUnitFromState left a route running with no runner.
  it('disbanding a committed caravan ends its trade route and announces it (#1198)', () => {
    const state = createNewGame(undefined, 'delete-caravan-route', 'small');
    const civId = state.currentPlayer;
    const anchor = Object.values(state.units).find(unit => unit.owner === civId)!;
    const caravan = { ...createUnit('caravan', civId, anchor.position, { ...mkC(), nextUnitId: 930 }), id: 'caravan-1', committedToRouteId: 'route-1' };
    state.units[caravan.id] = caravan;
    state.civilizations[civId].units.push(caravan.id);
    state.marketplace = {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: [{ id: 'route-1', fromCityId: 'a', toCityId: 'b', goldPerTrip: 5, turnsPerTrip: 3 }],
    };
    const bus = new EventBus();
    const ended = vi.fn();
    bus.on('trade:route-ended', ended);

    const next = removePlayerUnitFromState(state, civId, caravan.id, bus);

    expect(next.units[caravan.id]).toBeUndefined();
    expect(next.marketplace!.tradeRoutes).toEqual([]);
    expect(ended).toHaveBeenCalledWith({ routeId: 'route-1', fromCityId: 'a', toCityId: 'b', reason: 'unit-disbanded' });
  });

  it('deleting a city-based aircraft leaves the city and every other unit alone', () => {
    const state = createNewGame(undefined, 'delete-city-based-aircraft', 'small');
    const civId = state.currentPlayer;
    const anchor = Object.values(state.units).find(unit => unit.owner === civId)!;
    const jet = { ...createUnit('biplane', civId, anchor.position, { ...mkC(), nextUnitId: 920 }), id: 'jet-city' };
    state.units[jet.id] = jet;
    state.civilizations[civId].units.push(jet.id);
    const others = Object.keys(state.units).filter(id => id !== jet.id);

    const next = removePlayerUnitFromState(state, civId, jet.id);

    expect(next.units[jet.id]).toBeUndefined();
    for (const id of others) expect(next.units[id]).toBeDefined();
  });

  it('finalizes a cityless civilization when its last settler is voluntarily deleted', () => {
    const state = createNewGame(undefined, 'delete-last-settler', 'small');
    const civId = state.currentPlayer;
    const settlerId = state.civilizations[civId].units.find(unitId =>
      state.units[unitId]?.type === 'settler');
    if (!settlerId) throw new Error('fixture requires a settler');
    const bus = new EventBus();
    const eliminated = vi.fn();
    bus.on('civ:eliminated', eliminated);

    const next = removePlayerUnitFromState(state, civId, settlerId, bus);

    expect(next.civilizations[civId].isEliminated).toBe(true);
    expect(eliminated).toHaveBeenCalledWith({ civId, eliminatedBy: null });
  });

  it('excludes fortified units from getUnmovedUnitsForEndTurn', () => {
    const state = createNewGame(undefined, 'fortify-unmoved-test', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];

    state.units[unitId] = { ...state.units[unitId], isFortified: true };

    const unmoved = getUnmovedUnitsForEndTurn(state, playerId).map(u => u.id);
    expect(unmoved).not.toContain(unitId);
  });

  it('clears isFortified when a unit moves', () => {
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    const fortifiedUnit = { ...unit, isFortified: true };
    const moved = moveUnit(fortifiedUnit, { q: 1, r: 0 }, 1);
    expect(moved.isFortified).toBeUndefined();
  });

  it('preserves isFortified through resetUnitTurn (fortification persists across turns)', () => {
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    const fortifiedAndActed = { ...unit, isFortified: true, hasActed: true, movementPointsLeft: 0 };
    const reset = resetUnitTurn(fortifiedAndActed);
    expect(reset.isFortified).toBe(true);
    expect(reset.hasActed).toBe(false);
    expect(reset.movementPointsLeft).toBeGreaterThan(0);
  });

  it('returns only current-player units that still need orders at end turn', () => {
    const state = createNewGame(undefined, 'issue-154-unmoved', 'small');
    const playerId = state.currentPlayer;
    const firstUnitId = state.civilizations[playerId].units[0];
    const secondUnitId = state.civilizations[playerId].units[1];
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    state.units[firstUnitId] = { ...state.units[firstUnitId], hasMoved: true, movementPointsLeft: 0 };
    state.units[secondUnitId] = { ...state.units[secondUnitId], skippedTurn: true, movementPointsLeft: 0 };
    state.units['fresh-player-unit'] = {
      ...createUnit('warrior', playerId, { q: 4, r: 4 }, mkC()),
      id: 'fresh-player-unit',
    };
    state.civilizations[playerId].units.push('fresh-player-unit');

    const warningUnits = getUnmovedUnitsForEndTurn(state, playerId).map(unit => unit.id);

    expect(warningUnits).toContain('fresh-player-unit');
    expect(warningUnits).not.toContain(firstUnitId);
    expect(warningUnits).not.toContain(secondUnitId);
    expect(warningUnits).not.toContain(enemyUnitId);
  });

  it('returns an owned unit even when a stale civilization roster omits it', () => {
    const state = createNewGame(undefined, 'issue-981-unrostered-unit', 'small');
    const playerId = state.currentPlayer;
    const unit = createUnit('warrior', playerId, { q: 4, r: 4 }, mkC());
    state.units[unit.id] = unit;

    expect(getUnmovedUnitsForEndTurn(state, playerId).map(candidate => candidate.id))
      .toContain(unit.id);
  });
});

describe('fortifyUnitInState / unfortifyUnitInState', () => {
  it('fortifyUnitInState sets isFortified, consumes the action, and zeroes movement', () => {
    const state = createNewGame(undefined, 'fortify-state-test', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];
    const original = state.units[unitId];

    const next = fortifyUnitInState(state, playerId, unitId);

    expect(next.units[unitId].isFortified).toBe(true);
    expect(next.units[unitId].hasActed).toBe(true);
    expect(next.units[unitId].movementPointsLeft).toBe(0);
    // original state untouched
    expect(original.isFortified).toBeUndefined();
  });

  it('fortifyUnitInState returns the same state object for an enemy unit', () => {
    const state = createNewGame(undefined, 'fortify-enemy-test', 'small');
    const playerId = state.currentPlayer;
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    const next = fortifyUnitInState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
  });

  it('unfortifyUnitInState clears isFortified without changing other fields', () => {
    const state = createNewGame(undefined, 'unfortify-test', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];
    state.units[unitId] = { ...state.units[unitId], isFortified: true };

    const next = unfortifyUnitInState(state, playerId, unitId);

    expect(next.units[unitId].isFortified).toBeUndefined();
    expect(next.units[unitId].id).toBe(unitId);
  });

  it('unfortifyUnitInState returns the same state object for an enemy unit', () => {
    const state = createNewGame(undefined, 'unfortify-enemy-test', 'small');
    const playerId = state.currentPlayer;
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    const next = unfortifyUnitInState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
  });
});
