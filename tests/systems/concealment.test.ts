import { describe, it, expect } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { BUILDINGS } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import {
  isSubmarineConcealedFrom,
  isUnitConcealedFrom,
  getSubmarineRevealState,
} from '@/systems/concealment';
import type { City, GameState, HexCoord, Unit, UnitType } from '@/core/types';

function setup(): GameState {
  return createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'concealment-test' });
}

function setTerrain(state: GameState, position: HexCoord, terrain: 'ocean' | 'plains'): void {
  state.map.tiles[hexKey(position)].terrain = terrain;
}

function placeUnit(state: GameState, civId: string, type: UnitType, position: HexCoord): Unit {
  const unit = createUnit(type, civId, position, state.idCounters);
  state.units[unit.id] = unit;
  state.civilizations[civId].units.push(unit.id);
  return unit;
}

function placeCity(state: GameState, civId: string, position: HexCoord, buildings: string[]): City {
  const id = `city-${state.idCounters.nextCityId++}`;
  const city: City = {
    id,
    name: id,
    owner: civId,
    position,
    population: 4,
    food: 0,
    foodNeeded: 20,
    buildings,
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };
  state.cities[id] = city;
  state.civilizations[civId].cities.push(id);
  return city;
}

describe('isSubmarineConcealedFrom', () => {
  it('conceals an enemy submarine with no detector nearby', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('reveals an enemy submarine adjacent to a viewer naval unit', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('reveals an enemy submarine adjacent to a viewer air unit', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'biplane', { q: 1, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('does NOT reveal an enemy submarine adjacent to a viewer land unit', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'warrior', { q: 1, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('does not conceal a submarine from its own owner', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'player', 'submarine', { q: 0, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('is unaffected by an ordinary detector two hexes away (no capability, ordinary range 1)', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    setTerrain(state, { q: 2, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'galley', { q: 2, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('returns false (not concealed) for a non-submarine unit type', () => {
    const state = setup();
    const warrior = placeUnit(state, 'ai-1', 'warrior', { q: 0, r: 0 });
    expect(isSubmarineConcealedFrom(state, warrior, 'player')).toBe(false);
  });

  it('treats revealedThisTurn as an override that defeats concealment', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    sub.revealedThisTurn = true;
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });
});

describe('isUnitConcealedFrom', () => {
  it('conceals a submarine with no detector (submarine branch)', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    expect(isUnitConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('reveals a submarine once a viewer naval unit is adjacent', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
    expect(isUnitConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('always shows the owner their own submarine', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'player', 'submarine', { q: 0, r: 0 });
    expect(isUnitConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('never conceals an ordinary enemy land unit', () => {
    const state = setup();
    const warrior = placeUnit(state, 'ai-1', 'warrior', { q: 5, r: 5 });
    expect(isUnitConcealedFrom(state, warrior, 'player')).toBe(false);
  });
});

describe('destroyer and autonomous_frigate detection range', () => {
  it('destroyer detects a submarine at range 2', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    setTerrain(state, { q: 2, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'destroyer', { q: 2, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('destroyer does not detect a submarine at range 3', () => {
    const state = setup();
    for (let q = 0; q <= 3; q++) setTerrain(state, { q, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'destroyer', { q: 3, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('autonomous_frigate detects a submarine at range 3', () => {
    const state = setup();
    for (let q = 0; q <= 3; q++) setTerrain(state, { q, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'autonomous_frigate', { q: 3, r: 0 });
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });
});

describe('city detection', () => {
  it('a city with no coastal_battery never detects', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeCity(state, 'player', { q: 1, r: 0 }, []);
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('a city with coastal_battery detects at range 1', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeCity(state, 'player', { q: 1, r: 0 }, ['coastal_battery']);
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('a city with coastal_battery + radar_station detects at range 2', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    setTerrain(state, { q: 2, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeCity(state, 'player', { q: 2, r: 0 }, ['coastal_battery', 'radar_station']);
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('a city with only radar_station (no coastal_battery) does not detect', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeCity(state, 'player', { q: 1, r: 0 }, ['radar_station']);
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });
});

describe('getSubmarineRevealState', () => {
  it('returns null for a concealed submarine', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    expect(getSubmarineRevealState(state, sub, 'player')).toBeNull();
  });

  it('returns "tracked" when an active detector is in range', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
    expect(getSubmarineRevealState(state, sub, 'player')).toBe('tracked');
  });

  it('returns "spotted-momentarily" when visible only via revealedThisTurn', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    sub.revealedThisTurn = true;
    expect(getSubmarineRevealState(state, sub, 'player')).toBe('spotted-momentarily');
  });

  it('prefers "tracked" when both an active detector AND revealedThisTurn are true', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    sub.revealedThisTurn = true;
    placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
    expect(getSubmarineRevealState(state, sub, 'player')).toBe('tracked');
  });

  it('returns null for the owner\'s own submarine', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'player', 'submarine', { q: 0, r: 0 });
    expect(getSubmarineRevealState(state, sub, 'player')).toBeNull();
  });
});

describe('submarine/destroyer content honesty', () => {
  it('destroyer detection range matches its description', () => {
    expect(UNIT_DEFINITIONS.destroyer.detection?.concealedNavalRange).toBe(2);
  });

  it('autonomous_frigate detection range matches its description', () => {
    expect(UNIT_DEFINITIONS.autonomous_frigate.detection?.concealedNavalRange).toBe(3);
  });

  it('radar_station combined with coastal_battery actually extends city range to 2', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    setTerrain(state, { q: 2, r: 0 }, 'plains');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeCity(state, 'player', { q: 2, r: 0 }, ['coastal_battery', 'radar_station']);
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('BUILDINGS still has an entry for coastal_battery and radar_station (sanity)', () => {
    expect(BUILDINGS.coastal_battery).toBeDefined();
    expect(BUILDINGS.radar_station).toBeDefined();
  });
});
