/**
 * Viewer-scoped military intel (#1334): what one civilization legitimately knows about the units and cities of the
 * civilizations it has met, built only from its own visibility and trusted last-seen snapshots.
 *
 * This is the single collection used by both the AI perception layer (`ai-perception.ts`) and the shared diplomatic
 * strength projection (`diplomatic-strength.ts`), so the human and AI paths cannot disagree about what is known.
 * It never reads a target's real roster: an unseen unit, a cargo unit, a concealed unit and a unit last seen beyond
 * the confidence-decay window are all invisible here by construction.
 */
import type { City, GameState, HexCoord, LastSeenHealthBand, LastSeenTilePresentation, Unit, UnitType } from '@/core/types';
import { isUnitConcealedFrom } from './concealment';
import { getVisibleUnitsForPlayer } from './espionage-stealth';
import { getVisibility } from './fog-of-war';
import { isTrustedObservedLastSeenTile } from './last-seen-presentation';
import { decayRememberedConfidence } from './actor-perception';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { canInspectUnitForViewer } from './viewer-intel';

/** A last-seen snapshot that passed the trust check (observed, finite turn and coordinates). */
export type TrustedLastSeenSnapshot = LastSeenTilePresentation & { observedTurn: number; source: 'observed' };

export type PerceptionConfidence = 'visible' | 'remembered' | 'rumored';

export interface PerceivedUnit {
  id: string;
  owner: string;
  type: UnitType | null;
  position: HexCoord | null;
  lastSeenTurn: number | null;
  confidence: PerceptionConfidence;
  healthBand: LastSeenHealthBand | null;
}

export interface PerceivedCity {
  id: string;
  owner: string;
  position: HexCoord | null;
  confidence: PerceptionConfidence;
  observedTurn: number | null;
  defense?: 'open' | 'fortified';
  hpBand?: LastSeenHealthBand;
}

export const HEALTH_BAND_MIDPOINTS: Record<LastSeenHealthBand, number> = {
  healthy: 85,
  damaged: 52,
  critical: 17,
};

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

function copyCoord(coord: HexCoord): HexCoord {
  return { q: coord.q, r: coord.r };
}

export function toHealthBand(health: number): LastSeenHealthBand {
  if (health >= 70) return 'healthy';
  if (health >= 30) return 'damaged';
  return 'critical';
}

/** Civilizations the actor has met: known civs, wars and treaty partners that still exist. */
export function getContactedCivIds(state: GameState, actorId: string): string[] {
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

/** Last-seen snapshots the actor may still rely on: trusted, not from the future, still inside the decay window, still fogged. */
export function getTrustedLastSeenSnapshots(
  state: GameState,
  actorId: string,
): Array<{ key: string; snapshot: TrustedLastSeenSnapshot }> {
  const actor = state.civilizations[actorId];
  if (!actor) return [];
  const result: Array<{ key: string; snapshot: TrustedLastSeenSnapshot }> = [];
  for (const [key, value] of Object.entries(actor.visibility.lastSeen ?? {})) {
    if (!isTrustedObservedLastSeenTile(value)) continue;
    const age = state.turn - value.observedTurn;
    if (age < 0 || decayRememberedConfidence(age) <= 0) continue;
    if (getVisibility(actor.visibility, value.coord) !== 'fog') continue;
    result.push({ key, snapshot: value });
  }
  return result;
}

/** Units the actor currently sees, then units it remembers (a visible unit is never overwritten by a memory). */
export function collectPerceivedUnits(
  state: GameState,
  actorId: string,
  relevantOwner: (ownerId: string) => boolean,
): PerceivedUnit[] {
  const unitsById = new Map<string, PerceivedUnit>();
  const viewerFacingUnits = getVisibleUnitsForPlayer(state.units, state, actorId);
  for (const unit of Object.values(viewerFacingUnits)) {
    if (
      !relevantOwner(unit.owner)
      || unit.transportId
      || !canInspectUnitForViewer(state, actorId, unit.id)
      || isUnitConcealedFrom(state, unit, actorId)
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
      healthBand: toHealthBand(unit.health),
    });
  }

  for (const { snapshot } of getTrustedLastSeenSnapshots(state, actorId)) {
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

  return [...unitsById.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Cities the actor knows about: remembered ones, overridden by cities it sees now. With `includeRumoredSeat`, a met
 * civilization with no known city gets a position-less rumored entry (the AI perception layer wants it; strength does not).
 */
export function collectPerceivedCities(
  state: GameState,
  actorId: string,
  contacted: readonly string[],
  options: { includeRumoredSeat: boolean },
): PerceivedCity[] {
  const actor = state.civilizations[actorId];
  if (!actor) return [];
  const contactedSet = new Set(contacted);
  const rememberedCities = new Map<string, PerceivedCity>();
  for (const { snapshot } of getTrustedLastSeenSnapshots(state, actorId)) {
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
        defense: snapshot.city.defense,
        hpBand: snapshot.city.hpBand,
      });
    }
  }

  const knownCities = [...rememberedCities.values()];
  for (const civId of contacted) {
    for (const cityId of state.civilizations[civId].cities) {
      const city: City | undefined = state.cities[cityId];
      if (!city || getVisibility(actor.visibility, city.position) !== 'visible') continue;
      const known: PerceivedCity = {
        id: city.id,
        owner: city.owner,
        position: copyCoord(city.position),
        confidence: 'visible',
        observedTurn: state.turn,
        defense: city.buildings.includes('walls') || city.buildings.includes('star_fort') ? 'fortified' : 'open',
        hpBand: toHealthBand(city.hp ?? 100),
      };
      const index = knownCities.findIndex(candidate => candidate.id === city.id);
      if (index >= 0) knownCities[index] = known;
      else knownCities.push(known);
    }
    if (options.includeRumoredSeat && !knownCities.some(city => city.owner === civId)) {
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
  return knownCities;
}

/** The actor's own units are not hidden from the actor. */
export function getOwnUnits(state: GameState, actorId: string): Unit[] {
  const actor = state.civilizations[actorId];
  if (!actor) return [];
  return actor.units
    .map(id => state.units[id])
    .filter((unit): unit is Unit => unit?.owner === actorId);
}
