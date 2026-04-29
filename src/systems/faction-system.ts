// src/systems/faction-system.ts
import type { GameState, City, HexCoord, UnitType } from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator';
import { createUnit } from './unit-system';
import { hexDistance } from './hex-utils';
import { createBreakawayFromCity } from './breakaway-system';

// --- Thresholds ---
const UNREST_TRIGGER_PRESSURE = 40;
const REVOLT_UNREST_TURNS = 5;        // turns at unrest before revolt escalates
const CONQUEST_UNREST_DURATION = 15;  // turns until conquestTurn is cleared
const GOLD_APPEASE_COST_PER_POP = 15;

// Pressure caps per category
const MAX_PRESSURE_EMPIRE = 30;
const MAX_PRESSURE_DISTANCE = 20;
const MAX_PRESSURE_WAR = 24;

// --- Pressure computation ---

export function computeUnrestPressure(cityId: string, state: GameState): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return 0;

  let pressure = 0;

  // Empire overextension: each city over 5 adds 3 pressure
  const cityCount = civ.cities.length;
  pressure += Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - 5) * 3));

  // Distance from capital (first city in civ.cities list)
  const capitalId = civ.cities[0];
  const capital = capitalId ? state.cities[capitalId] : null;
  if (capital && capitalId !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    pressure += Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
  }

  // Recent conquest
  if (city.conquestTurn !== undefined) {
    const turnsSince = state.turn - city.conquestTurn;
    if (turnsSince < CONQUEST_UNREST_DURATION) {
      pressure += 25;
    }
  }

  // War weariness
  const atWarCount = civ.diplomacy.atWarWith?.length ?? 0;
  pressure += Math.min(MAX_PRESSURE_WAR, atWarCount * 8);

  // Spy unrest bonus
  pressure += city.spyUnrestBonus;

  return Math.min(100, pressure);
}

// --- Resolution helpers ---

export function canGarrisonCity(cityId: string, state: GameState): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return Object.values(state.units).some(
    u => u.owner === city.owner && hexDistance(u.position, city.position) === 0,
  );
}

export function getCityAppeaseCost(city: City): number {
  return city.population * GOLD_APPEASE_COST_PER_POP;
}

// --- Yield helpers (used by turn-manager) ---

export function getUnrestYieldMultiplier(city: City): number {
  if (city.unrestLevel === 2) return 0.5;
  if (city.unrestLevel === 1) return 0.75;
  return 1.0;
}

export function isCityProductionLocked(city: City): boolean {
  return city.unrestLevel === 2 || (city.productionDisabledTurns ?? 0) > 0;
}

// --- Rebel spawning ---

function spawnRebelUnits(city: City, state: GameState, seed: string): GameState['units'] {
  const rng = createRng(seed);
  const offsets: HexCoord[] = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  const unitType: UnitType = city.population >= 4 ? 'swordsman' : 'warrior';
  const spawnCount = 1 + Math.floor(rng() * 2); // 1-2 rebels
  const occupied = new Set(Object.values(state.units).map(unit => `${unit.position.q},${unit.position.r}`));
  const available = offsets
    .map(offset => ({ q: city.position.q + offset.q, r: city.position.r + offset.r }))
    .filter(pos => {
      const key = `${pos.q},${pos.r}`;
      return state.map.tiles[key] !== undefined && !occupied.has(key);
    });

  let units = { ...state.units };
  for (let i = 0; i < spawnCount; i++) {
    if (available.length === 0) break;
    const index = Math.floor(rng() * available.length);
    const [pos] = available.splice(index, 1);
    if (!pos) continue;
    const rebel = createUnit(unitType, 'rebels', pos);
    units = { ...units, [rebel.id]: rebel };
    occupied.add(`${pos.q},${pos.r}`);
  }
  return units;
}

// --- Main faction tick ---

function clearEraOneUnrest(state: GameState): GameState {
  let mutated = false;
  const cities = { ...state.cities };

  for (const [cityId, city] of Object.entries(state.cities)) {
    if (city.unrestLevel === 0 && city.unrestTurns === 0 && city.spyUnrestBonus === 0) {
      continue;
    }
    cities[cityId] = {
      ...city,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
    mutated = true;
  }

  return mutated ? { ...state, cities } : state;
}

export function processFactionTurn(state: GameState, bus: EventBus): GameState {
  if (state.era <= 1) {
    return clearEraOneUnrest(state);
  }

  let nextState = state;

  for (const cityId of Object.keys(nextState.cities)) {
    const city = nextState.cities[cityId];
    if (!city) continue;

    // Clear expired conquestTurn
    if (city.conquestTurn !== undefined &&
        (nextState.turn - city.conquestTurn) >= CONQUEST_UNREST_DURATION) {
      nextState = {
        ...nextState,
        cities: {
          ...nextState.cities,
          [cityId]: { ...city, conquestTurn: undefined },
        },
      };
    }

    const currentCity = nextState.cities[cityId];
    if (!currentCity) continue;
    const initialCriticalStatus = currentCity.unrestLevel === 1
      ? 'unrest'
      : currentCity.unrestLevel === 2
        ? 'revolt'
        : null;
    const pressure = computeUnrestPressure(cityId, nextState);
    let updated = { ...currentCity };

    if (updated.unrestLevel === 0) {
      if (pressure > UNREST_TRIGGER_PRESSURE) {
        updated = { ...updated, unrestLevel: 1, unrestTurns: 0 };
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [cityId]: updated },
        };
        bus.emit('faction:unrest-started', { cityId, owner: city.owner });
      }
    } else if (updated.unrestLevel === 1) {
      const garrisoned = canGarrisonCity(cityId, nextState);
      if (pressure <= UNREST_TRIGGER_PRESSURE || garrisoned) {
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [cityId]: updated },
        };
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        updated = { ...updated, unrestTurns: updated.unrestTurns + 1 };
        if (updated.unrestTurns >= REVOLT_UNREST_TURNS) {
          updated = { ...updated, unrestLevel: 2, unrestTurns: 0 };
          nextState = {
            ...nextState,
            cities: { ...nextState.cities, [cityId]: updated },
          };
          nextState = {
            ...nextState,
            units: spawnRebelUnits(updated, nextState, `revolt-${cityId}-${nextState.turn}`),
          };
          bus.emit('faction:revolt-started', { cityId, owner: city.owner });
        } else {
          nextState = {
            ...nextState,
            cities: { ...nextState.cities, [cityId]: updated },
          };
        }
      }
    } else if (updated.unrestLevel === 2) {
      // Revolt: resolve when rebels nearby are defeated AND pressure drops or city garrisoned
      const nearbyRebels = Object.values(nextState.units).filter(
        u => u.owner === 'rebels' && hexDistance(u.position, city.position) <= 3,
      );
      if (nearbyRebels.length === 0 && pressure <= UNREST_TRIGGER_PRESSURE) {
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [cityId]: updated },
        };
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        updated = { ...updated, unrestTurns: updated.unrestTurns + 1 };
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [cityId]: updated },
        };
        if (updated.unrestTurns >= 10) {
          nextState = createBreakawayFromCity(nextState, cityId, bus);
        }
      }
    }

    const finalCity = nextState.cities[cityId];
    const finalCriticalStatus = finalCity?.unrestLevel === 1
      ? 'unrest'
      : finalCity?.unrestLevel === 2
        ? 'revolt'
        : null;
    if (initialCriticalStatus && finalCriticalStatus === initialCriticalStatus && finalCity) {
      bus.emit('faction:critical-status', {
        cityId,
        owner: finalCity.owner,
        status: finalCriticalStatus,
      });
    }
  }

  return nextState;
}
