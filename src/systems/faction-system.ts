// src/systems/faction-system.ts
import type { GameState, City, HexCoord, UnitType } from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator';
import { createUnit } from './unit-system';
import { hexDistance } from './hex-utils';
import { createBreakawayFromCity } from './breakaway-system';
import { getEconomyStatusForCiv } from './economy-system';
import { getCivHappinessFromResources } from './resource-acquisition-system';
import { getCapitalCity } from './capital-system';
import { getChallengeProfileForCiv } from '../core/opponent-challenge';
import { TECH_TREE } from './tech-definitions';

// --- Thresholds ---
const UNREST_TRIGGER_PRESSURE = 40;
export const REVOLT_UNREST_TURNS = 10;       // turns at unrest before revolt escalates (#552)
export const BREAKAWAY_REVOLT_TURNS = 10;    // turns at revolt before breakaway
const CONQUEST_UNREST_DURATION = 15;         // turns until conquestTurn is cleared
const GOLD_APPEASE_COST_PER_POP = 15;
export const CONCESSION_IMMUNITY_TURNS = 15; // uprising: turns of no-new-unrest after conceding

// Pressure caps per category
const MAX_PRESSURE_EMPIRE = 30;
const MAX_PRESSURE_DISTANCE = 20;
const MAX_PRESSURE_WAR = 24;
const MAX_PRESSURE_ECONOMY = 20;

// Uprising contagion (MR4, issue #354): a same-owner city in open revolt radiates
// unrest pressure to nearby cities. Garrisoning or concession immunity blocks the
// *receiving* city from being affected entirely (see getContagionSpread).
export const CONTAGION_GROUP_RANGE = 3;
const CONTAGION_PRESSURE_PER_NEIGHBOR = 8;
const MAX_PRESSURE_CONTAGION = 16;

// --- Pressure computation ---

export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return 0;

  let pressure = 0;

  // Empire overextension: each city over 5 adds 3 pressure
  const cityCount = civ.cities.length;
  pressure += Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - 5) * 3));

  const capital = getCapitalCity(state, owner);
  if (capital && capital.id !== cityId) {
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

  if (state.era >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      pressure += Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
    }
  }

  // Happiness from luxury resources reduces unrest pressure (2 pressure per happiness point)
  pressure -= ownerHappiness * 2;

  pressure += getContagionSpread(cityId, state).pressure;

  return Math.min(100, Math.max(0, pressure));
}

// --- Resolution helpers ---

export function canGarrisonCity(cityId: string, state: GameState): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return Object.values(state.units).some(
    u => u.owner === city.owner && hexDistance(u.position, city.position) === 0,
  );
}

// Uprising contagion (MR4): a same-owner city at unrestLevel 2 (revolt) within
// CONTAGION_GROUP_RANGE hexes radiates pressure to this city, scaled by the
// *owner's* per-civ challenge profile (resolveChallengeForCiv already resolves AI
// owners to the game-wide challenge). Skipped entirely — not just reduced — when
// this city is garrisoned or under concession immunity, matching the spec's
// "immune to incoming spread" contract.
export function getContagionSpread(
  cityId: string,
  state: GameState,
): { pressure: number; nearestCityId: string | null } {
  const city = state.cities[cityId];
  if (!city) return { pressure: 0, nearestCityId: null };
  if (canGarrisonCity(cityId, state)) return { pressure: 0, nearestCityId: null };
  if ((city.concessionImmunityUntilTurn ?? 0) > state.turn) return { pressure: 0, nearestCityId: null };

  const profile = getChallengeProfileForCiv(state, city.owner);
  let total = 0;
  let nearestCityId: string | null = null;
  let nearestDistance = Infinity;
  for (const [otherId, other] of Object.entries(state.cities)) {
    if (otherId === cityId || other.owner !== city.owner || other.unrestLevel !== 2) continue;
    const distance = hexDistance(city.position, other.position);
    if (distance > CONTAGION_GROUP_RANGE) continue;
    total += CONTAGION_PRESSURE_PER_NEIGHBOR * profile.crisisSeverityMultiplier;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCityId = otherId;
    }
  }
  return { pressure: Math.min(MAX_PRESSURE_CONTAGION, total), nearestCityId };
}

export function getCityAppeaseCost(city: City): number {
  return city.population * GOLD_APPEASE_COST_PER_POP;
}

// Ideological concession (MR4, issue #354): a permanent resolution alongside gold
// appeasement. 2x the appeasement cost, halved to 1x if the owner has researched
// any civics-track tech of the *current* era (rewards civics investment without
// requiring a specific tech id, so future civics techs qualify automatically).
export function getConcessionCost(state: GameState, city: City): number {
  const base = getCityAppeaseCost(city);
  return hasCurrentEraCivicsTech(state, city.owner) ? base : base * 2;
}

function hasCurrentEraCivicsTech(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  const completed = new Set(civ.techState.completed);
  return TECH_TREE.some(tech => tech.track === 'civics' && tech.era === state.era && completed.has(tech.id));
}

export function concedeToMovement(
  state: GameState,
  cityId: string,
  civId: string,
): { success: boolean; state: GameState; message: string } {
  const city = state.cities[cityId];
  if (!city || city.unrestLevel === 0) {
    return { success: false, state, message: 'This city has no unrest to concede to.' };
  }
  const cost = getConcessionCost(state, city);
  const civ = state.civilizations[civId];
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — conceding to ${city.name} costs ${cost}.` };
  }
  return {
    success: true,
    message: `${city.name} granted a charter for ${cost} gold — immune to unrest for ${CONCESSION_IMMUNITY_TURNS} turns.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: civ.gold - cost },
      },
      cities: {
        ...state.cities,
        [cityId]: {
          ...city,
          unrestLevel: 0,
          unrestTurns: 0,
          spyUnrestBonus: 0,
          concessionImmunityUntilTurn: state.turn + CONCESSION_IMMUNITY_TURNS,
        },
      },
    },
  };
}

export function appeaseFaction(
  state: GameState,
  cityId: string,
  civId: string,
): { success: boolean; state: GameState; message: string } {
  const city = state.cities[cityId];
  if (!city || city.unrestLevel === 0) {
    return { success: false, state, message: 'This city has no unrest to appease.' };
  }
  if (city.appeasedOnTurn === state.turn) {
    return { success: false, state, message: 'This city has already been appeased this turn.' };
  }
  const cost = getCityAppeaseCost(city);
  const civ = state.civilizations[civId];
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — appeasing ${city.name} costs ${cost}.` };
  }
  return {
    success: true,
    message: `${city.name} appeased for ${cost} gold.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: civ.gold - cost },
      },
      cities: {
        ...state.cities,
        [cityId]: {
          ...city,
          spyUnrestBonus: 0,
          unrestTurns: Math.max(0, city.unrestTurns - 2),
          unrestLevel: city.unrestLevel === 2 ? 1 : city.unrestLevel,
          appeasedOnTurn: state.turn,
        },
      },
    },
  };
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
    const rebel = createUnit(unitType, 'rebels', pos, state.idCounters);
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

  // Pre-compute happiness per civ to avoid O(cities²) tile scans inside the city loop
  const civHappiness: Record<string, number> = {};
  for (const [civId, civ] of Object.entries(nextState.civilizations)) {
    // Beast-slayer's feast (Hunt crisis, MR3): +2 happiness while feastUntilTurn is active.
    const feasting = (civ.feastUntilTurn ?? 0) > nextState.turn;
    civHappiness[civId] = getCivHappinessFromResources(nextState, civId) + (feasting ? 2 : 0);
  }

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
    const pressure = computeUnrestPressure(cityId, nextState, civHappiness[city.owner] ?? 0);
    let updated = { ...currentCity };

    if (updated.unrestLevel === 0) {
      const immune = (updated.concessionImmunityUntilTurn ?? 0) > nextState.turn;
      if (pressure > UNREST_TRIGGER_PRESSURE && !immune) {
        updated = { ...updated, unrestLevel: 1, unrestTurns: 0 };
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [cityId]: updated },
        };
        bus.emit('faction:unrest-started', { cityId, owner: city.owner });
        const contagion = getContagionSpread(cityId, nextState);
        if (contagion.pressure > 0 && contagion.nearestCityId) {
          bus.emit('faction:contagion-spread', {
            fromCityId: contagion.nearestCityId,
            toCityId: cityId,
            owner: city.owner,
          });
        }
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
        if (updated.unrestTurns >= BREAKAWAY_REVOLT_TURNS) {
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
