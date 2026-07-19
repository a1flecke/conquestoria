import type { Tech } from '@/core/types';
import {
  TECH_TREE,
  getEraAdvancementFraction,
  getEraAdvancementTechs,
  hasReachedEraThreshold,
  resolveCivilizationEra,
} from '@/systems/tech-definitions';
import { getResearchOutputProfileForTech } from '@/systems/pacing-model';
import { requireEraPacingProfile } from '@/systems/era-pacing-profiles';

export interface ResearchTimelineEntry {
  techId: string;
  era: number;
  eta: number;
  completionTurn: number;
}

export interface RepresentativeResearchTimeline {
  targetEra: number;
  entries: ResearchTimelineEntry[];
  completedTechIds: string[];
  arrivalTurnByEra: ReadonlyMap<number, number>;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function techById(id: string): Tech {
  const tech = TECH_TREE.find(candidate => candidate.id === id);
  if (!tech) throw new Error(`Missing technology prerequisite: ${id}`);
  return tech;
}

function collectMissingClosure(
  tech: Tech,
  completed: ReadonlySet<string>,
  visiting: ReadonlySet<string> = new Set(),
): Tech[] {
  if (completed.has(tech.id)) return [];
  if (visiting.has(tech.id)) throw new Error(`Technology prerequisite cycle at ${tech.id}`);

  const nextVisiting = new Set(visiting);
  nextVisiting.add(tech.id);
  return [
    ...tech.prerequisites.flatMap(id => collectMissingClosure(techById(id), completed, nextVisiting)),
    tech,
  ];
}

function uniqueTopologicalClosure(tech: Tech, completed: ReadonlySet<string>): Tech[] {
  const seen = new Set<string>();
  return collectMissingClosure(tech, completed)
    .filter(candidate => !completed.has(candidate.id))
    .filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    });
}

export function getRequiredAdvancementCount(era: number): number {
  const qualifying = getEraAdvancementTechs(era);
  if (qualifying.length === 0) throw new Error(`Era ${era} has no advancement technologies`);
  return Math.ceil(qualifying.length * getEraAdvancementFraction(era));
}

export function buildRepresentativeResearchTimeline(targetEra: number): RepresentativeResearchTimeline {
  if (!Number.isInteger(targetEra) || targetEra < 1) {
    throw new Error(`Unsupported representative era: ${targetEra}`);
  }
  requireEraPacingProfile(targetEra);

  const completed = new Set<string>();
  const entries: ResearchTimelineEntry[] = [];
  const arrivalTurnByEra = new Map<number, number>([[1, 0]]);
  let turn = 0;

  for (let era = 2; era <= targetEra; era++) {
    const required = getRequiredAdvancementCount(era);
    while (!hasReachedEraThreshold([...completed], era)) {
      const candidates = getEraAdvancementTechs(era)
        .filter(tech => !completed.has(tech.id))
        .map(tech => ({ tech, closure: uniqueTopologicalClosure(tech, completed) }))
        .filter(candidate => candidate.closure.length > 0)
        .sort((left, right) => {
          const leftCost = left.closure.reduce((sum, tech) => sum + tech.cost, 0);
          const rightCost = right.closure.reduce((sum, tech) => sum + tech.cost, 0);
          return leftCost - rightCost || left.tech.cost - right.tech.cost || compareIds(left.tech.id, right.tech.id);
        });
      const selected = candidates[0];
      if (!selected) throw new Error(`Era ${era} cannot satisfy ${required} advancement technologies`);

      for (const tech of selected.closure) {
        if (completed.has(tech.id)) continue;
        const output = getResearchOutputProfileForTech(tech).outputPerTurn;
        if (!Number.isFinite(output) || output <= 0) {
          throw new Error(`Non-positive research output for ${tech.id}`);
        }
        const eta = Math.ceil(tech.cost / output);
        turn += eta;
        completed.add(tech.id);
        entries.push({ techId: tech.id, era: tech.era, eta, completionTurn: turn });
        if (hasReachedEraThreshold([...completed], era)) break;
      }
    }
    if (resolveCivilizationEra([...completed]) !== era) {
      throw new Error(`Representative route failed to reach contiguous era ${era}`);
    }
    arrivalTurnByEra.set(era, turn);
  }

  return {
    targetEra,
    entries,
    completedTechIds: [...completed],
    arrivalTurnByEra,
  };
}
