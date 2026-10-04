// src/systems/faction-relief.ts
// #1246: the #919/#927 administration ladder — every relief amount and the UNREST_RELIEF_SOURCES table
// the pressure breakdown, the AI production valuation and the AI research pull all read generically.
// Depends on the model leaf and the federalism constants only; it never imports the pressure model, the
// commands or the turn orchestration.
import type { GameState, City } from '../core/types';
import { hexDistance } from './hex-utils';
import { getCapitalCity } from './capital-system';
import { canConnectCityToCapitalByOwnedRoad, getCitiesConnectedToCapital } from './road-network';
import {
  MAX_PRESSURE_DISTANCE,
  MAX_PRESSURE_EMPIRE,
  OVEREXTENSION_FREE_CITIES,
  createUnrestEvaluationContext,
  type UnrestEvaluationContext,
  type UnrestPressureRow,
  type UnrestReliefSource,
} from './faction-unrest-model';
import { FEDERALISM_TECH_ID } from './faction-federalism';

// Civ IV Courthouse: halves the distance-to-capital row and shaves a flat slice off
// the empire-overextension row, but a city that HAD sprawl pressure still pays at
// least COURTHOUSE_SPRAWL_FLOOR ("scale always costs something"), and the relief
// never exceeds the sprawl that actually exists.
export const COURTHOUSE_DISTANCE_RELIEF_FRACTION = 0.5;
export const COURTHOUSE_OVEREXTENSION_RELIEF = 3;
export const COURTHOUSE_SPRAWL_FLOOR = 2;

export function getCourthouseReliefAmount(positiveRows: UnrestPressureRow[]): number {
  const distanceRow = positiveRows.find(r => r.label === 'Distance from capital')?.amount ?? 0;
  const overextensionRow = positiveRows.find(r => r.label === 'Empire overextension')?.amount ?? 0;
  const rawSprawl = distanceRow + overextensionRow;
  const uncapped = Math.round(COURTHOUSE_DISTANCE_RELIEF_FRACTION * distanceRow)
    + Math.min(COURTHOUSE_OVEREXTENSION_RELIEF, overextensionRow);
  return Math.min(uncapped, Math.max(0, rawSprawl - COURTHOUSE_SPRAWL_FLOOR));
}

const COURTHOUSE_RELIEF: UnrestReliefSource = {
  id: 'courthouse',
  buildingId: 'courthouse',
  targetRowLabels: ['Distance from capital', 'Empire overextension'],
  isActive: city => city.buildings.includes('courthouse'),
  reliefRows: (_city, _state, positiveRows) => {
    const relief = getCourthouseReliefAmount(positiveRows);
    return relief === 0 ? [] : [{ label: 'Courthouse', amount: -relief }];
  },
};

const MILITARY_ADMINISTRATION_RELIEF: UnrestReliefSource = {
  id: 'military-administration', buildingId: 'military-administration', targetRowLabels: ['War weariness', 'Recent conquest'],
  isActive: city => city.buildings.includes('military-administration'),
  reliefRows: (_city, _state, rows) => {
    const war = rows.find(row => row.label === 'War weariness')?.amount ?? 0;
    const conquest = rows.find(row => row.label === 'Recent conquest')?.amount ?? 0;
    const relief = Math.min(8, Math.max(0, war - 4)) + Math.min(10, Math.max(0, conquest - 8));
    return relief > 0 ? [{ label: 'Military Administration', amount: -relief }] : [];
  },
};

function getOwnedRoadConnectedCities(
  state: GameState,
  civId: string,
  context: UnrestEvaluationContext,
): Set<string> {
  let connected = context.connectedOwnedRoadCityIdsByCivId.get(civId);
  if (!connected) {
    connected = getCitiesConnectedToCapital(state, civId, 'owned-road');
    context.connectedOwnedRoadCityIdsByCivId.set(civId, connected);
  }
  return connected;
}

function getRoadPostNetworkReliefAmount(city: City, rows: UnrestPressureRow[]): number {
  const distance = rows.find(row => row.label === 'Distance from capital')?.amount ?? 0;
  const overextension = rows.find(row => row.label === 'Empire overextension')?.amount ?? 0;
  const courthouse = city.buildings.includes('courthouse') ? getCourthouseReliefAmount(rows) : 0;
  return Math.min(Math.round(distance * 0.35), 6, Math.max(0, distance - 4), Math.max(0, distance + overextension - 2 - courthouse));
}

const ROAD_POST_NETWORK_RELIEF: UnrestReliefSource = {
  id: 'road-post-network',
  researchUnlockTechId: 'military-logistics',
  targetRowLabels: ['Distance from capital'],
  isActive: (city, state, context) => state.civilizations[city.owner]?.techState.completed.includes('military-logistics') === true
    && getOwnedRoadConnectedCities(state, city.owner, context).has(city.id),
  isPotentiallyUseful: (city, state, context) =>
    getOwnedRoadConnectedCities(state, city.owner, context).has(city.id)
    || canConnectCityToCapitalByOwnedRoad(state, city.owner, city.id),
  reliefRows: (city, _state, rows) => {
    const relief = getRoadPostNetworkReliefAmount(city, rows);
    return relief > 0 ? [{ label: 'Road & Post Network', amount: -relief }] : [];
  },
};

function getRegionalCapitalCity(state: GameState, civId: string): City | null {
  const record = state.builtNationalProjects?.[`${civId}:regional_capital`];
  const city = record?.civId === civId ? state.cities[record.cityId] : undefined;
  return city?.owner === civId && city.buildings.includes('regional_capital') ? city : null;
}

export function getRegionalCapitalReliefAmount(
  city: City,
  state: GameState,
  rows: UnrestPressureRow[],
  regionalCapital: City | null = getRegionalCapitalCity(state, city.owner),
): number {
  const capital = getCapitalCity(state, city.owner);
  const distance = rows.find(row => row.label === 'Distance from capital')?.amount ?? 0;
  const overextension = rows.find(row => row.label === 'Empire overextension')?.amount ?? 0;
  if (!capital || !regionalCapital || distance === 0) return 0;
  const nearestDistance = Math.min(hexDistance(city.position, capital.position), hexDistance(city.position, regionalCapital.position));
  const nearestPressure = Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (nearestDistance - 5) * 2));
  const rawSeatRelief = distance - nearestPressure;
  const courthouse = city.buildings.includes('courthouse') ? getCourthouseReliefAmount(rows) : 0;
  const road = state.civilizations[city.owner]?.techState.completed.includes('military-logistics')
    && getCitiesConnectedToCapital(state, city.owner, 'owned-road').has(city.id)
    ? getRoadPostNetworkReliefAmount(city, rows) : 0;
  return Math.min(rawSeatRelief, 10, Math.max(0, distance + overextension - 2 - courthouse - road));
}

const REGIONAL_CAPITAL_RELIEF: UnrestReliefSource = {
  id: 'regional-capital', buildingId: 'regional_capital', researchUnlockTechId: 'political-philosophy', targetRowLabels: ['Distance from capital'],
  isActive: (city, state) => getRegionalCapitalCity(state, city.owner) !== null,
  reliefRows: (city, state, rows) => {
    const relief = getRegionalCapitalReliefAmount(city, state, rows);
    return relief > 0 ? [{ label: 'Regional Capital administration', amount: -relief }] : [];
  },
};

// #927 Rung 4 — Bureaucracy. A pure research unlock (no building, no national
// project — avoids duplicating Courthouse or Regional Capital) that raises the
// empire's effective free-city allowance, i.e. how many cities it can administer
// before Empire overextension pressure starts biting as hard. Targets ONLY
// Empire overextension — never Distance from capital, war weariness, or recent
// conquest. Modeled as: recompute the base overextension formula with a larger
// free-city allowance, relief = the difference. Bounded by BUREAUCRACY_MAX_RELIEF
// and by the same COURTHOUSE_SPRAWL_FLOOR shared-residual convention Regional
// Capital already uses (treating Courthouse/Road-Post/Regional Capital's already-
// delivered relief as spent from the same D+O budget) so Courthouse + Bureaucracy
// together can never erase all overextension pressure from an extreme empire.
export const BUREAUCRACY_TECH_ID = 'separation-of-powers';
// +3 free cities (allowance 6 -> 9) matches the pacing-reference-economy 'wide'
// era 5-6 fixture (9 cities): a fully-invested wide empire (Courthouse + Bureaucracy)
// lands exactly on the shared 2-point residual floor rather than under- or
// over-shooting it (see the faction-system.test.ts "#927 Bureaucracy" stacking test).
export const BUREAUCRACY_FREE_CITY_BONUS = 3;
// 3 excess cities * 3 pressure/city — the natural ceiling of the formula below once
// both the real and hypothetical allowance curves saturate at MAX_PRESSURE_EMPIRE;
// kept explicit so a future slope/bonus change can't silently raise this past 9.
export const BUREAUCRACY_MAX_RELIEF = 9;

export function getBureaucracyReliefAmount(
  city: City,
  state: GameState,
  rows: UnrestPressureRow[],
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
  regionalCapital: City | null = getRegionalCapitalCity(state, city.owner),
): number {
  const civ = state.civilizations[city.owner];
  if (!civ) return 0;
  const distance = rows.find(row => row.label === 'Distance from capital')?.amount ?? 0;
  const overextension = rows.find(row => row.label === 'Empire overextension')?.amount ?? 0;
  if (overextension === 0) return 0;
  const hypotheticalOverextension = Math.min(
    MAX_PRESSURE_EMPIRE,
    Math.max(0, (civ.cities.length - (OVEREXTENSION_FREE_CITIES + BUREAUCRACY_FREE_CITY_BONUS)) * 3),
  );
  const rawRelief = overextension - hypotheticalOverextension;
  const courthouse = city.buildings.includes('courthouse') ? getCourthouseReliefAmount(rows) : 0;
  // Reuses the same per-evaluation connected-cities cache Road & Post Network
  // populates via getOwnedRoadConnectedCities, instead of re-running the capital
  // connectivity BFS a third time for this civ (Regional Capital's own formula
  // already runs it uncached; see game-balance.md's Bureaucracy row for context).
  const road = civ.techState.completed.includes('military-logistics')
    && getOwnedRoadConnectedCities(state, city.owner, context).has(city.id)
    ? getRoadPostNetworkReliefAmount(city, rows) : 0;
  const regionalCapitalRelief = regionalCapital ? getRegionalCapitalReliefAmount(city, state, rows, regionalCapital) : 0;
  const consumed = courthouse + road + regionalCapitalRelief;
  return Math.min(rawRelief, BUREAUCRACY_MAX_RELIEF, Math.max(0, distance + overextension - COURTHOUSE_SPRAWL_FLOOR - consumed));
}

const BUREAUCRACY_RELIEF: UnrestReliefSource = {
  id: 'bureaucracy', researchUnlockTechId: BUREAUCRACY_TECH_ID, targetRowLabels: ['Empire overextension'],
  isActive: (city, state) => state.civilizations[city.owner]?.techState.completed.includes(BUREAUCRACY_TECH_ID) === true,
  reliefRows: (city, state, rows, context) => {
    const relief = getBureaucracyReliefAmount(city, state, rows, context);
    return relief > 0 ? [{ label: 'Bureaucratic administration', amount: -relief }] : [];
  },
};

// #927 Rung 5 — Railway Administration. Deliberately NOT "Telegraph": the only
// real infrastructure this game has for compressed communication is Railway
// Expansion's road-upgrade (the same tech resolveTileHasRail already uses to
// decide whether an owned road tile renders as rail), so the row is named for
// what the code actually checks rather than inventing a separate telegraph/cable
// mechanic with no infrastructure requirement. Builds directly on Road & Post
// Network's own connectivity abstraction (getOwnedRoadConnectedCities) instead
// of a second graph/pathfinding implementation. Requires Military Logistics too
// (Road & Post Network's own gate) so Railway Administration is always a
// genuine upgrade ON TOP of an already-active Road & Post connection, never a
// substitute reachable through an unusual research order that skips it — matches
// "Telegraph/Rail answers: has industrial infrastructure further compressed
// administrative delay?" from the rung design. Targets ONLY Distance from
// capital, same family as Road & Post Network and Regional Capital.
export const RAILWAY_ADMINISTRATION_TECH_ID = 'railway-expansion';
// 0.2 * D capped at 4 — roughly half of Road & Post Network's own 0.35 fraction
// and 6 cap, since this is a smaller marginal compression layered on top of an
// already-active Road & Post connection, not a second independent network.
export const RAILWAY_ADMINISTRATION_DISTANCE_RELIEF_FRACTION = 0.2;
export const RAILWAY_ADMINISTRATION_MAX_RELIEF = 4;

function isRoadPostActive(city: City, state: GameState, context: UnrestEvaluationContext): boolean {
  const civ = state.civilizations[city.owner];
  return civ?.techState.completed.includes('military-logistics') === true
    && getOwnedRoadConnectedCities(state, city.owner, context).has(city.id);
}

export function getRailwayAdministrationReliefAmount(
  city: City,
  state: GameState,
  rows: UnrestPressureRow[],
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
  regionalCapital: City | null = getRegionalCapitalCity(state, city.owner),
): number {
  const civ = state.civilizations[city.owner];
  if (!civ) return 0;
  const distance = rows.find(row => row.label === 'Distance from capital')?.amount ?? 0;
  const overextension = rows.find(row => row.label === 'Empire overextension')?.amount ?? 0;
  if (distance === 0) return 0;
  const rawRelief = Math.min(Math.round(RAILWAY_ADMINISTRATION_DISTANCE_RELIEF_FRACTION * distance), RAILWAY_ADMINISTRATION_MAX_RELIEF);
  const courthouse = city.buildings.includes('courthouse') ? getCourthouseReliefAmount(rows) : 0;
  const road = isRoadPostActive(city, state, context) ? getRoadPostNetworkReliefAmount(city, rows) : 0;
  const regionalCapitalRelief = regionalCapital ? getRegionalCapitalReliefAmount(city, state, rows, regionalCapital) : 0;
  const bureaucracy = civ.techState.completed.includes(BUREAUCRACY_TECH_ID)
    ? getBureaucracyReliefAmount(city, state, rows, context, regionalCapital) : 0;
  const consumed = courthouse + road + regionalCapitalRelief + bureaucracy;
  return Math.min(rawRelief, Math.max(0, distance + overextension - COURTHOUSE_SPRAWL_FLOOR - consumed));
}

const RAILWAY_ADMINISTRATION_RELIEF: UnrestReliefSource = {
  id: 'railway-administration', researchUnlockTechId: RAILWAY_ADMINISTRATION_TECH_ID, targetRowLabels: ['Distance from capital'],
  isActive: (city, state, context) => state.civilizations[city.owner]?.techState.completed.includes(RAILWAY_ADMINISTRATION_TECH_ID) === true
    && isRoadPostActive(city, state, context),
  isPotentiallyUseful: (city, state, context) =>
    getOwnedRoadConnectedCities(state, city.owner, context).has(city.id)
    || canConnectCityToCapitalByOwnedRoad(state, city.owner, city.id),
  reliefRows: (city, state, rows, context) => {
    const relief = getRailwayAdministrationReliefAmount(city, state, rows, context);
    return relief > 0 ? [{ label: 'Railway Administration', amount: -relief }] : [];
  },
};

export function getFederalismReliefAmount(
  city: City,
  state: GameState,
  rows: UnrestPressureRow[],
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
  regionalCapital: City | null = getRegionalCapitalCity(state, city.owner),
): number {
  const civ = state.civilizations[city.owner];
  if (!civ) return 0;
  const distance = rows.find(row => row.label === 'Distance from capital')?.amount ?? 0;
  const overextension = rows.find(row => row.label === 'Empire overextension')?.amount ?? 0;
  if (overextension === 0) return 0;
  const courthouse = city.buildings.includes('courthouse') ? getCourthouseReliefAmount(rows) : 0;
  const road = isRoadPostActive(city, state, context) ? getRoadPostNetworkReliefAmount(city, rows) : 0;
  const regionalCapitalRelief = regionalCapital ? getRegionalCapitalReliefAmount(city, state, rows, regionalCapital) : 0;
  const bureaucracy = civ.techState.completed.includes(BUREAUCRACY_TECH_ID)
    ? getBureaucracyReliefAmount(city, state, rows, context, regionalCapital) : 0;
  const railway = civ.techState.completed.includes(RAILWAY_ADMINISTRATION_TECH_ID) && isRoadPostActive(city, state, context)
    ? getRailwayAdministrationReliefAmount(city, state, rows, context, regionalCapital) : 0;
  const consumed = courthouse + road + regionalCapitalRelief + bureaucracy + railway;
  const rawRelief = Math.max(0, overextension - bureaucracy);
  return Math.min(rawRelief, Math.max(0, distance + overextension - COURTHOUSE_SPRAWL_FLOOR - consumed));
}

const FEDERALISM_RELIEF: UnrestReliefSource = {
  id: 'federalism', researchUnlockTechId: FEDERALISM_TECH_ID, targetRowLabels: ['Empire overextension'],
  isActive: (city, state) => {
    const civ = state.civilizations[city.owner];
    // Defense-in-depth: setFederalismStance is the only normal path to
    // federalismEnabled=true and already gates on the tech, but this mirrors
    // every other source's own isActive tech check rather than relying solely
    // on the toggle function (matters for a malformed/hand-edited save).
    return civ?.federalismEnabled === true && civ.techState.completed.includes(FEDERALISM_TECH_ID);
  },
  reliefRows: (city, state, rows, context) => {
    const relief = getFederalismReliefAmount(city, state, rows, context);
    return relief > 0 ? [{ label: 'Federal Autonomy', amount: -relief }] : [];
  },
};

export const UNREST_RELIEF_SOURCES: UnrestReliefSource[] = [
  COURTHOUSE_RELIEF, MILITARY_ADMINISTRATION_RELIEF, ROAD_POST_NETWORK_RELIEF,
  REGIONAL_CAPITAL_RELIEF, BUREAUCRACY_RELIEF, RAILWAY_ADMINISTRATION_RELIEF, FEDERALISM_RELIEF,
];

export function getUnrestReliefRows(
  city: City,
  state: GameState,
  positiveRows: UnrestPressureRow[],
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
): UnrestPressureRow[] {
  return UNREST_RELIEF_SOURCES.flatMap(source =>
    source.isActive(city, state, context) ? source.reliefRows(city, state, positiveRows, context) : []);
}
