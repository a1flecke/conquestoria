// src/systems/faction-system.ts
// #1246: the faction turn — the orchestration. The pressure model, relief ladder, federalism policy and
// the Appease/Concede commands live in faction-pressure / faction-relief / faction-federalism /
// faction-commands (callers import those directly); this module composes them once per round and owns
// the unrest state machine. It is imported only by the round-phase that runs it.
import type { GameState, City, UnitType } from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator';
import { createUnit } from './unit-lifecycle';
import { REBEL_SPAWN_OFFSETS, filterLegalSpawnTiles, spawnNeighbours } from './unit-spawn-placement';
import { mapDistance } from './hex-utils';
import { createBreakawayFromCity } from './breakaway-system';
import { getCivHappinessFromResources } from './resource-acquisition-system';
import { resolveCivilizationEra } from './tech-definitions';
import { computeUnrestPressure, getContagionSpread } from './faction-pressure';
import {
  BREAKAWAY_REVOLT_TURNS,
  CONQUEST_UNREST_DURATION,
  REVOLT_UNREST_TURNS,
  UNREST_TRIGGER_PRESSURE,
  canGarrisonCity,
  createUnrestEvaluationContext,
} from './faction-unrest-model';

// --- Rebel spawning ---
//
// #1089: rebels are deliberately inert once spawned -- no per-turn AI, no movement, nothing in
// turn-manager.ts touches a 'rebels'-owned unit after this function creates it. They exist only
// as a siege obstacle the player must clear to resolve the revolt. This is an honest, staged
// deferral, not an oversight: giving rebels a real decision loop is a separably-sized feature
// (they have no movement path today at all), out of #1089's own scope. The intended future
// grammar (survive under-strength → hold position near the city once a minimum force is present
// → spread to a second pressured city if regional unrest supports it → potentially feed a future
// legitimacy/breakaway mechanic, which does not exist in this codebase) is written out in full in
// docs/superpowers/specs/2026-09-22-issue-1089-nonmajor-archetypes-design.md §6.

function spawnRebelUnits(city: City, state: GameState, seed: string): Pick<GameState, 'units' | 'idCounters'> {
  const rng = createRng(seed);
  const unitType: UnitType = city.population >= 4 ? 'swordsman' : 'warrior';
  const spawnCount = 1 + Math.floor(rng() * 2); // 1-2 rebels
  // Only tiles a rebel band could legally stand on: land it can enter, no camp/enclave/foreign
  // city, nobody already there. With none, the revolt starts without a band.
  const available = filterLegalSpawnTiles(
    state,
    { ownerId: 'rebels', unitType, stacking: 'empty-only' },
    spawnNeighbours(state, city.position, REBEL_SPAWN_OFFSETS),
  );

  let units = { ...state.units };
  const idCounters = { ...state.idCounters };
  for (let i = 0; i < spawnCount; i++) {
    if (available.length === 0) break;
    const index = Math.floor(rng() * available.length);
    const [pos] = available.splice(index, 1);
    if (!pos) continue;
    const rebel = createUnit(unitType, 'rebels', pos, idCounters);
    units = { ...units, [rebel.id]: rebel };
  }
  return { units, idCounters };
}

// --- Main faction tick ---

function clearEraOneUnrestForCity(state: GameState, cityId: string): GameState {
  const city = state.cities[cityId];
  if (!city || (city.unrestLevel === 0 && city.unrestTurns === 0 && city.spyUnrestBonus === 0)) return state;
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 },
    },
  };
}

export function processFactionTurn(state: GameState, bus: EventBus): GameState {
  const unrestContext = createUnrestEvaluationContext();
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
    if (resolveCivilizationEra(nextState.civilizations[city.owner]?.techState.completed ?? []) <= 1) {
      nextState = clearEraOneUnrestForCity(nextState, cityId);
      continue;
    }

    // Clear expired conquestTurn
    if (city.conquestTurn !== undefined &&
        (nextState.turn - city.conquestTurn) >= CONQUEST_UNREST_DURATION) {
      nextState = {
        ...nextState,
        cities: {
          ...nextState.cities,
          // #1338: a city that is no longer held by recent conquest must not retain
          // an Imperial Levy. Clearing the marker here (the authoritative state) is
          // what makes the levy's eligibility self-enforcing.
          [cityId]: { ...city, conquestTurn: undefined, levy: undefined, levyChangedTurn: undefined },
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
    const pressure = computeUnrestPressure(cityId, nextState, civHappiness[city.owner] ?? 0, unrestContext);
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
            ...spawnRebelUnits(updated, nextState, `revolt-${cityId}-${nextState.turn}`),
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
        u => u.owner === 'rebels' && mapDistance(nextState.map, u.position, city.position) <= 3,
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
