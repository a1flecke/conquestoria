import { describe, expect, it } from 'vitest';
import {
  applyAIResearch,
  planAIResearch,
  type AIResearchPlanningContext,
} from '@/ai/ai-research';
import { createNewGame } from '@/core/game-state';
import type {
  PersonalityTraits,
  Tech,
  TechTrack,
} from '@/core/types';
import { createTechState } from '@/systems/tech-system';
import { prepareMajorCivStrategicPlan } from '@/ai/ai-prepared-turn';

const neutral: PersonalityTraits = {
  traits: [],
  warLikelihood: 0.5,
  diplomacyFocus: 0.5,
  expansionDrive: 0.5,
};

function tech(
  id: string,
  track: TechTrack,
  prerequisites: string[] = [],
  extra: Partial<Tech> = {},
): Tech {
  return {
    id,
    name: id,
    track,
    cost: 20,
    prerequisites,
    unlocks: [],
    era: 1,
    ...extra,
  };
}

function context(
  techs: Tech[],
  overrides: Partial<AIResearchPlanningContext> = {},
): AIResearchPlanningContext {
  return {
    techState: createTechState(),
    personality: neutral,
    modernizationDemand: 0,
    forceDemands: [],
    coastalEmpire: false,
    availableResources: new Set(),
    sciencePerTurn: 5,
    techs,
    ...overrides,
  };
}

describe('AI strategic research planning', () => {
  it('chooses the available prerequisite toward a modern frontline unit', () => {
    const result = planAIResearch(context([
      tech('economy-now', 'economy', [], { unlocksBuildings: ['marketplace'] }),
      tech('military-base', 'military'),
      tech('modern-front', 'military', ['military-base'], { unlocksUnits: ['tank'], era: 9 }),
    ], { modernizationDemand: 100 }));

    expect(result?.frontierTechId).toBe('military-base');
    expect(result?.downstreamTargetTechId).toBe('modern-front');
  });

  it('values a relevant maritime path for a coastal empire', () => {
    const techs = [
      tech('land', 'military', [], { unlocksUnits: ['warrior'] }),
      tech('sea', 'maritime', [], { unlocksUnits: ['trireme'] }),
    ];

    expect(planAIResearch(context(techs, { coastalEmpire: true }))?.frontierTechId)
      .toBe('sea');
  });

  it('penalizes a cavalry path without horses without making it impossible', () => {
    const result = planAIResearch(context([
      tech('cavalry', 'military', [], { unlocksUnits: ['horseman'] }),
      tech('infantry', 'military', [], { unlocksUnits: ['warrior'] }),
    ], {
      modernizationDemand: 50,
      forceDemands: [{
        role: 'frontline',
        desired: 1,
        assigned: 0,
        missing: 1,
        priority: 100,
        sourcePlanIds: ['primary'],
      }],
    }));

    expect(result?.frontierTechId).toBe('infantry');
    expect(result?.trace.candidates.find(candidate => candidate.id === 'cavalry')?.score)
      .toBeGreaterThan(Number.NEGATIVE_INFINITY);
  });

  it('lets economy support outrank an unaffordable war path', () => {
    const result = planAIResearch(context([
      tech('war', 'military', [], { unlocksUnits: ['knight'] }),
      tech('growth', 'economy', [], { unlocksBuildings: ['marketplace'] }),
    ]));

    expect(result?.frontierTechId).toBe('growth');
  });

  it('uses personality track identity to resolve a real tie', () => {
    const techs = [
      tech('arms', 'military'),
      tech('markets', 'economy'),
    ];
    const aggressive: PersonalityTraits = { ...neutral, traits: ['aggressive'] };
    const trader: PersonalityTraits = { ...neutral, traits: ['trader'] };

    expect(planAIResearch(context(techs, { personality: aggressive }))?.frontierTechId)
      .toBe('arms');
    expect(planAIResearch(context(techs, { personality: trader }))?.frontierTechId)
      .toBe('markets');
  });

  it('scores era advancement and unlock breadth', () => {
    const result = planAIResearch(context([
      tech('narrow', 'science'),
      tech('broad', 'science', [], {
        era: 3,
        unlocksUnits: ['warrior'],
        unlocksBuildings: ['library'],
      }),
    ]));

    expect(result?.frontierTechId).toBe('broad');
    expect(result?.scoreComponents.eraProgress).toBe(3);
    expect(result?.scoreComponents.unlockBreadth).toBe(2);
  });

  it('bounds search to four edges and twenty-four downstream targets', () => {
    const techs = [tech('root', 'science')];
    for (let index = 1; index <= 30; index++) {
      techs.push(tech(
        `node-${index}`,
        'science',
        [index === 1 ? 'root' : `node-${index - 1}`],
        { era: Math.min(12, index + 1) },
      ));
    }

    const result = planAIResearch(context(techs));

    expect(result?.searchStats.maxDepth).toBeLessThanOrEqual(4);
    expect(result?.searchStats.evaluatedTargets).toBeLessThanOrEqual(24);
  });

  it('uses stable tech IDs for equal candidates', () => {
    const result = planAIResearch(context([
      tech('zeta', 'science'),
      tech('alpha', 'science'),
    ]));

    expect(result?.frontierTechId).toBe('alpha');
  });

  it('ignores a rival hidden completed-tech list when prepared intel is unchanged', () => {
    const first = createNewGame(undefined, 'research-hidden-first', 'small');
    const second = structuredClone(first);
    second.civilizations.player.techState.completed = ['cyber-warfare', 'stealth-technology'];
    const prepared = prepareMajorCivStrategicPlan(first, 'ai-1');

    const firstResult = applyAIResearch(first, 'ai-1', prepared, neutral);
    const secondResult = applyAIResearch(second, 'ai-1', prepared, neutral);

    expect(secondResult.state.civilizations['ai-1'].techState.currentResearch)
      .toBe(firstResult.state.civilizations['ai-1'].techState.currentResearch);
    expect(firstResult.state.opponentAI?.majorCivs['ai-1'].researchTargetTechId)
      .not.toBeNull();
  });

  it('preserves valid active research, progress, and queue', () => {
    const state = createNewGame(undefined, 'research-commitment', 'small');
    const civ = state.civilizations['ai-1'];
    civ.techState.currentResearch = 'fire';
    civ.techState.researchProgress = 3;
    civ.techState.researchQueue = ['writing'];
    const before = structuredClone(civ.techState);
    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    const result = applyAIResearch(state, civ.id, prepared, neutral);

    expect(result.state.civilizations[civ.id].techState).toEqual(before);
  });
});
