import { calculateCoordinatedCityScience, DIMINISHING_RESEARCH_POLICY } from '@/systems/research-coordination-system';
import { requireResearchPacingScenario } from '@/systems/research-pacing-model';
import { BUILDINGS } from '@/systems/city-system';
import { TECH_TREE, getEraAdvancementFraction } from '@/systems/tech-definitions';

export const RESEARCH_SCENARIOS = {
  tall: { cityCounts: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5], infrastructureShare: 0.7 },
  standard: { cityCounts: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7], infrastructureShare: 0.6 },
  wide: { cityCounts: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26], infrastructureShare: 0.5 },
} as const;

export type ResearchScenarioName = keyof typeof RESEARCH_SCENARIOS | 'issue-917';
export type ResearchInfrastructureShare = 0.5 | 0.6 | 0.7;
export type ResearchPacingCostById = Readonly<Record<string, number>>;

export interface ResearchPacingScenarioOutput {
  scenario: ResearchScenarioName;
  era: number;
  infrastructureShare: ResearchInfrastructureShare;
  cityCount: number;
  cityScience: number[];
  grossScience: number;
  netScience: number;
  completedTechIds: string[];
  arrivalTurn: number;
}

export const ISSUE_917_RESEARCH_SCENARIO = {
  turn: 117,
  personalEra: 2,
  cityScience: [9, 8, 8, 8, 7, 5, 5, 4, 1, 1, 1, 1],
  coordinatedScience: 24,
} as const;

export function getResearchScenarioCityCount(
  scenario: keyof typeof RESEARCH_SCENARIOS,
  era: number,
): number {
  if (!Number.isInteger(era) || era < 1 || era > 13) {
    throw new RangeError(`Research scenario era must be 1 through 13; received ${era}.`);
  }
  return RESEARCH_SCENARIOS[scenario].cityCounts[era - 1];
}

function assertInfrastructureShare(value: number): asserts value is ResearchInfrastructureShare {
  if (value !== 0.5 && value !== 0.6 && value !== 0.7) {
    throw new RangeError(`Research scenario infrastructure share must be 0.5, 0.6, or 0.7; received ${value}.`);
  }
}

interface CachedFeedbackOutput {
  completedTechIds: string[];
  arrivalTurn: number;
  scienceBuildingYield: number;
}

const feedbackOutputCache = new Map<string, CachedFeedbackOutput>();

function getCostFingerprint(costById: ResearchPacingCostById | undefined): string {
  if (!costById) return 'live';
  return TECH_TREE.map(tech => `${tech.id}:${costById[tech.id] ?? tech.cost}`).join('|');
}

function buildCityScienceFromFeedback(
  era: number,
  cityCount: number,
  infrastructureShare: ResearchInfrastructureShare,
  scienceBuildingYield: number,
): number[] {
  const baseCityScience = Math.max(1, 1 + era + Math.floor(scienceBuildingYield * infrastructureShare));
  return Array.from({ length: cityCount }, (_, index) => {
    const maturityWeight = Math.max(0.35, 1.25 - (index / Math.max(1, cityCount - 1)) * 0.5);
    return Math.max(1, Math.floor(baseCityScience * maturityWeight));
  });
}

function getScenarioNetScience(
  scenario: keyof typeof RESEARCH_SCENARIOS,
  era: number,
  infrastructureShare: ResearchInfrastructureShare,
  scienceBuildingYield: number,
): number {
  const cityCount = getResearchScenarioCityCount(scenario, era);
  const cityScience = buildCityScienceFromFeedback(era, cityCount, infrastructureShare, scienceBuildingYield);
  return calculateCoordinatedCityScience(
    cityScience.map((science, index) => ({ cityId: `${scenario}-${String(index).padStart(2, '0')}`, science })),
    DIMINISHING_RESEARCH_POLICY,
  ).final;
}

function getCachedFeedbackOutput(
  scenario: keyof typeof RESEARCH_SCENARIOS,
  era: number,
  infrastructureShare: ResearchInfrastructureShare,
  costById?: ResearchPacingCostById,
): CachedFeedbackOutput {
  const key = `${scenario}:${era}:${infrastructureShare}:${getCostFingerprint(costById)}`;
  const cached = feedbackOutputCache.get(key);
  if (cached) return cached;
  const completedTechIds: string[] = [];
  const completed = new Set<string>();
  let arrivalTurn = 0;
  let scienceBuildingYield = 0;
  const techById = new Map(TECH_TREE.map(tech => [tech.id, tech]));

  const addPrerequisiteClosure = (techId: string, currentEra: number, visiting = new Set<string>()): void => {
    if (completed.has(techId)) return;
    if (visiting.has(techId)) throw new Error(`Research pacing scenario has a prerequisite cycle at ${techId}.`);
    const tech = techById.get(techId);
    if (!tech) throw new Error(`Research pacing scenario is missing technology ${techId}.`);
    if (tech.era > currentEra) throw new Error(`Research pacing scenario cannot use future-era prerequisite ${techId} in era ${currentEra}.`);
    const nextVisiting = new Set(visiting);
    nextVisiting.add(techId);
    for (const prerequisite of tech.prerequisites) addPrerequisiteClosure(prerequisite, currentEra, nextVisiting);

    const researchRate = getScenarioNetScience(scenario, currentEra, infrastructureShare, scienceBuildingYield);
    const cost = costById?.[tech.id] ?? tech.cost;
    if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Research pacing scenario has invalid cost for ${tech.id}.`);
    arrivalTurn += Math.ceil(cost / researchRate);
    completed.add(tech.id);
    completedTechIds.push(tech.id);
    scienceBuildingYield += (tech.unlocksBuildings ?? [])
      .map(id => BUILDINGS[id]?.yields.science ?? 0)
      .reduce((total, value) => total + value, 0);
  };

  for (let currentEra = 1; currentEra <= era; currentEra++) {
    const eraTechs = TECH_TREE
      .filter(tech => tech.era === currentEra && tech.countsForEraAdvancement !== false)
      .sort((left, right) => (costById?.[left.id] ?? left.cost) - (costById?.[right.id] ?? right.cost) || left.id.localeCompare(right.id));
    const required = Math.ceil(eraTechs.length * getEraAdvancementFraction(currentEra));
    for (const tech of eraTechs.slice(0, required)) addPrerequisiteClosure(tech.id, currentEra);
  }
  const output = {
    completedTechIds,
    arrivalTurn,
    scienceBuildingYield,
  };
  feedbackOutputCache.set(key, output);
  return output;
}

function buildCityScience(
  scenario: keyof typeof RESEARCH_SCENARIOS,
  era: number,
  cityCount: number,
  infrastructureShare: ResearchInfrastructureShare,
  costById?: ResearchPacingCostById,
): number[] {
  // This deliberately small laboratory routes a research arrival through each unlocked science
  // building before calculating the next era's rate. It therefore changes later output when
  // the route or infrastructure share changes, unlike the retired one-way per-era profile.
  const feedback = getCachedFeedbackOutput(scenario, era, infrastructureShare, costById);
  return buildCityScienceFromFeedback(era, cityCount, infrastructureShare, feedback.scienceBuildingYield);
}

export function buildResearchPacingScenario(input: {
  scenario: ResearchScenarioName;
  era: number;
  infrastructureShare: ResearchInfrastructureShare;
  costById?: ResearchPacingCostById;
}): ResearchPacingScenarioOutput {
  assertInfrastructureShare(input.infrastructureShare);
  requireResearchPacingScenario(input.era);

  if (input.scenario === 'issue-917') {
    if (input.era !== ISSUE_917_RESEARCH_SCENARIO.personalEra) {
      throw new RangeError('#917 research pacing scenario is authored only for personal era 2.');
    }
    return {
      scenario: input.scenario,
      era: input.era,
      infrastructureShare: input.infrastructureShare,
      cityCount: ISSUE_917_RESEARCH_SCENARIO.cityScience.length,
      cityScience: [...ISSUE_917_RESEARCH_SCENARIO.cityScience],
      grossScience: 58,
      netScience: ISSUE_917_RESEARCH_SCENARIO.coordinatedScience,
      completedTechIds: [],
      arrivalTurn: ISSUE_917_RESEARCH_SCENARIO.turn,
    };
  }

  const cityCount = getResearchScenarioCityCount(input.scenario, input.era);
  const cityScience = buildCityScience(input.scenario, input.era, cityCount, input.infrastructureShare, input.costById);
  const coordinated = calculateCoordinatedCityScience(
    cityScience.map((science, index) => ({ cityId: `${input.scenario}-${String(index).padStart(2, '0')}`, science })),
    DIMINISHING_RESEARCH_POLICY,
  );
  const feedback = getCachedFeedbackOutput(input.scenario, input.era, input.infrastructureShare, input.costById);

  return {
    scenario: input.scenario,
    era: input.era,
    infrastructureShare: input.infrastructureShare,
    cityCount,
    cityScience,
    grossScience: coordinated.gross,
    netScience: coordinated.final,
    completedTechIds: feedback.completedTechIds,
    arrivalTurn: feedback.arrivalTurn,
  };
}

export function getResearchScenarioOutputs(options: { costById?: ResearchPacingCostById } = {}): ResearchPacingScenarioOutput[] {
  return (Object.keys(RESEARCH_SCENARIOS) as Array<keyof typeof RESEARCH_SCENARIOS>)
    .flatMap(scenario => Array.from({ length: 13 }, (_, index) => {
      const era = index + 1;
      return buildResearchPacingScenario({
        scenario,
        era,
        infrastructureShare: RESEARCH_SCENARIOS[scenario].infrastructureShare,
        costById: options.costById,
      });
    }));
}

export function validateResearchPacingScenarios(): void {
  for (const output of getResearchScenarioOutputs()) {
    requireResearchPacingScenario(output.era);
    if (output.cityCount !== getResearchScenarioCityCount(output.scenario as keyof typeof RESEARCH_SCENARIOS, output.era)) {
      throw new Error(`Research scenario ${output.scenario} has a mismatched city count in era ${output.era}.`);
    }
    if (output.netScience <= 0 || output.netScience > output.grossScience) {
      throw new Error(`Research scenario ${output.scenario} has invalid science output in era ${output.era}.`);
    }
  }
}
