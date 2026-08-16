import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import {
  getActiveCampPressure,
  observeCampPressureFromSensedUnits,
  recordCampPressureFromCombatOutcome,
  recordCampPressure,
} from '@/systems/barbarian-pressure';

function pressureState() {
  const state = createNewGame('rome', 'barbarian-pressure', 'small');
  state.turn = 40;
  state.barbarianCamps = {
    'camp-a': { id: 'camp-a', position: { q: 5, r: 5 }, strength: 5, spawnCooldown: 3 },
  };
  return state;
}

describe('barbarian camp pressure', () => {
  it('keeps armor through the ten-turn expiry boundary and expires it after', () => {
    const state = pressureState();
    const observed = recordCampPressure(state, 'camp-a', 'armor', 40);

    expect(getActiveCampPressure(observed, 'camp-a', 50)).toEqual(['armor']);
    expect(getActiveCampPressure(observed, 'camp-a', 51)).toEqual([]);
  });

  it('renews one scalar fact without retaining live-unit data', () => {
    const state = pressureState();
    const observed = recordCampPressure(
      recordCampPressure(state, 'camp-a', 'armor', 12),
      'camp-a',
      'armor',
      15,
    );

    expect(observed.barbarianCampPressure?.['camp-a']).toEqual({ armorLastObservedTurn: 15 });
    expect(JSON.stringify(observed.barbarianCampPressure)).not.toContain('unit-');
  });

  it('records a nearby sensed armored unit but ignores a distant unit that only exists in game state', () => {
    const state = pressureState();
    const nearbyTank = createUnit('tank', 'player', { q: 7, r: 5 }, state.idCounters);
    const distantTank = createUnit('tank', 'player', { q: 20, r: 5 }, state.idCounters);
    state.units = { [nearbyTank.id]: nearbyTank, [distantTank.id]: distantTank };

    const observed = observeCampPressureFromSensedUnits(state, 'camp-a', [nearbyTank]);

    expect(getActiveCampPressure(observed, 'camp-a', state.turn)).toEqual(['armor']);
    expect(JSON.stringify(observed.barbarianCampPressure)).not.toContain(distantTank.id);
  });

  it('records a sensed based aircraft only when its base is within six hexes', () => {
    const state = pressureState();
    state.cities['airfield'] = {
      id: 'airfield', owner: 'player', position: { q: 7, r: 5 }, buildings: ['airfield'],
    } as never;
    const aircraft = createUnit('biplane', 'player', { q: 7, r: 5 }, state.idCounters);
    aircraft.airBase = { kind: 'city', cityId: 'airfield' };
    state.units = { [aircraft.id]: aircraft };

    expect(getActiveCampPressure(observeCampPressureFromSensedUnits(state, 'camp-a', [aircraft]), 'camp-a', state.turn))
      .toEqual(['air']);
    state.cities.airfield.position = { q: 20, r: 5 };
    expect(getActiveCampPressure(observeCampPressureFromSensedUnits(state, 'camp-a', [aircraft]), 'camp-a', state.turn))
      .toEqual([]);
  });

  it('records armor only when an armored attacker hits a camp-assigned barbarian', () => {
    const state = pressureState();
    const tank = createUnit('tank', 'player', { q: 6, r: 5 }, state.idCounters);
    const raider = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, state.idCounters);
    state.units = { [tank.id]: tank, [raider.id]: raider };
    state.opponentAI = {
      version: 1, migrationGraceRoundsRemaining: 0, majorCivs: {}, barbarianCamps: {},
      barbarianHomeCampByUnitId: { [raider.id]: 'camp-a' }, minorCivs: {}, pressureByCiv: {},
      lastPlannedRound: null, lastProcessedRound: null, lastFinalizedRound: null,
    };

    expect(getActiveCampPressure(recordCampPressureFromCombatOutcome(state, tank, raider), 'camp-a', state.turn))
      .toEqual(['armor']);
    expect(getActiveCampPressure(recordCampPressureFromCombatOutcome(state, { ...tank, type: 'warrior' }, raider), 'camp-a', state.turn))
      .toEqual([]);
  });
});
