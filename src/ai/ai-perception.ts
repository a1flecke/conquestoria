import type {
  City,
  GameState,
  HexCoord,
  LastSeenHealthBand,
  ResourceType,
  Unit,
  UnitType,
} from '@/core/types';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { getVisibility, isForestConcealedUnit } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import {
  isTrustedObservedLastSeenTile,
  refreshLastSeenPresentationsForCiv,
} from '@/systems/last-seen-presentation';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { TECH_TREE } from '@/systems/tech-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { canInspectUnitForViewer } from '@/systems/viewer-intel';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { decayRememberedConfidence } from '@/systems/actor-perception';
import {
  estimateMilitaryStrength,
  getMedianFrontlineStrengthForEra,
  type AIStrengthObservation,
  type MilitaryStrengthEstimate,
} from './ai-strength';

export type AIPerceptionConfidence = 'visible' | 'remembered' | 'rumored';

export interface AIPerceivedUnit {
  id: string;
  owner: string;
  type: UnitType | null;
  position: HexCoord | null;
  lastSeenTurn: number | null;
  confidence: AIPerceptionConfidence;
  healthBand: LastSeenHealthBand | null;
}

export interface MajorCivPerception {
  actorId: string;
  turn: number;
  ownCities: ReadonlyArray<Readonly<City>>;
  ownUnits: ReadonlyArray<Readonly<Unit>>;
  knownCities: Array<{
    id: string;
    owner: string;
    position: HexCoord | null;
    confidence: AIPerceptionConfidence;
    observedTurn: number | null;
  }>;
  units: AIPerceivedUnit[];
  knownCivIds: string[];
  knownResources: Array<{
    resource: ResourceType;
    position: HexCoord;
    owner: string | null;
    confidence: 'visible' | 'remembered';
    observedTurn: number;
  }>;
  knownOpponentCapabilities: Record<string, {
    observedUnitTypes: UnitType[];
    inferredEraMin: number;
    inferredEraMax: number;
  }>;
}

const HEALTH_MIDPOINTS: Record<LastSeenHealthBand, number> = {
  healthy: 85,
  damaged: 52,
  critical: 17,
};

const KNOWN_RESOURCE_TYPES = new Set<string>(
  RESOURCE_DEFINITIONS.map(definition => definition.id),
);

function isKnownResourceType(resource: string | null): resource is ResourceType {
  return resource !== null && KNOWN_RESOURCE_TYPES.has(resource);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRememberedUnit(value: unknown): value is {
  id: string;
  owner: string;
  type: UnitType;
  healthBand: LastSeenHealthBand;
} {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.owner === 'string'
    && typeof value.type === 'string'
    && Object.prototype.hasOwnProperty.call(UNIT_DEFINITIONS, value.type)
    && (
      value.healthBand === 'healthy'
      || value.healthBand === 'damaged'
      || value.healthBand === 'critical'
    );
}

function knownCivIds(state: GameState, actorId: string): string[] {
  const actor = state.civilizations[actorId];
  if (!actor) return [];
  const ids = new Set(actor.knownCivilizations ?? []);
  for (const id of actor.diplomacy.atWarWith ?? []) ids.add(id);
  for (const treaty of actor.diplomacy.treaties ?? []) {
    if (treaty.civA === actorId) ids.add(treaty.civB);
    if (treaty.civB === actorId) ids.add(treaty.civA);
  }
  ids.delete(actorId);
  return [...ids]
    .filter(id => state.civilizations[id] !== undefined)
    .sort();
}

function copyCoord(coord: HexCoord): HexCoord {
  return { q: coord.q, r: coord.r };
}

function healthBand(health: number): LastSeenHealthBand {
  if (health >= 70) return 'healthy';
  if (health >= 30) return 'damaged';
  return 'critical';
}

function requiredEraForUnit(type: UnitType): number {
  const unlock = TECH_TREE.find(tech => tech.unlocksUnits?.includes(type));
  return unlock?.era ?? 1;
}

export function refreshMajorCivIntel(state: GameState, civId: string): GameState {
  const nextState = structuredClone(state);
  refreshLastSeenPresentationsForCiv(nextState, civId);
  return nextState;
}

export function buildMajorCivPerception(
  state: GameState,
  actorId: string,
): MajorCivPerception {
  const actor = state.civilizations[actorId];
  if (!actor) {
    throw new Error(`Cannot build perception for missing civilization: ${actorId}`);
  }

  const contacted = knownCivIds(state, actorId);
  const contactedSet = new Set(contacted);
  const relevantOwner = (ownerId: string) =>
    contactedSet.has(ownerId)
    || actor.diplomacy.atWarWith.includes(ownerId)
    || isAlwaysHostilePair(actorId, ownerId);
  const ownCities = actor.cities
    .map(id => state.cities[id])
    .filter((city): city is City => city?.owner === actorId)
    .map(city => structuredClone(city));
  const ownUnits = actor.units
    .map(id => state.units[id])
    .filter((unit): unit is Unit => unit?.owner === actorId)
    .map(unit => structuredClone(unit));

  const unitsById = new Map<string, AIPerceivedUnit>();
  const viewerFacingUnits = getVisibleUnitsForPlayer(state.units, state, actorId);
  for (const unit of Object.values(viewerFacingUnits)) {
    if (
      !relevantOwner(unit.owner)
      || unit.transportId
      || !canInspectUnitForViewer(state, actorId, unit.id)
      || isForestConcealedUnit(state, actorId, unit)
    ) {
      continue;
    }
    unitsById.set(unit.id, {
      id: unit.id,
      owner: unit.owner,
      type: unit.type,
      position: copyCoord(unit.position),
      lastSeenTurn: state.turn,
      confidence: 'visible',
      healthBand: healthBand(unit.health),
    });
  }

  const rememberedCities = new Map<string, MajorCivPerception['knownCities'][number]>();
  const rememberedResources = new Map<string, MajorCivPerception['knownResources'][number]>();
  for (const [key, value] of Object.entries(actor.visibility.lastSeen ?? {})) {
    if (!isTrustedObservedLastSeenTile(value)) continue;
    const snapshot = value;
    const age = state.turn - snapshot.observedTurn;
    if (age < 0 || decayRememberedConfidence(age) <= 0) continue;
    if (getVisibility(actor.visibility, snapshot.coord) !== 'fog') continue;

    if (
      isRecord(snapshot.city)
      && typeof snapshot.city.id === 'string'
      && typeof snapshot.city.owner === 'string'
      && contactedSet.has(snapshot.city.owner)
    ) {
      rememberedCities.set(snapshot.city.id, {
        id: snapshot.city.id,
        owner: snapshot.city.owner,
        position: copyCoord(snapshot.coord),
        confidence: 'remembered',
        observedTurn: snapshot.observedTurn,
      });
    }
    if (isKnownResourceType(snapshot.resource)) {
      rememberedResources.set(key, {
        resource: snapshot.resource,
        position: copyCoord(snapshot.coord),
        owner: snapshot.owner,
        confidence: 'remembered',
        observedTurn: snapshot.observedTurn,
      });
    }
    const rememberedUnits = Array.isArray(snapshot.units)
      ? snapshot.units.filter(isRememberedUnit)
      : [];
    for (const unit of rememberedUnits) {
      if (!relevantOwner(unit.owner) || unitsById.has(unit.id)) continue;
      unitsById.set(unit.id, {
        id: unit.id,
        owner: unit.owner,
        type: unit.type,
        position: copyCoord(snapshot.coord),
        lastSeenTurn: snapshot.observedTurn,
        confidence: 'remembered',
        healthBand: unit.healthBand,
      });
    }
  }

  const knownCities = [...rememberedCities.values()];
  for (const civId of contacted) {
    for (const cityId of state.civilizations[civId].cities) {
      const city = state.cities[cityId];
      if (!city || getVisibility(actor.visibility, city.position) !== 'visible') continue;
      const known = {
        id: city.id,
        owner: city.owner,
        position: copyCoord(city.position),
        confidence: 'visible' as const,
        observedTurn: state.turn,
      };
      const index = knownCities.findIndex(candidate => candidate.id === city.id);
      if (index >= 0) knownCities[index] = known;
      else knownCities.push(known);
    }
    if (!knownCities.some(city => city.owner === civId)) {
      knownCities.push({
        id: `rumor:${civId}:seat`,
        owner: civId,
        position: null,
        confidence: 'rumored',
        observedTurn: null,
      });
    }
  }
  knownCities.sort((left, right) => left.id.localeCompare(right.id));

  const knownResources = [...rememberedResources.values()];
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (
      !isKnownResourceType(tile.resource)
      || getVisibility(actor.visibility, tile.coord) !== 'visible'
    ) {
      continue;
    }
    const visible = {
      resource: tile.resource,
      position: copyCoord(tile.coord),
      owner: tile.owner,
      confidence: 'visible' as const,
      observedTurn: state.turn,
    };
    const index = knownResources.findIndex(resource => hexKey(resource.position) === key);
    if (index >= 0) knownResources[index] = visible;
    else knownResources.push(visible);
  }
  knownResources.sort((left, right) =>
    hexKey(left.position).localeCompare(hexKey(right.position)));

  const units = [...unitsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  const knownOpponentCapabilities: MajorCivPerception['knownOpponentCapabilities'] = {};
  for (const civId of contacted) {
    const observedUnitTypes = [...new Set(
      units.filter(unit => unit.owner === civId && unit.type !== null)
        .map(unit => unit.type!),
    )].sort();
    knownOpponentCapabilities[civId] = {
      observedUnitTypes,
      inferredEraMin: Math.max(1, ...observedUnitTypes.map(requiredEraForUnit)),
      inferredEraMax: Math.max(
        1,
        state.era,
        ...observedUnitTypes.map(requiredEraForUnit),
      ),
    };
  }

  return {
    actorId,
    turn: state.turn,
    ownCities,
    ownUnits,
    knownCities,
    units,
    knownCivIds: contacted,
    knownResources,
    knownOpponentCapabilities,
  };
}

export function estimatePerceivedCivStrength(
  perception: MajorCivPerception,
  ownerId: string,
  actorEra: number,
): MilitaryStrengthEstimate {
  const observations: AIStrengthObservation[] = ownerId === perception.actorId
    ? perception.ownUnits.map(unit => ({
        type: unit.type,
        health: unit.health,
        experience: unit.experience,
        source: 'visible',
        confidence: 1,
        uncertainty: 0,
        locallyAvailable: !unit.transportId,
        cargoOrCaptured: Boolean(unit.transportId),
      }))
    : perception.units
        .filter(unit => unit.owner === ownerId && unit.type && unit.healthBand)
        .map(unit => {
          const confidence = unit.confidence === 'visible'
            ? 1
            : decayRememberedConfidence(perception.turn - (unit.lastSeenTurn ?? perception.turn));
          return {
            type: unit.type!,
            health: HEALTH_MIDPOINTS[unit.healthBand!],
            experience: 0,
            source: unit.confidence === 'visible' ? 'visible' : 'remembered',
            confidence,
            uncertainty: unit.confidence === 'visible' ? 0 : 1 - confidence,
            locallyAvailable: true,
            cargoOrCaptured: false,
          };
        });

  const median = getMedianFrontlineStrengthForEra(actorEra);
  const knownCityCount = perception.knownCities
    .filter(city => city.owner === ownerId && city.confidence !== 'rumored')
    .length;
  const unknownReserveUpper = ownerId === perception.actorId
    ? 0
    : Math.max(0.5, knownCityCount) * median * 0.5;

  return estimateMilitaryStrength(observations, { unknownReserveUpper });
}

export function buildDiplomaticStrengthEstimates(
  perception: MajorCivPerception,
  actorEra: number,
): {
  self: MilitaryStrengthEstimate;
  others: Record<string, MilitaryStrengthEstimate>;
} {
  return {
    self: estimatePerceivedCivStrength(perception, perception.actorId, actorEra),
    others: Object.fromEntries(
      perception.knownCivIds.map(civId => [
        civId,
        estimatePerceivedCivStrength(perception, civId, actorEra),
      ]),
    ),
  };
}
