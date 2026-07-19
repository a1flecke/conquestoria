import { describe, expect, it } from 'vitest';
import { TECH_TREE, hasReachedEraThreshold, resolveCivilizationEra } from '@/systems/tech-definitions';
import {
  buildRepresentativeResearchTimeline,
  getRequiredAdvancementCount,
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
