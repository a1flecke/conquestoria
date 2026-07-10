import type { EventBus } from '@/core/event-bus';
import type {
  City,
  CombatResult,
  GameEvents,
  GameState,
  HexCoord,
  LegendaryWonderProject,
} from '@/core/types';
import { getUnitAttackProfile } from '@/systems/attack-targeting';
import { reconquerBreakawayCity } from '@/systems/breakaway-system';
import { BUILDINGS } from '@/systems/city-system';
import {
  buildTerritoryTileFlippedEvents,
  recalculateTerritory,
  type TerritoryRecalculationResult,
} from '@/systems/city-territory-system';
import { normalizeCityWorkAfterTerritoryChange } from '@/systems/city-work-system';
import { isAtWar, modifyRelationship } from '@/systems/diplomacy-system';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { buildMovePresentationByViewer } from '@/systems/viewer-event-presentation';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { handleCityLeftCiv } from '@/systems/crisis-system';

export type MajorCityCaptureDisposition = 'occupy' | 'raze';

export interface MajorCityCaptureResult {
  state: GameState;
  outcome: 'occupied' | 'razed';
  goldAwarded: number;
  territoryEvents: GameEvents['territory:tile-flipped'][];
  elimination?: {
    civId: string;
    eliminatedBy: string;
    removedUnitIds: string[];
    removedSpyIds: string[];
  };
}

export function emitMajorCityCaptureEvents(
  before: GameState,
  result: MajorCityCaptureResult,
  cityId: string,
  newOwnerId: string,
  previousOwnerId: string,
  bus: EventBus,
): void {
  for (const event of result.territoryEvents) {
    bus.emit('territory:tile-flipped', event);
  }
  if (result.outcome === 'occupied') {
    bus.emit('city:captured', {
      cityId,
      newOwner: newOwnerId,
      previousOwner: previousOwnerId,
    });
  }

  const previousOwnerBefore = before.civilizations[previousOwnerId];
  const previousOwnerAfter = result.state.civilizations[previousOwnerId];
  if (result.elimination) {
    bus.emit('civ:eliminated', {
      civId: result.elimination.civId,
      eliminatedBy: result.elimination.eliminatedBy,
    });
  } else if (
    previousOwnerBefore?.nearDefeat !== true
    && previousOwnerAfter?.nearDefeat === true
  ) {
    bus.emit('civ:near-defeat', { civId: previousOwnerId });
  }

  const capturingCivBefore = before.civilizations[newOwnerId];
  const capturingCivAfter = result.state.civilizations[newOwnerId];
  if (
    capturingCivBefore?.nearDefeat === true
    && capturingCivAfter?.nearDefeat !== true
    && (capturingCivAfter?.cities.length ?? 0) > 1
  ) {
    bus.emit('civ:recovered-from-near-defeat', { civId: newOwnerId });
  }
}

export interface PendingMajorCityCapture {
  attackerId: string;
  cityId: string;
  targetCoord: HexCoord;
  occupiedPopulation: number;
  razeGold: number;
}

export type MajorCityAssaultFailureReason =
  | 'missing-attacker'
  | 'missing-city'
  | 'wrong-owner'
  | 'friendly-city'
  | 'not-major-city'
  | 'not-at-war'
  | 'cannot-capture'
  | 'not-adjacent'
  | 'city-defended'
  | 'illegal-movement'
  | 'invalid-post-combat-advance';

export type BeginMajorCityAssaultResult =
  | {
      ok: true;
      state: GameState;
      pending: PendingMajorCityCapture;
    }
  | {
      ok: false;
      state: GameState;
      reason: MajorCityAssaultFailureReason;
    };

export interface BeginMajorCityAssaultOptions {
  actor: 'player' | 'ai';
  civId: string;
  bus?: EventBus;
  precedingCombat?: CombatResult;
}

function distanceForState(
  state: GameState,
  from: HexCoord,
  to: HexCoord,
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

export function canUnitOccupyCity(
  unit: GameState['units'][string],
): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  const profile = getUnitAttackProfile(unit.type);
  return (definition.domain ?? 'land') === 'land'
    && definition.strength > 0
    && profile.targets.includes('city')
    && profile.kind !== 'siege'
    && profile.kind !== 'bombard';
}

function assaultFailure(
  state: GameState,
  reason: MajorCityAssaultFailureReason,
): BeginMajorCityAssaultResult {
  return { ok: false, state, reason };
}

export function beginMajorCityAssault(
  state: GameState,
  attackerId: string,
  cityId: string,
  options: BeginMajorCityAssaultOptions,
): BeginMajorCityAssaultResult {
  const attacker = state.units[attackerId];
  if (!attacker) return assaultFailure(state, 'missing-attacker');
  if (attacker.owner !== options.civId) {
    return assaultFailure(state, 'wrong-owner');
  }
  const city = state.cities[cityId];
  if (!city) return assaultFailure(state, 'missing-city');
  if (city.owner === options.civId) {
    return assaultFailure(state, 'friendly-city');
  }
  if (!state.civilizations[city.owner]) {
    return assaultFailure(state, 'not-major-city');
  }
  const civilization = state.civilizations[options.civId];
  if (!civilization || !isAtWar(civilization.diplomacy, city.owner)) {
    return assaultFailure(state, 'not-at-war');
  }
  if (!canUnitOccupyCity(attacker)) {
    return assaultFailure(state, 'cannot-capture');
  }
  if (distanceForState(state, attacker.position, city.position) !== 1) {
    return assaultFailure(state, 'not-adjacent');
  }
  const occupancy = buildUnitOccupancy(state.units);
  if (getUnitIdsAtCoord(occupancy, city.position).length > 0) {
    return assaultFailure(state, 'city-defended');
  }

  let nextState = structuredClone(state);
  if (options.precedingCombat) {
    const combat = options.precedingCombat;
    const validAdvance = combat.attackerId === attackerId
      && combat.attackerSurvived
      && !combat.defenderSurvived
      && hexKey(combat.attackerPosition) === hexKey(attacker.position)
      && hexKey(combat.defenderPosition) === hexKey(city.position)
      && !Object.prototype.hasOwnProperty.call(
        state.units,
        combat.defenderId,
      )
      && attacker.hasActed;
    if (!validAdvance) {
      return assaultFailure(state, 'invalid-post-combat-advance');
    }
    const from = { ...attacker.position };
    const to = { ...city.position };
    nextState.units[attackerId] = {
      ...nextState.units[attackerId],
      position: to,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
    options.bus?.emit('unit:move', {
      unitId: attackerId,
      from,
      to,
      path: [from, to],
      presentationByViewer: buildMovePresentationByViewer(
        state,
        attacker,
        [from, to],
      ),
    });
  } else {
    if (attacker.hasActed || attacker.movementPointsLeft <= 0) {
      return assaultFailure(state, 'illegal-movement');
    }
    const movement = executeUnitMove(
      nextState,
      attackerId,
      city.position,
      {
        actor: options.actor,
        civId: options.civId,
        bus: options.bus,
        foreignCityEntryId: cityId,
      },
    );
    if (!movement.ok) {
      return assaultFailure(state, 'illegal-movement');
    }
    nextState.units[attackerId] = {
      ...nextState.units[attackerId],
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
  }

  return {
    ok: true,
    state: nextState,
    pending: {
      attackerId,
      cityId,
      targetCoord: { ...city.position },
      occupiedPopulation: Math.max(1, Math.floor(city.population / 2)),
      razeGold: computeRazeGold(city),
    },
  };
}

export function computeRazeGold(city: City): number {
  const salvage = city.buildings.reduce((sum, buildingId) => {
    const building = BUILDINGS[buildingId];
    return sum + Math.floor((building?.productionCost ?? 0) / 2);
  }, 0);
  return 10 + salvage;
}

function buildLegendaryWonderProjectKey(project: LegendaryWonderProject): string {
  return `${project.wonderId}:${project.ownerId}:${project.cityId}`;
}

function transferLegendaryWonderProjectsForCity(
  projects: GameState['legendaryWonderProjects'],
  cityId: string,
  newOwnerId: string,
): GameState['legendaryWonderProjects'] {
  const entries = Object.entries(projects ?? {});
  if (entries.length === 0) {
    return projects;
  }

  const updated = Object.fromEntries(entries.map(([projectId, project]) => {
    if (project.cityId !== cityId) {
      return [projectId, project];
    }

    const movedProject = { ...project, ownerId: newOwnerId };
    return [buildLegendaryWonderProjectKey(movedProject), movedProject];
  }));

  return updated;
}

function removeLegendaryWonderProjectsForCity(
  projects: GameState['legendaryWonderProjects'],
  cityId: string,
): GameState['legendaryWonderProjects'] {
  const entries = Object.entries(projects ?? {});
  if (entries.length === 0) {
    return projects;
  }

  return Object.fromEntries(entries.filter(([, project]) => project.cityId !== cityId));
}

function buildCaptureResult(
  beforeTerritoryState: GameState,
  territoryResult: TerritoryRecalculationResult,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
  capturedCityId?: string,
  elimination?: MajorCityCaptureResult['elimination'],
  bus?: EventBus,
): MajorCityCaptureResult {
  let postWorkState = capturedCityId
    ? normalizeCityWorkAfterTerritoryChange(territoryResult.state, capturedCityId).state
    : territoryResult.state;
  if (capturedCityId && bus) {
    postWorkState = handleCityLeftCiv(postWorkState, capturedCityId, bus);
  }
  return {
    state: postWorkState,
    outcome,
    goldAwarded,
    territoryEvents: buildTerritoryTileFlippedEvents(
      beforeTerritoryState,
      postWorkState,
      territoryResult.resolutions,
    ),
    elimination,
  };
}

function buildUnchangedCaptureResult(
  state: GameState,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
): MajorCityCaptureResult {
  return { state, outcome, goldAwarded, territoryEvents: [] };
}

export function resolveMajorCityCapture(
  state: GameState,
  cityId: string,
  newOwnerId: string,
  disposition: MajorCityCaptureDisposition,
  turn: number,
  bus?: EventBus,
): MajorCityCaptureResult {
  const city = state.cities[cityId];
  if (!city) {
    return buildUnchangedCaptureResult(state, 'razed', 0);
  }

  const previousOwnerId = city.owner;
  const previousOwner = state.civilizations[previousOwnerId];
  const capturingCiv = state.civilizations[newOwnerId];
  if (!capturingCiv || previousOwnerId === newOwnerId) {
    return buildUnchangedCaptureResult(state, 'razed', 0);
  }

  const forcedDisposition: MajorCityCaptureDisposition = disposition;

  if (forcedDisposition === 'occupy' && previousOwner?.breakaway?.originOwnerId === newOwnerId) {
    const reconquered = reconquerBreakawayCity(state, newOwnerId, previousOwnerId, cityId);
    const nextState = {
      ...reconquered,
      legendaryWonderProjects: transferLegendaryWonderProjectsForCity(
        reconquered.legendaryWonderProjects,
        cityId,
        newOwnerId,
      ),
    };
    const territoryResult = recalculateTerritory(nextState, {
      reason: 'capture',
      preserveCurrentHolderOnTie: true,
    });
    return buildCaptureResult(nextState, territoryResult, 'occupied', 0, cityId, undefined, bus);
  }

  if (forcedDisposition === 'occupy') {
    const occupiedCity: City = {
      ...city,
      owner: newOwnerId,
      population: Math.max(1, Math.floor(city.population / 2)),
      conquestTurn: turn,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
      occupation: {
        originalOwnerId: previousOwnerId,
        turnsRemaining: 10,
      },
    };

    const nextState: GameState = {
      ...state,
      cities: {
        ...state.cities,
        [cityId]: occupiedCity,
      },
      civilizations: {
        ...state.civilizations,
        ...(previousOwner ? {
          [previousOwnerId]: {
            ...previousOwner,
            cities: previousOwner.cities.filter(id => id !== cityId),
            // nearDefeat flag: true when previous owner now has ≤ 1 city
            // Used by audio system and handoff payload computation
            nearDefeat: previousOwner.cities.filter(id => id !== cityId).length <= 1,
          },
        } : {}),
        [newOwnerId]: {
          ...capturingCiv,
          cities: capturingCiv.cities.includes(cityId) ? capturingCiv.cities : [...capturingCiv.cities, cityId],
          // Clear nearDefeat flag when gaining a city
          nearDefeat: capturingCiv.cities.includes(cityId) ? capturingCiv.nearDefeat : false,
        },
      },
      legendaryWonderProjects: transferLegendaryWonderProjectsForCity(
        state.legendaryWonderProjects,
        cityId,
        newOwnerId,
      ),
    };
    const elimination = eliminateCivilization(nextState, previousOwnerId, newOwnerId);
    const stateAfterElimination = elimination.state;
    const territoryResult = recalculateTerritory(stateAfterElimination, {
      reason: 'capture',
      preserveCurrentHolderOnTie: true,
    });

    return buildCaptureResult(
      stateAfterElimination,
      territoryResult,
      'occupied',
      0,
      cityId,
      elimination.eliminated ? {
        civId: elimination.civId,
        eliminatedBy: elimination.eliminatedBy,
        removedUnitIds: elimination.removedUnitIds,
        removedSpyIds: elimination.removedSpyIds,
      } : undefined,
      bus,
    );
  }

  const goldAwarded = computeRazeGold(city);
  const nextCivilizations = {
    ...state.civilizations,
    ...(previousOwner ? {
      [previousOwnerId]: {
        ...previousOwner,
        cities: previousOwner.cities.filter(id => id !== cityId),
        diplomacy: modifyRelationship(previousOwner.diplomacy, newOwnerId, -40),
        // nearDefeat flag: true when previous owner now has ≤ 1 city (raze path)
        nearDefeat: previousOwner.cities.filter(id => id !== cityId).length <= 1,
      },
    } : {}),
    [newOwnerId]: {
      ...capturingCiv,
      gold: capturingCiv.gold + goldAwarded,
    },
  };

  const nextCities = { ...state.cities };
  delete nextCities[cityId];

  const nextState: GameState = {
    ...state,
    cities: nextCities,
    civilizations: nextCivilizations,
    legendaryWonderProjects: removeLegendaryWonderProjectsForCity(state.legendaryWonderProjects, cityId),
  };
  const elimination = eliminateCivilization(nextState, previousOwnerId, newOwnerId);
  const stateAfterElimination = elimination.state;
  const territoryResult = recalculateTerritory(stateAfterElimination, {
    reason: 'raze',
    preserveCurrentHolderOnTie: true,
  });

  return buildCaptureResult(
    stateAfterElimination,
    territoryResult,
    'razed',
    goldAwarded,
    cityId,
    elimination.eliminated ? {
      civId: elimination.civId,
      eliminatedBy: elimination.eliminatedBy,
      removedUnitIds: elimination.removedUnitIds,
      removedSpyIds: elimination.removedSpyIds,
    } : undefined,
    bus,
  );
}

export function transferCapturedCityOwnership(
  state: GameState,
  cityId: string,
  newOwnerId: string,
  turn: number,
): GameState {
  const city = state.cities[cityId];
  if (!city) {
    return state;
  }

  const previousOwnerId = city.owner;
  const previousOwner = state.civilizations[previousOwnerId];
  const capturingCiv = state.civilizations[newOwnerId];
  if (!capturingCiv || previousOwnerId === newOwnerId) {
    return state;
  }

  if (previousOwner?.breakaway?.originOwnerId === newOwnerId) {
    return recalculateTerritory(
      reconquerBreakawayCity(state, newOwnerId, previousOwnerId, cityId),
      { reason: 'capture', preserveCurrentHolderOnTie: true },
    ).state;
  }

  const nextState: GameState = {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        owner: newOwnerId,
        conquestTurn: turn,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      ...state.civilizations,
      ...(previousOwner ? {
        [previousOwnerId]: {
          ...previousOwner,
          cities: previousOwner.cities.filter(id => id !== cityId),
        },
      } : {}),
      [newOwnerId]: {
        ...capturingCiv,
        cities: capturingCiv.cities.includes(cityId) ? capturingCiv.cities : [...capturingCiv.cities, cityId],
      },
    },
  };
  const eliminatedState = eliminateCivilization(nextState, previousOwnerId, newOwnerId).state;
  return recalculateTerritory(eliminatedState, {
    reason: 'capture',
    preserveCurrentHolderOnTie: true,
  }).state;
}
