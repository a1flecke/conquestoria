import type { PacingBand, PacingMetadata, Tech, TrainableUnitEntry } from '@/core/types';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { getTerminalCombatUnitReasons } from '@/systems/combat-role-definitions';
import { TECH_TREE } from '@/systems/tech-definitions';
import { getFrontierPacingProfile, requireEraPacingProfile, type EraPacingProfile } from '@/systems/era-pacing-profiles';

export interface ResearchOutputProfile { name: string; outputPerTurn: number; }
export interface MetadataComplexityOptions { min?: number; max?: number; }
export interface ResearchCostScenario {
  standardNetScience: number;
  tallNetScience: number;
  wideNetScience: number;
}
export interface ResearchCostRecommendation {
  base: number;
  wideMinimum: number;
  tallMaximum: number;
  recommendedCost: number;
}
export const OPENING_SCIENCE_INVESTED_PROFILE: ResearchOutputProfile = { name: 'opening-science-invested', outputPerTurn: 2 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const researchOutputProfile = (profile: EraPacingProfile): ResearchOutputProfile => profile.era === 1
  ? { name: 'opening-baseline', outputPerTurn: profile.completionistSciencePerTurn }
  : { name: `era-${profile.era}-established`, outputPerTurn: profile.completionistSciencePerTurn };

/** Research scenarios are explicit authored-era contracts, not UI frontier fallbacks. */
export function requireResearchPacingScenario(era: number): ResearchOutputProfile {
  try {
    return researchOutputProfile(requireEraPacingProfile(era));
  } catch {
    throw new Error(`Missing research pacing scenario for authored era ${era}`);
  }
}

export function getResearchOutputProfileForEra(era: number): ResearchOutputProfile {
  return researchOutputProfile(getFrontierPacingProfile(era));
}

export function validateAuthoredResearchPacing(techs: readonly Tech[] = TECH_TREE): void {
  for (const tech of techs) requireResearchPacingScenario(tech.era);
}

function findTech(techId: string, techs: Tech[]): Tech | undefined { return techs.find(candidate => candidate.id === techId); }
export function isStarterPrerequisiteTech(tech: Tech): boolean {
  return tech.era === 1 && tech.prerequisites.length === 0 && resolveTechPacingBand(tech) === 'starter';
}
export function isFirstRealUnlockTech(tech: Tech, techs: Tech[] = TECH_TREE): boolean {
  if (tech.era > 2 || tech.prerequisites.length !== 1) return false;
  const prerequisite = findTech(tech.prerequisites[0], techs);
  return Boolean(prerequisite && isStarterPrerequisiteTech(prerequisite));
}
export function getResearchOutputProfileForTech(tech: Tech, techs: Tech[] = TECH_TREE): ResearchOutputProfile {
  if (isStarterPrerequisiteTech(tech) || isFirstRealUnlockTech(tech, techs)) return requireResearchPacingScenario(1);
  return requireResearchPacingScenario(tech.era <= 1 ? 2 : tech.era);
}
export function getRecommendedTechTurnWindow(tech: Tech, techs: Tech[] = TECH_TREE): { min: number; max: number } {
  if (tech.id === 'bronze-working') return { min: 9, max: 11 };
  if (isStarterPrerequisiteTech(tech)) return { min: 2, max: 5 };
  if (isFirstRealUnlockTech(tech, techs)) return { min: 8, max: 12 };
  const [min, max] = tech.era <= 1 ? RESEARCH_BAND_WINDOWS[resolveTechPacingBand(tech)].early : RESEARCH_BAND_WINDOWS[resolveTechPacingBand(tech)].late;
  return { min, max };
}
const RESEARCH_BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] }, core: { early: [3, 5], late: [4, 7] }, specialist: { early: [4, 6], late: [5, 8] }, infrastructure: { early: [5, 8], late: [6, 10] }, 'power-spike': { early: [6, 9], late: [7, 11] }, marquee: { early: [10, 12], late: [10, 16] },
};
function inferTechScope(tech: Tech): PacingMetadata['scope'] {
  const text = tech.unlocks.join(' ').toLowerCase();
  return text.includes('unit') || text.includes('warrior') || text.includes('swordsman') ? 'military' : text.includes('building') || text.includes('library') || text.includes('monument') ? 'city' : 'empire';
}
function metadataForTech(tech: Tech): PacingMetadata {
  return tech.pacing ?? { band: resolveTechPacingBand(tech), role: 'inferred', impact: 1, scope: inferTechScope(tech), snowball: 1, urgency: 1, situationality: 1, unlockBreadth: 1 };
}
export function getMetadataComplexityMultiplier(metadata: PacingMetadata, options: MetadataComplexityOptions = {}): number {
  const min = options.min ?? 0.75; const max = options.max ?? 1.35;
  const scope = metadata.scope === 'empire' ? 1.08 : metadata.scope === 'city' ? 0.96 : 1;
  return Number(clamp(scope * metadata.impact * (1 + ((metadata.snowball - 1) * .5)) * (1 + ((metadata.unlockBreadth - 1) * .4)) * clamp(1 - ((metadata.urgency - 1) * .25), .5, 1.25) * clamp(1 - ((metadata.situationality - 1) * .2), .5, 1.25), min, max).toFixed(2));
}
function roundRecommendedTechCost(cost: number): number { return cost < 20 ? Math.max(1, Math.round(cost)) : Math.max(5, Math.round(cost / 5) * 5); }
export function getRecommendedTechCost(tech: Tech, techs: Tech[] = TECH_TREE): number {
  const profile = getResearchOutputProfileForTech(tech, techs); const window = getRecommendedTechTurnWindow(tech, techs);
  return roundRecommendedTechCost(profile.outputPerTurn * Math.round((window.min + window.max) / 2) * getMetadataComplexityMultiplier(metadataForTech(tech)));
}

/** Rounds authored research costs without hiding an infeasible pacing policy. */
export function roundReadableResearchCost(cost: number): number {
  return roundRecommendedTechCost(cost);
}

export function recommendResearchCost(
  tech: Tech,
  scenario: ResearchCostScenario,
  techs: Tech[] = TECH_TREE,
): ResearchCostRecommendation {
  const window = getRecommendedTechTurnWindow(tech, techs);
  const multiplier = getMetadataComplexityMultiplier(metadataForTech(tech));
  const base = roundReadableResearchCost(scenario.standardNetScience * ((window.min + window.max) / 2) * multiplier);
  const wideMinimum = roundReadableResearchCost(
    scenario.wideNetScience * (resolveTechPacingBand(tech) === 'power-spike' || resolveTechPacingBand(tech) === 'marquee' ? 2 : 1) + 1,
  );
  const tallMaximum = roundReadableResearchCost(
    scenario.tallNetScience * Math.ceil(1.5 * window.max),
  );
  if (wideMinimum > tallMaximum) {
    throw new Error(`Infeasible research pacing policy for era ${tech.era} ${resolveTechPacingBand(tech)}: wide minimum ${wideMinimum} exceeds tall maximum ${tallMaximum}.`);
  }
  return {
    base,
    wideMinimum,
    tallMaximum,
    recommendedCost: roundReadableResearchCost(Math.min(tallMaximum, Math.max(wideMinimum, base))),
  };
}

export interface UnitUsefulLifetimeOptions {
  units?: readonly TrainableUnitEntry[];
  techs?: readonly Pick<Tech, 'id' | 'era' | 'pacing'>[];
  arrivalTurnByEra: ReadonlyMap<number, number>;
  terminalReasons?: Readonly<Record<string, string>>;
  domainTransitionReasons?: Readonly<Record<string, string>>;
}

/**
 * Reviews only declared successor edges. A same-era unit is never a substitute for a missing
 * `upgradesTo`, which keeps future roster additions from silently changing this audit.
 */
export function getUnitUsefulLifetimeWarnings(options: UnitUsefulLifetimeOptions): string[] {
  const units = options.units ?? TRAINABLE_UNITS;
  const techs = options.techs ?? TECH_TREE;
  const terminalReasons = options.terminalReasons ?? getTerminalCombatUnitReasons();
  const techEraById = new Map(techs.map(tech => [tech.id, tech.era]));
  const unitByType = new Map(units.map(unit => [unit.type, unit]));
  const warnings: string[] = [];

  for (const unit of units) {
    const terminalReason = terminalReasons[unit.type];
    if (!unit.upgradesTo) {
      // A unit with no retirement trigger is the current end of its chain. A unit that is
      // explicitly retired, however, must name its successor or a typed terminal exception.
      if (unit.obsoletedByTech && !terminalReason) warnings.push(`${unit.type} has no explicit upgrade or terminal reason.`);
      continue;
    }
    const successor = unitByType.get(unit.upgradesTo);
    if (!successor) {
      warnings.push(`${unit.type} upgradesTo missing unit ${unit.upgradesTo}.`);
      continue;
    }
    const sourceEra = techEraById.get(unit.techRequired ?? '') ?? 1;
    const successorEra = techEraById.get(successor.techRequired ?? '') ?? sourceEra;
    const sourceArrival = options.arrivalTurnByEra.get(sourceEra);
    const successorArrival = options.arrivalTurnByEra.get(successorEra);
    if (sourceArrival === undefined || successorArrival === undefined) {
      warnings.push(`${unit.type} is missing a scenario arrival for era ${sourceArrival === undefined ? sourceEra : successorEra}.`);
      continue;
    }
    if (options.domainTransitionReasons?.[unit.type]) continue;
    const sourceTech = techs.find(tech => tech.id === unit.techRequired);
    const sourceBand = sourceTech?.pacing?.band
      ?? (sourceTech && 'cost' in sourceTech && 'prerequisites' in sourceTech
        ? resolveTechPacingBand(sourceTech as Tech)
        : 'core');
    const buildTurns = Math.ceil(unit.cost / requireEraPacingProfile(sourceEra).productionPerTurn);
    const travelTurns = Math.max(1, Math.ceil(3 / Math.max(1, requireEraPacingProfile(sourceEra).productionPerTurn / 4)));
    const requiredTurns = sourceBand === 'marquee'
      ? Math.max(buildTurns * 3, buildTurns + travelTurns)
      : buildTurns * 2;
    const usefulTurns = successorArrival - sourceArrival;
    // The scenario contract pins era arrivals, not the order of sibling technologies within an
    // era. Treat a same-era upgrade as a separately reviewed intra-era pacing case instead of
    // fabricating a zero-turn lifetime from insufficiently granular scenario data.
    if (successorEra === sourceEra) continue;
    if (usefulTurns < requiredTurns) {
      warnings.push(`${unit.type} remains useful for ${usefulTurns} turns; needs ${requiredTurns}.`);
    }
  }

  return warnings.sort();
}
let chainedBuildingIdsCache: Set<string> | null = null;
function buildingChainsFrom(buildingId: string): boolean {
  chainedBuildingIdsCache ??= new Set(Object.values(BUILDINGS).filter(building => (building.requiresBuildings?.length ?? 0) > 0).flatMap(building => building.requiresBuildings ?? []));
  return chainedBuildingIdsCache.has(buildingId);
}
export function resolveEraRelativeCostBand(tech: Tech, techs: Tech[] = TECH_TREE): PacingBand {
  const peers = techs.filter(candidate => candidate.era === tech.era); const percentile = peers.length ? peers.filter(candidate => candidate.cost <= tech.cost).length / peers.length : 1; const prereqs = tech.prerequisites.length;
  if (tech.countsForEraAdvancement === false || (tech.unlocksUnits?.length ?? 0) > 0 || (prereqs >= 2 && percentile >= .85)) return 'marquee';
  if ((tech.unlocksBuildings ?? []).some(buildingChainsFrom) || (prereqs >= 2 && percentile >= .6)) return 'power-spike';
  if (prereqs >= 2 || percentile >= .6) return 'specialist'; if (percentile >= .35) return 'infrastructure'; return percentile >= .15 ? 'core' : 'starter';
}
export function resolveTechPacingBand(tech: Tech): PacingBand {
  if (tech.pacing) return tech.pacing.band;
  if (tech.era === 1 && tech.prerequisites.length === 0 && tech.cost <= 25) return 'starter';
  if (tech.era <= 4) { if (tech.prerequisites.length >= 2 && tech.cost >= 90) return 'power-spike'; if (tech.prerequisites.length >= 2 || tech.cost >= 80) return 'specialist'; if (tech.era >= 4 && tech.cost >= 70) return 'power-spike'; return tech.cost >= 55 ? 'infrastructure' : 'core'; }
  return resolveEraRelativeCostBand(tech, TECH_TREE);
}
