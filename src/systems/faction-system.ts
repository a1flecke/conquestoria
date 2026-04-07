// src/systems/faction-system.ts
import type { GameState, City, HexCoord, UnitType } from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator';
import { createUnit } from './unit-system';
import { hexDistance } from './hex-utils';

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
  return city.unrestLevel === 2;
}

// --- Rebel spawning ---

function spawnRebelUnits(city: City, state: GameState, seed: string): void {
  const rng = createRng(seed);
  const offsets: HexCoord[] = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  const unitType: UnitType = city.population >= 4 ? 'swordsman' : 'warrior';
  const spawnCount = 1 + Math.floor(rng() * 2); // 1-2 rebels

  for (let i = 0; i < spawnCount; i++) {
    const offset = offsets[Math.floor(rng() * offsets.length)];
    const pos: HexCoord = { q: city.position.q + offset.q, r: city.position.r + offset.r };
    const key = `${pos.q},${pos.r}`;
    if (!state.map.tiles[key]) continue; // off-map, skip
    const rebel = createUnit(unitType, 'rebels', pos);
    state.units[rebel.id] = rebel;
  }
}

// --- Main faction tick ---

export function processFactionTurn(state: GameState, bus: EventBus): GameState {
  for (const cityId of Object.keys(state.cities)) {
    const city = state.cities[cityId];
    if (!city) continue;

    // Clear expired conquestTurn
    if (city.conquestTurn !== undefined &&
        (state.turn - city.conquestTurn) >= CONQUEST_UNREST_DURATION) {
      state.cities[cityId] = { ...state.cities[cityId], conquestTurn: undefined };
    }

    const pressure = computeUnrestPressure(cityId, state);
    let updated = { ...state.cities[cityId] };

    if (updated.unrestLevel === 0) {
      if (pressure > UNREST_TRIGGER_PRESSURE) {
        updated = { ...updated, unrestLevel: 1, unrestTurns: 0 };
        state.cities[cityId] = updated;
        bus.emit('faction:unrest-started', { cityId, owner: city.owner });
      }
    } else if (updated.unrestLevel === 1) {
      const garrisoned = canGarrisonCity(cityId, state);
      if (pressure <= UNREST_TRIGGER_PRESSURE || garrisoned) {
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        state.cities[cityId] = updated;
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        updated = { ...updated, unrestTurns: updated.unrestTurns + 1 };
        if (updated.unrestTurns >= REVOLT_UNREST_TURNS) {
          updated = { ...updated, unrestLevel: 2, unrestTurns: 0 };
          state.cities[cityId] = updated;
          spawnRebelUnits(updated, state, `revolt-${cityId}-${state.turn}`);
          bus.emit('faction:revolt-started', { cityId, owner: city.owner });
        } else {
          state.cities[cityId] = updated;
        }
      }
    } else if (updated.unrestLevel === 2) {
      // Revolt: resolve when rebels nearby are defeated AND pressure drops or city garrisoned
      const nearbyRebels = Object.values(state.units).filter(
        u => u.owner === 'rebels' && hexDistance(u.position, city.position) <= 3,
      );
      if (nearbyRebels.length === 0 && pressure <= UNREST_TRIGGER_PRESSURE) {
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        state.cities[cityId] = updated;
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      }
    }
  }

  return state;
}
