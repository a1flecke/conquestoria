import type { PacingBand } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  getRecommendedTechTurnWindow,
  getUnitUsefulLifetimeWarnings,
  recommendResearchCost,
  resolveTechPacingBand,
} from '@/systems/research-pacing-model';
import {
  buildResearchPacingScenario,
  getResearchScenarioOutputs,
  type ResearchPacingScenarioOutput,
} from '../tests/systems/helpers/research-pacing-scenarios';

export interface ResearchPacingEraReport {
  era: number;
  bands: Record<PacingBand, number>;
  scenarios: Record<'tall' | 'standard' | 'wide', { grossScience: number; netScience: number }>;
  costPercentiles: { currentP50: number; currentP90: number; proposedP50: number; proposedP90: number };
  etaPercentiles: { standardP50: number; tallP90: number; wideMinimum: number };
  oneTurnCurrentFrontierCount: number;
  adjacentEraRatio: number;
}

export interface ResearchPacingReport {
  eras: ResearchPacingEraReport[];
  failures: string[];
  changedCostIds: string[];
  unitUsefulLifetimeWarnings: string[];
}

export interface ResearchPacingReportOptions {
  proposedCosts?: boolean;
}

const PACING_BANDS: readonly PacingBand[] = ['starter', 'core', 'specialist', 'infrastructure', 'power-spike', 'marquee'];

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function eta(cost: number, science: number): number {
  return science <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(cost / science);
}

function normalizedMedianEta(techs: readonly typeof TECH_TREE[number][], costs: ReadonlyMap<string, number>, science: number): number {
  return percentile(techs.map(tech => {
    const window = getRecommendedTechTurnWindow(tech);
    return eta(costs.get(tech.id)!, science) / ((window.min + window.max) / 2);
  }), 0.5);
}

function scenarioByEra(outputs: readonly ResearchPacingScenarioOutput[], era: number, scenario: 'tall' | 'standard' | 'wide'): ResearchPacingScenarioOutput {
  const output = outputs.find(candidate => candidate.era === era && candidate.scenario === scenario);
  if (!output) throw new Error(`Missing ${scenario} research pacing scenario for authored era ${era}`);
  return output;
}

function currentCostFor(techId: string): number {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  if (!tech) throw new Error(`Missing technology ${techId}`);
  return tech.cost;
}

function proposedCostFor(techId: string, outputs: readonly ResearchPacingScenarioOutput[]): number {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  if (!tech) throw new Error(`Missing technology ${techId}`);
  const standard = scenarioByEra(outputs, tech.era, 'standard');
  const tall = scenarioByEra(outputs, tech.era, 'tall');
  const wide = scenarioByEra(outputs, tech.era, 'wide');
  return recommendResearchCost(tech, {
    standardNetScience: standard.netScience,
    tallNetScience: tall.netScience,
    wideNetScience: wide.netScience,
  }).recommendedCost;
}

export function getProposedResearchCostById(): Readonly<Record<string, number>> {
  const outputs = getResearchScenarioOutputs();
  return Object.freeze(Object.fromEntries(TECH_TREE.map(tech => [tech.id, proposedCostFor(tech.id, outputs)])));
}

function validateTech(
  techId: string,
  cost: number,
  outputs: readonly ResearchPacingScenarioOutput[],
): string[] {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  if (!tech) return [`Missing technology ${techId}`];
  const standard = scenarioByEra(outputs, tech.era, 'standard');
  const tall = scenarioByEra(outputs, tech.era, 'tall');
  const wide = scenarioByEra(outputs, tech.era, 'wide');
  const window = getRecommendedTechTurnWindow(tech);
  const band = resolveTechPacingBand(tech);
  const failures: string[] = [];
  const standardEta = eta(cost, standard.netScience);
  const tallEta = eta(cost, tall.netScience);
  const wideEta = eta(cost, wide.netScience);
  const wideFloor = band === 'power-spike' || band === 'marquee' ? 3 : 2;

  if (standardEta < window.min || standardEta > window.max) {
    failures.push(`Era ${tech.era} ${tech.id}: standard ETA ${standardEta} is outside ${window.min}-${window.max}.`);
  }
  if (tallEta > Math.ceil(1.5 * window.max)) {
    failures.push(`Era ${tech.era} ${tech.id}: tall ETA ${tallEta} exceeds ${Math.ceil(1.5 * window.max)}.`);
  }
  if (wideEta < wideFloor) {
    failures.push(`Era ${tech.era} ${tech.id}: wide current-frontier ETA ${wideEta} is below ${wideFloor}.`);
  }
  return failures;
}

export function buildResearchPacingReport(options: ResearchPacingReportOptions = {}): ResearchPacingReport {
  const outputs = getResearchScenarioOutputs();
  const proposedCosts = getProposedResearchCostById();
  const currentCosts = new Map(TECH_TREE.map(tech => [tech.id, currentCostFor(tech.id)]));
  const costs = new Map(TECH_TREE.map(tech => [tech.id, options.proposedCosts ? proposedCosts[tech.id] : currentCosts.get(tech.id)!]));
  const failures = TECH_TREE.flatMap(tech => validateTech(tech.id, costs.get(tech.id)!, outputs));
  const issue917 = buildResearchPacingScenario({ scenario: 'issue-917', era: 2, infrastructureShare: 0.6 });
  const issue917OneTurnTechs = TECH_TREE
    .filter(tech => tech.era === 2)
    .filter(tech => eta(costs.get(tech.id)!, issue917.netScience) === 1)
    .map(tech => tech.id);
  if (issue917OneTurnTechs.length > 0) {
    failures.push(`#917: Era 2 current frontier collapses to one turn for ${issue917OneTurnTechs.join(', ')} at net science ${issue917.netScience}.`);
  }

  const eras = Array.from({ length: 13 }, (_, index) => index + 1).map(era => {
    const techs = TECH_TREE.filter(tech => tech.era === era);
    const standard = scenarioByEra(outputs, era, 'standard');
    const tall = scenarioByEra(outputs, era, 'tall');
    const wide = scenarioByEra(outputs, era, 'wide');
    const standardEtas = techs.map(tech => eta(costs.get(tech.id)!, standard.netScience));
    const tallEtas = techs.map(tech => eta(costs.get(tech.id)!, tall.netScience));
    const wideEtas = techs.map(tech => eta(costs.get(tech.id)!, wide.netScience));
    const currentFrontierOneTurns = techs.filter(tech => eta(costs.get(tech.id)!, wide.netScience) === 1).length;
    return {
      era,
      bands: Object.fromEntries(PACING_BANDS.map(band => [band, techs.filter(tech => resolveTechPacingBand(tech) === band).length])) as Record<PacingBand, number>,
      scenarios: {
        tall: { grossScience: tall.grossScience, netScience: tall.netScience },
        standard: { grossScience: standard.grossScience, netScience: standard.netScience },
        wide: { grossScience: wide.grossScience, netScience: wide.netScience },
      },
      costPercentiles: {
        currentP50: percentile(techs.map(tech => currentCosts.get(tech.id)!), 0.5),
        currentP90: percentile(techs.map(tech => currentCosts.get(tech.id)!), 0.9),
        proposedP50: percentile(techs.map(tech => proposedCosts[tech.id]!), 0.5),
        proposedP90: percentile(techs.map(tech => proposedCosts[tech.id]!), 0.9),
      },
      etaPercentiles: { standardP50: percentile(standardEtas, 0.5), tallP90: percentile(tallEtas, 0.9), wideMinimum: Math.min(...wideEtas) },
      oneTurnCurrentFrontierCount: currentFrontierOneTurns,
      adjacentEraRatio: era === 1 ? 1 : normalizedMedianEta(techs, costs, standard.netScience) / Math.max(0.01, normalizedMedianEta(
        TECH_TREE.filter(tech => tech.era === era - 1),
        costs,
        scenarioByEra(outputs, era - 1, 'standard').netScience,
      )),
    };
  });
  for (const era of eras.slice(1)) {
    if (era.adjacentEraRatio > 1.5 || era.adjacentEraRatio < 2 / 3) {
      failures.push(`Era ${era.era}: normalized median ETA continuity ratio ${era.adjacentEraRatio.toFixed(2)} is outside 0.67-1.50.`);
    }
  }
  const unitUsefulLifetimeWarnings = getUnitUsefulLifetimeWarnings({
    arrivalTurnByEra: new Map(eras.map(era => [era.era, scenarioByEra(outputs, era.era, 'standard').arrivalTurn])),
  });
  failures.push(...unitUsefulLifetimeWarnings);

  return {
    eras,
    failures: [...new Set(failures)].sort(),
    changedCostIds: TECH_TREE.filter(tech => proposedCosts[tech.id] !== tech.cost).map(tech => tech.id).sort(),
    unitUsefulLifetimeWarnings,
  };
}

export function renderResearchPacingMarkdown(report: ResearchPacingReport): string {
  const lines = [
    '# Research pacing report',
    '',
    '| Era | Current median cost | Proposed median cost | Standard median ETA | Tall p90 ETA | Wide minimum ETA | One-turn frontier | Adjacent ratio |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.eras.map(era => `| ${era.era} | ${era.costPercentiles.currentP50} | ${era.costPercentiles.proposedP50} | ${era.etaPercentiles.standardP50} | ${era.etaPercentiles.tallP90} | ${era.etaPercentiles.wideMinimum} | ${era.oneTurnCurrentFrontierCount} | ${era.adjacentEraRatio.toFixed(2)} |`),
  ];
  if (report.failures.length > 0) lines.push('', '## Failures', '', ...report.failures.map(failure => `- ${failure}`));
  if (report.unitUsefulLifetimeWarnings.length > 0) lines.push('', '## Useful-lifetime warnings', '', ...report.unitUsefulLifetimeWarnings.map(warning => `- ${warning}`));
  return `${lines.join('\n')}\n`;
}

function isMainModule(): boolean {
  return typeof process !== 'undefined' && process.argv[1]?.endsWith('report-research-pacing.ts');
}

if (isMainModule()) {
  const proposedCosts = process.argv.includes('--proposed-costs');
  const json = process.argv.includes('--json');
  const report = buildResearchPacingReport({ proposedCosts });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderResearchPacingMarkdown(report));
  if (report.failures.length > 0) process.exitCode = 1;
}
