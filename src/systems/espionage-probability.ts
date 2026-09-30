import type { GameState, SpyMissionType, SpyPromotion, UnitType } from '@/core/types';
import {
  ESPIONAGE_MODIFIERS,
  ESPIONAGE_SUCCESS_CHANCE_MAX,
  ESPIONAGE_SUCCESS_CHANCE_MIN,
} from './espionage-modifier-definitions';
import { getCapitalCityId } from './capital-system';
import { getActiveNationalProjectsForCiv } from './national-project-system';
import {
  HANDLER_MISSIONS,
  INFILTRATION_BASE,
  INFILTRATOR_MISSIONS,
  MISSION_BASE_SUCCESS,
} from './espionage-catalog';

/**
 * Espionage probability queries (#1009): the success-chance formula, the
 * UI-facing modifier breakdown and the infiltration chance. Pure reads that
 * never mutate state and never draw from an RNG.
 */
export function getSpySuccessChance(
  spyExperience: number,
  counterIntel: number,
  missionType: SpyMissionType,
  promotion?: SpyPromotion,
  modifierDelta: number = 0,
): number {
  // counter_espionage is not a resolvable mission with a success roll -- see
  // MISSION_BASE_SUCCESS's comment. This function's parameter stays the full
  // SpyMissionType since real callers pass mission-type variables generically, but every
  // one of them draws from getAvailableMissions(), which excludes counter_espionage, so
  // this branch is never actually reached at runtime. 0 documents "not applicable"
  // explicitly rather than silently falling back to a fabricated number.
  if (missionType === 'counter_espionage') return 0;
  const base = MISSION_BASE_SUCCESS[missionType];
  const expBonus = spyExperience * 0.003;     // +0.3% per XP point, max +30%
  const ciPenalty = counterIntel * 0.004;      // -0.4% per CI point, max -40%

  let promotionBonus = 0;
  if (promotion === 'infiltrator' && INFILTRATOR_MISSIONS.has(missionType)) {
    promotionBonus = 0.10;
  } else if (promotion === 'handler' && HANDLER_MISSIONS.has(missionType)) {
    promotionBonus = 0.10;
  } else if (promotion === 'sentinel') {
    promotionBonus = 0.05;
  }

  return Math.max(
    ESPIONAGE_SUCCESS_CHANCE_MIN,
    Math.min(ESPIONAGE_SUCCESS_CHANCE_MAX, base + expBonus + promotionBonus - ciPenalty + modifierDelta),
  );
}

export interface EspionageModifierBreakdownPart {
  label: string;
  delta: number;
}

export interface EspionageModifierBreakdown {
  missionSuccessDelta: number;
  detectionDelta: number;
  parts: EspionageModifierBreakdownPart[];
}

// Offense rows apply when the acting civ owns the source; defense rows apply when the
// target civ owns the source. National-project rows fade-scale like other NP effects
// (see getActiveNationalProjectsForCiv / getNationalProjectMultiplier).
export function getEspionageModifierBreakdown(
  state: GameState,
  actingCivId: string,
  targetCivId: string,
  targetCityId: string,
): EspionageModifierBreakdown {
  const actingTechs = state.civilizations[actingCivId]?.techState.completed ?? [];
  const targetTechs = state.civilizations[targetCivId]?.techState.completed ?? [];
  const targetCity = state.cities[targetCityId];
  const targetIsCapital = getCapitalCityId(state, targetCivId) === targetCityId;
  const activeActingNationalProjects = getActiveNationalProjectsForCiv(state, actingCivId);

  let missionSuccessDelta = 0;
  let detectionDelta = 0;
  const parts: EspionageModifierBreakdownPart[] = [];

  for (const row of ESPIONAGE_MODIFIERS) {
    if (row.condition === 'targetIsCapital' && !targetIsCapital) continue;

    let active = false;
    let scaledDelta = row.delta;

    if (row.side === 'offense') {
      if (row.source.kind === 'tech') {
        active = actingTechs.includes(row.source.id);
      } else if (row.source.kind === 'nationalProject') {
        const project = activeActingNationalProjects.find(p => p.id === row.source.id);
        if (project) {
          active = true;
          scaledDelta = row.delta * project.fadeMultiplier;
        }
      }
    } else {
      if (row.source.kind === 'tech') {
        active = targetTechs.includes(row.source.id);
      } else if (row.source.kind === 'building') {
        active = targetCity?.buildings.includes(row.source.id) ?? false;
      }
    }

    if (!active) continue;
    if (row.effect === 'missionSuccess') missionSuccessDelta += scaledDelta;
    else detectionDelta += scaledDelta;
    parts.push({ label: row.label, delta: scaledDelta });
  }

  return { missionSuccessDelta, detectionDelta, parts };
}

export function getInfiltrationSuccessChance(
  unitType: UnitType,
  experience: number,
  cityCI: number,
): number {
  const base = INFILTRATION_BASE[unitType] ?? 0.50;
  return Math.max(0.10, Math.min(0.90, base + experience * 0.003 - cityCI * 0.004));
}
