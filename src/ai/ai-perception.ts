import type {
  City,
  GameState,
  HexCoord,
  ResourceType,
  Unit,
  UnitType,
} from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { getUnitUnlockTech } from '@/systems/tech-unlock-index';
import {
  collectPerceivedCities,
  collectPerceivedUnits,
  getContactedCivIds,
  getTrustedLastSeenSnapshots,
  type PerceivedCity,
  type PerceivedUnit,
  type PerceptionConfidence,
} from '@/systems/viewer-military-intel';
import { getOwnHuntFoeUnitIds, isAIHostileOwner } from './ai-hostility';

/** #1334: the unit/city collection and its confidence vocabulary live in `src/systems/viewer-military-intel.ts`. */
export type AIPerceptionConfidence = PerceptionConfidence;
export type AIPerceivedUnit = PerceivedUnit;

export interface MajorCivPerception {
  actorId: string;
  turn: number;
  ownCities: ReadonlyArray<Readonly<City>>;
  ownUnits: ReadonlyArray<Readonly<Unit>>;
  knownCities: PerceivedCity[];
  units: AIPerceivedUnit[];
  cityStateIntel: { cities: PerceivedCity[]; units: AIPerceivedUnit[] };
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

const KNOWN_RESOURCE_TYPES = new Set<string>(
  RESOURCE_DEFINITIONS.map(definition => definition.id),
);

function isKnownResourceType(resource: string | null): resource is ResourceType {
  return resource !== null && KNOWN_RESOURCE_TYPES.has(resource);
}

function copyCoord(coord: HexCoord): HexCoord {
  return { q: coord.q, r: coord.r };
}

function requiredEraForUnit(type: UnitType): number {
  // #1604: `TECH_TREE.find(tech => tech.unlocksUnits?.includes(type))` scanned all 400 technologies per perceived
  // unit type. The memoized reverse index keeps `TECH_TREE`'s first-match order and costs one lookup.
  return getUnitUnlockTech(type)?.era ?? 1;
}

export function refreshMajorCivIntel(state: GameState, civId: string): GameState {
  // #1330: `refreshLastSeenPresentationsForCiv` is pure -- it returns a new state
  // and never mutates its input (every other caller invokes it with no preceding
  // clone). The whole-state defensive clone that used to wrap it was therefore
  // discarded work: one redundant whole-GameState clone per AI civ per round.
  return refreshLastSeenPresentationsForCiv(state, civId);
}

export function buildMajorCivPerception(
  state: GameState,
  actorId: string,
): MajorCivPerception {
  const actor = state.civilizations[actorId];
  if (!actor) {
    throw new Error(`Cannot build perception for missing civilization: ${actorId}`);
  }

  const contacted = getContactedCivIds(state, actorId);
  const contactedSet = new Set(contacted);
  const observedCities = collectPerceivedCities(state, actorId, contacted, {
    includeRumoredSeat: true,
    includeObservedMinorCities: true,
  });
  const cityStateCities = observedCities.filter(city => classifyOwner(city.owner) === 'minor');
  const knownCityStateIds = new Set(cityStateCities.map(city => city.owner));
  const knownCities = observedCities.filter(city => classifyOwner(city.owner) !== 'minor');
  // The foe of a hunt aimed at this civ may be a beast the AI otherwise ignores; it must still be seen,
  // or a plan against it could never confirm its target.
  const huntFoeOwners = new Set([...getOwnHuntFoeUnitIds(state, actorId)].map(id => state.units[id]?.owner).filter(Boolean));
  const relevantOwner = (ownerId: string) =>
    contactedSet.has(ownerId)
    || actor.diplomacy.atWarWith.includes(ownerId)
    || isAIHostileOwner(state, actorId, ownerId)
    || huntFoeOwners.has(ownerId);
  const ownCities = actor.cities
    .map(id => state.cities[id])
    .filter((city): city is City => city?.owner === actorId)
    .map(city => structuredClone(city));
  const ownUnits = actor.units
    .map(id => state.units[id])
    .filter((unit): unit is Unit => unit?.owner === actorId)
    .map(unit => structuredClone(unit));

  // #1334: units and cities come from the shared viewer-scoped collection.
  // An observed city-state can contribute visible and remembered defenders to its capture forecast.
  const observedUnits = collectPerceivedUnits(state, actorId, ownerId =>
    relevantOwner(ownerId) || knownCityStateIds.has(ownerId));
  const units = observedUnits.filter(unit => relevantOwner(unit.owner));

  const rememberedResources = new Map<string, MajorCivPerception['knownResources'][number]>();
  for (const { key, snapshot } of getTrustedLastSeenSnapshots(state, actorId)) {
    if (isKnownResourceType(snapshot.resource)) {
      rememberedResources.set(key, {
        resource: snapshot.resource,
        position: copyCoord(snapshot.coord),
        owner: snapshot.owner,
        confidence: 'remembered',
        observedTurn: snapshot.observedTurn,
      });
    }
  }

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
    cityStateIntel: {
      cities: cityStateCities,
      units: observedUnits.filter(unit => knownCityStateIds.has(unit.owner)),
    },
    knownCivIds: contacted,
    knownResources,
    knownOpponentCapabilities,
  };
}
