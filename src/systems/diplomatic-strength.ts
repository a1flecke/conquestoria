/**
 * Viewer-safe diplomatic military strength (#1334).
 *
 * One answer to "how strong might civilization B be, from what civilization A legitimately knows?", shared by every
 * diplomatic rule that needs it (the AI perception layer today, the tribute demand legality and consent next).
 * It is deliberately model-neutral: no AI role taxonomy, no difficulty input, no read of a target's real roster.
 *
 * - A target's strength comes only from `ViewerMilitaryIntel`: units the viewer currently sees plus remembered ones
 *   inside the confidence-decay window, plus an uncertainty reserve for units it has not seen.
 * - "No usable observation" is a distinct fact (`hasUsableObservation`), never a zero: a civilization the viewer has met
 *   but not seen fight is unknown, not weak.
 * - The viewer's own strength is its own authoritative units (nothing is hidden from oneself).
 */
import type { Unit, UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from './city-system';
import { TECH_TREE } from './tech-system';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { UNIT_CLASS_BY_TYPE, isMilitaryUnitType } from './unit-modifier-definitions';
import { decayRememberedConfidence } from './actor-perception';
import {
  HEALTH_BAND_MIDPOINTS,
  collectPerceivedCities,
  collectPerceivedUnits,
  getContactedCivIds,
  getOwnUnits,
  type PerceivedCity,
  type PerceivedUnit,
} from './viewer-military-intel';
import type { GameState } from '@/core/types';

export interface StrengthObservation {
  type: UnitType;
  health: number;
  experience: number;
  source: 'visible' | 'remembered';
  confidence: number;
  uncertainty: number;
  locallyAvailable: boolean;
  cargoOrCaptured: boolean;
}

export interface StrengthEstimateOptions {
  unknownReserveUpper?: number;
}

export interface MilitaryStrengthEstimate {
  exactVisible: number;
  remembered: number;
  uncertaintyLower: number;
  uncertaintyUpper: number;
  midpoint: number;
  /** How many observations contributed. Zero for another civilization means "unknown", not "no army". */
  observedUnitCount: number;
  /** True for the viewer's own units, or when at least one visible/remembered combat unit of the target contributed. */
  hasUsableObservation: boolean;
}

/** The slice of a viewer's knowledge strength needs. `MajorCivPerception` satisfies it structurally. */
export interface ViewerMilitaryIntel {
  actorId: string;
  turn: number;
  ownUnits: ReadonlyArray<Readonly<Pick<Unit, 'type' | 'health' | 'experience' | 'transportId'>>>;
  units: ReadonlyArray<PerceivedUnit>;
  knownCities: ReadonlyArray<Pick<PerceivedCity, 'owner' | 'confidence'>>;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * Whether a unit counts toward a civilization's military strength: it has combat strength, is neither civilian nor
 * spy, is not reconnaissance-only, and can actually target something (an observation balloon cannot).
 */
export function isMilitaryStrengthUnit(type: UnitType): boolean {
  const definition = UNIT_DEFINITIONS[type];
  if (!definition || definition.strength <= 0) return false;
  if (!isMilitaryUnitType(type)) return false;
  const classes = UNIT_CLASS_BY_TYPE[type] ?? [];
  if (classes.length > 0 && classes.every(unitClass => unitClass === 'recon')) return false;
  if (definition.attackProfile && definition.attackProfile.targets.length === 0) return false;
  return true;
}

function observationBaseStrength(observation: StrengthObservation): number {
  const definition = UNIT_DEFINITIONS[observation.type];
  const health = clampUnitInterval(observation.health / 100);
  const experience = Math.min(clampNonNegative(observation.experience), 100);
  return definition.strength * health * (1 + experience / 500);
}

export function estimateMilitaryStrength(
  observations: readonly StrengthObservation[],
  options: StrengthEstimateOptions = {},
): MilitaryStrengthEstimate {
  let exactVisible = 0;
  let remembered = 0;
  let rememberedUncertainty = 0;
  let observedUnitCount = 0;

  for (const observation of observations) {
    if (
      observation.cargoOrCaptured
      || !observation.locallyAvailable
      || !isMilitaryStrengthUnit(observation.type)
    ) {
      continue;
    }

    const base = observationBaseStrength(observation);
    if (observation.source === 'visible') {
      exactVisible += base;
      observedUnitCount += 1;
      continue;
    }

    const confidence = clampUnitInterval(observation.confidence);
    remembered += base * confidence;
    rememberedUncertainty += base * clampUnitInterval(observation.uncertainty);
    if (confidence > 0) observedUnitCount += 1;
  }

  const unknownReserveUpper = clampNonNegative(options.unknownReserveUpper ?? 0);
  const uncertaintyLower = exactVisible + Math.max(0, remembered - rememberedUncertainty);
  const uncertaintyUpper = exactVisible + remembered + rememberedUncertainty + unknownReserveUpper;

  return {
    exactVisible,
    remembered,
    uncertaintyLower,
    uncertaintyUpper,
    midpoint: (uncertaintyLower + uncertaintyUpper) / 2,
    observedUnitCount,
    hasUsableObservation: observedUnitCount > 0,
  };
}

/** Median strength of the trainable land combat units (siege excluded) an era can field: the size of one unseen unit. */
export function getMedianLandCombatantStrengthForEra(era: number): number {
  const boundedEra = Number.isFinite(era) ? Math.max(1, Math.floor(era)) : 1;
  const strengths = TRAINABLE_UNITS
    .filter(entry => {
      const requiredEra = entry.techRequired
        ? TECH_TREE.find(tech => tech.id === entry.techRequired)?.era ?? 1
        : 1;
      const definition = UNIT_DEFINITIONS[entry.type];
      const attackKind = definition.attackProfile?.kind;
      return requiredEra <= boundedEra
        && (definition.domain ?? 'land') === 'land'
        && attackKind !== 'siege'
        && attackKind !== 'bombard'
        && isMilitaryStrengthUnit(entry.type);
    })
    .map(entry => UNIT_DEFINITIONS[entry.type].strength)
    .sort((left, right) => left - right);

  if (strengths.length === 0) return 0;
  const middle = Math.floor(strengths.length / 2);
  return strengths.length % 2 === 0
    ? (strengths[middle - 1] + strengths[middle]) / 2
    : strengths[middle];
}

export function estimatePerceivedCivStrength(
  intel: ViewerMilitaryIntel,
  ownerId: string,
  actorEra: number,
): MilitaryStrengthEstimate {
  const observations: StrengthObservation[] = ownerId === intel.actorId
    ? intel.ownUnits.map(unit => ({
        type: unit.type,
        health: unit.health,
        experience: unit.experience,
        source: 'visible',
        confidence: 1,
        uncertainty: 0,
        locallyAvailable: !unit.transportId,
        cargoOrCaptured: Boolean(unit.transportId),
      }))
    : intel.units
        .filter(unit => unit.owner === ownerId && unit.type && unit.healthBand)
        .map(unit => {
          const confidence = unit.confidence === 'visible'
            ? 1
            : decayRememberedConfidence(intel.turn - (unit.lastSeenTurn ?? intel.turn));
          return {
            type: unit.type!,
            health: HEALTH_BAND_MIDPOINTS[unit.healthBand!],
            experience: 0,
            source: unit.confidence === 'visible' ? 'visible' : 'remembered',
            confidence,
            uncertainty: unit.confidence === 'visible' ? 0 : 1 - confidence,
            locallyAvailable: true,
            cargoOrCaptured: false,
          } satisfies StrengthObservation;
        });

  const median = getMedianLandCombatantStrengthForEra(actorEra);
  const knownCityCount = intel.knownCities
    .filter(city => city.owner === ownerId && city.confidence !== 'rumored')
    .length;
  const unknownReserveUpper = ownerId === intel.actorId
    ? 0
    : Math.max(0.5, knownCityCount) * median * 0.5;

  return estimateMilitaryStrength(observations, { unknownReserveUpper });
}

export function buildDiplomaticStrengthEstimates(
  intel: ViewerMilitaryIntel & { knownCivIds: readonly string[] },
  actorEra: number,
): {
  self: MilitaryStrengthEstimate;
  others: Record<string, MilitaryStrengthEstimate>;
} {
  return {
    self: estimatePerceivedCivStrength(intel, intel.actorId, actorEra),
    others: Object.fromEntries(
      intel.knownCivIds.map(civId => [
        civId,
        estimatePerceivedCivStrength(intel, civId, actorEra),
      ]),
    ),
  };
}

/**
 * A viewer's military intel without the rest of the AI perception: visible and remembered units of the civilizations it
 * has met, and the cities it knows. Build it once per diplomacy pass and reuse it for every candidate target.
 */
export function buildViewerMilitaryIntel(
  state: GameState,
  viewerId: string,
): ViewerMilitaryIntel & { knownCivIds: string[] } {
  const contacted = getContactedCivIds(state, viewerId);
  const contactedSet = new Set(contacted);
  return {
    actorId: viewerId,
    turn: state.turn,
    ownUnits: getOwnUnits(state, viewerId),
    units: collectPerceivedUnits(state, viewerId, ownerId => contactedSet.has(ownerId)),
    knownCities: collectPerceivedCities(state, viewerId, contacted, { includeRumoredSeat: false }),
    knownCivIds: contacted,
  };
}
