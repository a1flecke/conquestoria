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
import { TECH_TREE, resolveCivilizationEra } from './tech-definitions';
import { BUILDINGS } from './city-system';
import { getForeignFaithPressure } from './religion-loyalty-system';
import { canConnectCityToCapitalByOwnedRoad, getCitiesConnectedToCapital } from './road-network';

// --- Thresholds ---
export const UNREST_TRIGGER_PRESSURE = 40;
export const REVOLT_UNREST_TURNS = 10;       // turns at unrest before revolt escalates (#552)
export const BREAKAWAY_REVOLT_TURNS = 10;    // turns at revolt before breakaway
export const CONQUEST_UNREST_DURATION = 15;  // turns until conquestTurn is cleared
const GOLD_APPEASE_COST_PER_POP = 15;

// Concede (ideological concession) is priced as a multiple of the Appease cost.
// The civics-discounted multiplier MUST stay > 1 so Concede always costs strictly
// more than Appease and the two stay a real choice (#918). See
// .claude/rules/game-balance.md "Unrest Instant-Action Costs (Appease vs Concede)".
export const CONCESSION_COST_MULTIPLIER = 2;
export const CONCESSION_COST_MULTIPLIER_CIVICS = 1.5;

// #919 MR2: the Era-2 administration-ladder nudge. One extra "free" city before
// empire overextension pressure starts, so a modest early empire that has not yet
// teched `magistracy` is not instantly in revolt. Slope (3) and cap
// (MAX_PRESSURE_EMPIRE) are unchanged — the Courthouse does the real work.
export const OVEREXTENSION_FREE_CITIES = 6;
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

export interface UnrestPressureRow {
  label: string;
  amount: number;
}

// #919 MR2 — administration ladder. Each entry emits zero or more NEGATIVE rows
// from the positive pressure rows already computed for a city. Later ladder rungs
// (roads-cut-distance, second seat of government, civil-service bureaucracy,
// governors) append an entry here — never a branch in getUnrestPressureBreakdown.
// `id` is source identity; buildingId and researchUnlockTechId declare how the
// source is acquired so AI production/research can score it generically. Keep every
// entry registered in .claude/rules/game-balance.md's "Unrest Relief Inventory" table.
export interface UnrestReliefSource {
  id: string;
  buildingId?: string;
  researchUnlockTechId?: string;
  targetRowLabels: readonly string[];
  isActive(city: City, state: GameState, context: UnrestEvaluationContext): boolean;
  reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[], context: UnrestEvaluationContext): UnrestPressureRow[];
  /** Optional AI planning gate for a source that is researched before it can be active. */
  isPotentiallyUseful?(city: City, state: GameState, context: UnrestEvaluationContext): boolean;
}

export interface UnrestEvaluationContext {
  connectedOwnedRoadCityIdsByCivId: Map<string, Set<string>>;
}

export function createUnrestEvaluationContext(): UnrestEvaluationContext {
  return { connectedOwnedRoadCityIdsByCivId: new Map() };
}

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

// #927 Rung 6 (final) — Federal Autonomy. The only rung that is a real
// tradeoff rather than a free lever: a persistent civ-wide toggle (not an
// automatic tech effect) trading substantial Empire overextension relief for
// a share of central gold income. Deliberately NOT named "autonomy" alone —
// AutonomyPostureId already exists in the unrelated Cyber/network-warfare
// system (src/core/autonomy-state.ts) and this must not collide with it.
// Targets ONLY Empire overextension (Bureaucracy's own row family) — every
// distance-pressure lever already belongs to Road & Post/Regional
// Capital/Railway Administration, and giving this rung a fourth distance
// lever would blur its identity as the ladder's last-resort city-count lever.
export const FEDERALISM_TECH_ID = 'decolonization';
export const FEDERALISM_REMITTANCE_LOSS_FRACTION = 0.2;

/**
 * Gold lost to reduced central remittance while Federal Autonomy is active,
 * applied once per civ per turn at the canonical revenue-aggregation point in
 * turn-manager.ts (same choke point as Vassalage tribute). `Math.max(0, ...)`
 * guards against a reverse subsidy: a civ already running a deficit never has
 * that deficit reduced by enabling the stance.
 */
export function getFederalismRemittanceLoss(totalGoldThisTurn: number): number {
  return Math.floor(Math.max(0, totalGoldThisTurn) * FEDERALISM_REMITTANCE_LOSS_FRACTION);
}
// One lock, not separate min-duration/cooldown timers, covers both
// directions: after ANY toggle the stance is locked for this many turns.
// This isn't closing a phase-order exploit (relief and remittance loss both
// read the identical field at the identical per-civ turn-processing pass, so
// there is no gap between them to abuse) — it exists purely to stop thrash
// (flipping every turn to chase a marginal edge).
export const FEDERALISM_LOCK_TURNS = 8;

export function getFederalismLockedUntilTurn(civ: { federalismChangedTurn?: number }): number {
  return civ.federalismChangedTurn === undefined ? -Infinity : civ.federalismChangedTurn + FEDERALISM_LOCK_TURNS;
}

export function canToggleFederalism(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  return state.turn >= getFederalismLockedUntilTurn(civ);
}

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

export interface FederalismToggleResult {
  success: boolean;
  state: GameState;
  message: string;
}

export function setFederalismStance(state: GameState, civId: string, enabled: boolean): FederalismToggleResult {
  const civ = state.civilizations[civId];
  if (!civ) return { success: false, state, message: 'Unknown civilization.' };
  if (!civ.techState.completed.includes(FEDERALISM_TECH_ID)) {
    return { success: false, state, message: 'Research Decolonization before enabling Federal Autonomy.' };
  }
  if ((civ.federalismEnabled ?? false) === enabled) {
    return {
      success: false, state,
      message: enabled ? 'Federal Autonomy is already active.' : 'Federal Autonomy is already disabled.',
    };
  }
  if (!canToggleFederalism(state, civId)) {
    return {
      success: false, state,
      message: `Federal Autonomy cannot be changed again until turn ${getFederalismLockedUntilTurn(civ)}.`,
    };
  }
  return {
    success: true,
    message: enabled
      ? 'Federal Autonomy enabled — administrative relief begins, at reduced central gold income.'
      : 'Federal Autonomy disabled — full central gold income resumes.',
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, federalismEnabled: enabled, federalismChangedTurn: state.turn },
      },
    },
  };
}

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

// Single source of truth for unrest pressure (#552): both computeUnrestPressure
// (consumed by AI/turn processing) and the city panel breakdown UI build from
// this row list, so they can never drift apart.
export function getUnrestPressureBreakdown(
  cityId: string,
  state: GameState,
  ownerHappiness = 0,
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
): UnrestPressureRow[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return [];

  const rows: UnrestPressureRow[] = [];

  // Empire overextension: each city over OVEREXTENSION_FREE_CITIES adds 3 pressure
  const cityCount = civ.cities.length;
  const overextension = Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - OVEREXTENSION_FREE_CITIES) * 3));
  if (overextension > 0) rows.push({ label: 'Empire overextension', amount: overextension });

  const capital = getCapitalCity(state, owner);
  if (capital && capital.id !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    const distancePressure = Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
    if (distancePressure > 0) rows.push({ label: 'Distance from capital', amount: distancePressure });
  }

  // Recent conquest — constitutional-law (#524 MR2) halves this row's amount.
  if (city.conquestTurn !== undefined) {
    const turnsSince = state.turn - city.conquestTurn;
    if (turnsSince < CONQUEST_UNREST_DURATION) {
      const hasConstitutionalLaw = civ.techState.completed.includes('constitutional-law');
      rows.push({ label: 'Recent conquest', amount: hasConstitutionalLaw ? 13 : 25 });
    }
  }

  // War weariness
  const atWarCount = civ.diplomacy.atWarWith?.length ?? 0;
  const warPressure = Math.min(MAX_PRESSURE_WAR, atWarCount * 8);
  if (warPressure > 0) rows.push({ label: 'War weariness', amount: warPressure });

  // Spy unrest bonus
  if (city.spyUnrestBonus > 0) rows.push({ label: 'Enemy espionage', amount: city.spyUnrestBonus });

  if (resolveCivilizationEra(civ.techState.completed) >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      const economyPressure = Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
      rows.push({ label: 'Economic strain', amount: economyPressure });
    }
  }

  if (ownerHappiness > 0) rows.push({ label: 'Luxury resources', amount: -ownerHappiness * 2 });

  const buildingHappiness = getCityHappinessFromBuildings(city);
  if (buildingHappiness > 0) rows.push({ label: 'Happiness buildings', amount: -buildingHappiness * 2 });

  // #591 MR4: Serenity boon — +1 happiness in cities following the owner's OWN faith.
  const cityFaith = state.cityFaith?.[cityId];
  if (cityFaith) {
    const religion = state.religions?.[cityFaith.religionId];
    if (religion && religion.ownerCivId === owner && religion.boon === 'serenity') {
      rows.push({ label: 'Religious serenity', amount: -2 });
    }
  }

  const contagion = getContagionSpread(cityId, state).pressure;
  if (contagion > 0) rows.push({ label: 'Uprising contagion', amount: contagion });

  // #593 MR6: human cities never enter the loyalty-flip track (see
  // isLoyaltyTrackEligible), but sustained foreign-faith dominance still costs them --
  // a flat +2 unrest pressure row instead of a literal defection risk.
  if (civ.isHuman && getForeignFaithPressure(state, cityId)) {
    rows.push({ label: 'Foreign faith pressure', amount: 2 });
  }

  // #919 MR2: administration-ladder relief rows (Courthouse today) subtract from the
  // positive rows built above. Table-driven — see UNREST_RELIEF_SOURCES.
  return [...rows, ...getUnrestReliefRows(city, state, rows, context)];
}

export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0, context: UnrestEvaluationContext = createUnrestEvaluationContext()): number {
  const rows = getUnrestPressureBreakdown(cityId, state, ownerHappiness, context);
  const sum = rows.reduce((total, row) => total + row.amount, 0);
  return Math.min(100, Math.max(0, sum));
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

// Building happiness (#552): the "build happiness improvements" advice in
// notification-routing.ts is only true because of this — see the four
// buildings with a `happiness` field in city-system.ts. Per-city, unlike
// luxury-resource happiness which is empire-wide.
export function getCityHappinessFromBuildings(city: City): number {
  let total = 0;
  for (const id of city.buildings) {
    total += BUILDINGS[id]?.happiness ?? 0;
  }
  return total;
}

export function getCityAppeaseCost(city: City): number {
  return city.population * GOLD_APPEASE_COST_PER_POP;
}

// Ideological concession (MR4, issue #354): a permanent resolution alongside gold
// appeasement. CONCESSION_COST_MULTIPLIER (2x) the appeasement cost, discounted to
// CONCESSION_COST_MULTIPLIER_CIVICS (1.5x) — but never to parity with Appease
// (#918) — if the owner has researched any civics-track tech of the *current* era
// (rewards civics investment without requiring a specific tech id, so future
// civics techs qualify automatically). The 1.5x floor keeps Concede strictly more
// expensive than Appease at every city size, so the two stay a real choice:
// Appease is the cheap, repeatable, once-per-turn stopgap that only suppresses;
// Concede is the pricier permanent fix (full clear + CONCESSION_IMMUNITY_TURNS of
// immunity to new unrest, including contagion).
export function getConcessionCost(state: GameState, city: City): number {
  const base = getCityAppeaseCost(city);
  const multiplier = hasCurrentEraCivicsTech(state, city.owner)
    ? CONCESSION_COST_MULTIPLIER_CIVICS
    : CONCESSION_COST_MULTIPLIER;
  return Math.round(base * multiplier);
}

function hasCurrentEraCivicsTech(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  const completed = new Set(civ.techState.completed);
  const civEra = resolveCivilizationEra(civ.techState.completed);
  return TECH_TREE.some(tech => tech.track === 'civics' && tech.era === civEra && completed.has(tech.id));
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
