import type { UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';

export interface AIStrengthObservation {
  type: UnitType;
  health: number;
  experience: number;
  source: 'visible' | 'remembered';
  confidence: number;
  uncertainty: number;
  locallyAvailable: boolean;
  cargoOrCaptured: boolean;
}

export interface AIStrengthEstimateOptions {
  unknownReserveUpper?: number;
}

export interface MilitaryStrengthEstimate {
  exactVisible: number;
  remembered: number;
  uncertaintyLower: number;
  uncertaintyUpper: number;
  midpoint: number;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function observationBaseStrength(observation: AIStrengthObservation): number {
  const definition = UNIT_DEFINITIONS[observation.type];
  const health = clampUnitInterval(observation.health / 100);
  const experience = Math.min(clampNonNegative(observation.experience), 100);
  return definition.strength * health * (1 + experience / 500);
}

export function estimateMilitaryStrength(
  observations: readonly AIStrengthObservation[],
  options: AIStrengthEstimateOptions = {},
): MilitaryStrengthEstimate {
  let exactVisible = 0;
  let remembered = 0;
  let rememberedUncertainty = 0;

  for (const observation of observations) {
    if (
      observation.cargoOrCaptured
      || !observation.locallyAvailable
      || !hasAICombatRole(observation.type)
    ) {
      continue;
    }

    const base = observationBaseStrength(observation);
    if (observation.source === 'visible') {
      exactVisible += base;
      continue;
    }

    remembered += base * clampUnitInterval(observation.confidence);
    rememberedUncertainty += base * clampUnitInterval(observation.uncertainty);
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
  };
}

export function getMedianFrontlineStrengthForEra(era: number): number {
  const boundedEra = Number.isFinite(era) ? Math.max(1, Math.floor(era)) : 1;
  const strengths = TRAINABLE_UNITS
    .filter(entry => {
      const requiredEra = entry.techRequired
        ? TECH_TREE.find(tech => tech.id === entry.techRequired)?.era ?? 1
        : 1;
      const roles = getAIStrategicRoles(entry.type);
      return requiredEra <= boundedEra
        && (roles.includes('frontline') || roles.includes('capture'))
        && UNIT_DEFINITIONS[entry.type].strength > 0;
    })
    .map(entry => UNIT_DEFINITIONS[entry.type].strength)
    .sort((left, right) => left - right);

  if (strengths.length === 0) return 0;
  const middle = Math.floor(strengths.length / 2);
  return strengths.length % 2 === 0
    ? (strengths[middle - 1] + strengths[middle]) / 2
    : strengths[middle];
}
