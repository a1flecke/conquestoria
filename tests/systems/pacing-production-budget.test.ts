import { describe, expect, it } from 'vitest';
import { TECH_TREE, hasReachedEraThreshold, resolveCivilizationEra } from '@/systems/tech-definitions';
import { BUILDINGS } from '@/systems/city-system';
import {
  buildRepresentativeResearchTimeline,
  getEligibleRepresentativeBuildings,
  getMissingRepresentativeBuildingClosure,
  getRepresentativeCohorts,
  getRequiredAdvancementCount,
  simulateRepresentativeCity,
  selectRepresentativeBuilding,
} from './helpers/pacing-production-budget';

describe('representative research timeline', () => {
  it('uses canonical rounded-up advancement counts', () => {
    for (let era = 2; era <= 13; era++) {
      const qualifying = TECH_TREE.filter(tech => tech.era === era && tech.countsForEraAdvancement !== false);

      expect(getRequiredAdvancementCount(era)).toBeGreaterThanOrEqual(1);
      expect(getRequiredAdvancementCount(era)).toBeLessThanOrEqual(qualifying.length);
    }
  });

  it('reaches each requested personal era through a prerequisite-closed route', () => {
    for (let era = 1; era <= 13; era++) {
      const timeline = buildRepresentativeResearchTimeline(era);

      expect(resolveCivilizationEra(timeline.completedTechIds)).toBe(era);
      if (era >= 2) expect(hasReachedEraThreshold(timeline.completedTechIds, era)).toBe(true);
      for (const techId of timeline.completedTechIds) {
        const tech = TECH_TREE.find(candidate => candidate.id === techId);
        expect(tech, techId).toBeDefined();
        expect(tech!.prerequisites.every(id => timeline.completedTechIds.includes(id))).toBe(true);
      }
    }
  });

  it('records positive ETAs in strictly increasing completion-turn order', () => {
    const entries = buildRepresentativeResearchTimeline(10).entries;

    for (let index = 1; index < entries.length; index++) {
      expect(entries[index].eta).toBeGreaterThan(0);
      expect(entries[index].completionTurn).toBeGreaterThan(entries[index - 1].completionTurn);
    }
  });
});

describe('representative building selection', () => {
  it('adds cohorts only at documented founding eras', () => {
    expect(getRepresentativeCohorts(1).map(cohort => cohort.id)).toEqual(['capital']);
    expect(getRepresentativeCohorts(3).map(cohort => cohort.id)).toEqual(['capital', 'expansion-1']);
    expect(getRepresentativeCohorts(9).map(cohort => cohort.id)).toEqual([
      'capital', 'expansion-1', 'expansion-2', 'expansion-3', 'frontier',
    ]);
  });

  it('excludes non-neutral buildings from the candidate set', () => {
    const candidates = getEligibleRepresentativeBuildings({
      completedTechs: TECH_TREE.map(tech => tech.id),
      completedBuildings: [],
    });
    const ids = candidates.map(candidate => candidate.id);

    for (const building of Object.values(BUILDINGS)) {
      if (building.nationalProject || building.uniquePerEmpire || building.coastalRequired || building.resourceRequired?.length) {
        expect(ids).not.toContain(building.id);
      }
    }
  });

  it('returns prerequisite closures in build order and selects deterministically', () => {
    const terminal = Object.values(BUILDINGS).find(building =>
      (building.requiresBuildings?.length ?? 0) > 0
      && !building.nationalProject
      && !building.uniquePerEmpire
      && !building.coastalRequired
      && !(building.resourceRequired?.length));
    expect(terminal).toBeDefined();

    const input = { completedTechs: TECH_TREE.map(tech => tech.id), completedBuildings: [] as string[] };
    const closure = getMissingRepresentativeBuildingClosure(terminal!, input);
    expect(closure.at(-1)).toBe(terminal!.id);
    expect(closure[0]).not.toBe(terminal!.id);
    expect(selectRepresentativeBuilding(input)).toEqual(selectRepresentativeBuilding(input));
  });

  it('deduplicates shared prerequisites and surfaces malformed prerequisite data', () => {
    const input = { completedTechs: TECH_TREE.map(tech => tech.id), completedBuildings: [] as string[] };
    for (const terminal of getEligibleRepresentativeBuildings(input)) {
      try {
        const closure = getMissingRepresentativeBuildingClosure(terminal, input);
        expect(new Set(closure).size).toBe(closure.length);
      } catch (error) {
        expect(error).toThrowError('Unavailable building prerequisite');
      }
    }

    const selected = selectRepresentativeBuilding(input);
    expect(selected).not.toBeNull();
    const originalPrerequisites = selected!.requiresBuildings;
    selected!.requiresBuildings = ['missing-representative-prerequisite'];
    try {
      expect(() => selectRepresentativeBuilding(input)).toThrow('Missing building prerequisite');
    } finally {
      selected!.requiresBuildings = originalPrerequisites;
    }
  });
});

describe('representative production budget', () => {
  it('gives a frontier city no pre-founding production', () => {
    const result = simulateRepresentativeCity({
      cohort: { id: 'frontier', foundedEra: 9 },
      targetEra: 9,
      timeline: buildRepresentativeResearchTimeline(9),
      infrastructureShare: 0.6,
    });

    expect(result.actualProductionEarned).toBe(0);
    expect(result.completedBuildings).toEqual([]);
  });

  // Timeouts below are widened from vitest's 5s default (#608): this machine
  // routinely runs several Claude Code worktree agents concurrently, each
  // invoking `yarn test` independently, and this simulation is CPU-heavy
  // enough to blow past the default under that contention with no code
  // regression (worst observed: 9.5s and 13.5s respectively). Each timeout
  // carries roughly 2x headroom over the worst observed value.
  it('accounts for every allocated production point exactly once', () => {
    const result = simulateRepresentativeCity({
      cohort: { id: 'capital', foundedEra: 1 },
      targetEra: 10,
      timeline: buildRepresentativeResearchTimeline(10),
      infrastructureShare: 0.6,
    });
    const accounted = result.completedBuildingCost
      + result.activeBuildingProgress
      + result.discardedObsoleteProgress
      + result.unspentInfrastructureProduction;

    expect(Math.abs(accounted - result.infrastructureProductionAllocated)).toBeLessThanOrEqual(1e-9);
    expect(result.activeBuildingCount).toBeLessThanOrEqual(1);
    expect(result.cappedProductionEarned).toBeLessThanOrEqual(result.actualProductionEarned);
  }, 25_000);

  it('gives later cohorts less production and no more population than the capital', () => {
    const timeline = buildRepresentativeResearchTimeline(10);
    const capital = simulateRepresentativeCity({
      cohort: { id: 'capital', foundedEra: 1 }, targetEra: 10, timeline, infrastructureShare: 0.6,
    });
    const frontier = simulateRepresentativeCity({
      cohort: { id: 'frontier', foundedEra: 9 }, targetEra: 10, timeline, infrastructureShare: 0.6,
    });

    expect(frontier.actualProductionEarned).toBeLessThan(capital.actualProductionEarned);
    expect(frontier.population).toBeLessThanOrEqual(capital.population);
  }, 30_000);
});
