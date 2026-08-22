import { describe, expect, it } from 'vitest';
import { resolvePatrolMission, getLegalAirMissionTargets, getAirBaseRoster, getAirBaseCapacity } from '@/systems/air-operations-system';
import { isSubmarineConcealedFrom } from '@/systems/concealment';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';

describe('carrier air wing save/load round-trip (#582)', () => {
  it('preserves a mixed air wing (fighter + naval strike + patrol) and an active patrol reveal through a same-turn save/load, clearing correctly next turn', () => {
    const state = createNewGame('rome', 'carrier-air-wing-save-round-trip');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';

    const carrierId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[carrierId] = {
      id: carrierId, type: 'carrier', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, carrierId];

    const fighterId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[fighterId] = {
      id: fighterId, type: 'jet_fighter', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      airBase: { kind: 'carrier', unitId: carrierId },
    };
    playerCiv.units = [...playerCiv.units, fighterId];

    const strikeId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[strikeId] = {
      id: strikeId, type: 'naval_strike_aircraft', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: true, isResting: false,
      airBase: { kind: 'carrier', unitId: carrierId },
    };
    playerCiv.units = [...playerCiv.units, strikeId];

    const patrolId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[patrolId] = {
      id: patrolId, type: 'maritime_patrol_aircraft', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      airBase: { kind: 'carrier', unitId: carrierId },
    };
    playerCiv.units = [...playerCiv.units, patrolId];

    const targets = getLegalAirMissionTargets(state, patrolId, 'patrol');
    expect(targets.length).toBeGreaterThan(0);
    const center = targets[0]!;
    const patrolled = resolvePatrolMission(state, patrolId, center);
    if (!patrolled.ok) throw new Error('expected ok');

    // Hostile submarine within the patrol radius, to prove the reveal is
    // actually load-bearing for detection, not just present as data.
    const submarineId = `unit-${state.idCounters.nextUnitId++}`;
    patrolled.state.units[submarineId] = {
      id: submarineId, type: 'submarine', owner: 'ai-1', position: { ...center },
      movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    const serialized = serializeSaveFile(patrolled.state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got error: ${parsed.message}`);
    const loaded = parsed.state;

    const roster = getAirBaseRoster(loaded, { kind: 'carrier', unitId: carrierId }).map(unit => unit.id).sort();
    expect(roster).toEqual([fighterId, patrolId, strikeId].sort());

    const patrolAircraft = loaded.units[patrolId]!;
    expect(patrolAircraft.hasActed).toBe(true);
    expect(patrolAircraft.movementPointsLeft).toBe(0);

    const submarine = loaded.units[submarineId]!;
    expect(isSubmarineConcealedFrom(loaded, submarine, 'player')).toBe(false);

    const nextTurnState = processTurn(loaded, new EventBus());
    const resetPatrolAircraft = nextTurnState.units[patrolId]!;
    expect(resetPatrolAircraft.hasActed).toBe(false);
    expect(resetPatrolAircraft.movementPointsLeft).toBeGreaterThan(0);

    const nextTurnSubmarine = nextTurnState.units[submarineId]!;
    expect(isSubmarineConcealedFrom(nextTurnState, nextTurnSubmarine, 'player')).toBe(true);
  });

  it('a pre-feature save (no patrolReveals field, no carrierDeckCapacity-dependent state) loads and computes capacity correctly with zero migration', () => {
    const state = createNewGame('rome', 'carrier-air-wing-pre-feature-save');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    // A plain Unit record shaped exactly like any other unit already
    // persisted in an old save -- no new field added to the instance,
    // proving deck capacity comes entirely from static UNIT_DEFINITIONS.
    const carrierId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[carrierId] = {
      id: carrierId, type: 'carrier', owner: 'player', position: { ...startingPosition },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, carrierId];
    expect(state.patrolReveals).toBeUndefined();

    const serialized = serializeSaveFile(state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got error: ${parsed.message}`);
    const loaded = parsed.state;

    expect(getAirBaseCapacity(loaded, { kind: 'carrier', unitId: carrierId })).toBe(2);
  });
});
