import { describe, expect, it } from 'vitest';
import {
  applyAIResearch,
  planAIResearch,
  type AIResearchPlanningContext,
} from '@/ai/ai-research';
import { createNewGame } from '@/core/game-state';
import type {
  GameState,
  PersonalityTraits,
  Tech,
  TechTrack,
} from '@/core/types';
import { createTechState } from '@/systems/tech-system';
import { TRAINABLE_UNITS, foundCity } from '@/systems/city-system';
import { prepareMajorCivStrategicPlan } from '@/ai/ai-prepared-turn';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { simulateResearchQueueTiming } from '@/systems/tech-progression';

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
  it('uses canonical one-completion-per-turn queue timing for downstream research targets', () => {
    const result = planAIResearch(context([
      tech('first', 'science', [], { cost: 20 }),
      tech('target', 'science', ['first'], { cost: 20, unlocksBuildings: ['library'] }),
    ], { sciencePerTurn: 100 }));

    expect(result?.frontierTechId).toBe('first');
    expect(result?.downstreamTargetTechId).toBe('target');
    expect(result?.scoreComponents.estimatedResearchTurns).toBe(2);
  });

  it('values the final conjunctive prerequisite without claiming the first tech already enables the unit', () => {
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const result = planAIResearch(context([
        tech('archery', 'military'),
        tech('bronze-working', 'military'),
      ], {
        techState: { ...createTechState(), completed: ['archery'] },
        forceDemands: [{
          role: 'ranged', desired: 1, assigned: 0, missing: 1, priority: 100, sourcePlanIds: ['primary'],
        }],
      }));

      expect(result?.frontierTechId).toBe('bronze-working');
      expect(result?.scoreComponents.activePlanFit).toBeGreaterThan(0);
    } finally {
      archer.requiredTechs = original;
    }
  });

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

  it('lets a coastal AI pursue Dreadnought Construction for an unmet naval-combat role', () => {
    const result = planAIResearch(context([
      tech('dreadnought-construction', 'maritime', ['naval-armor', 'bessemer-steel'], {
        unlocksUnits: ['battleship'], era: 9, countsForEraAdvancement: false,
      }),
    ], {
      techState: { ...createTechState(), completed: ['naval-armor', 'bessemer-steel'] },
      coastalEmpire: true,
      forceDemands: [{
        role: 'naval-combat', desired: 1, assigned: 0, missing: 1, priority: 100, sourcePlanIds: ['fleet'],
      }],
    }));

    expect(result?.frontierTechId).toBe('dreadnought-construction');
    expect(result?.scoreComponents.activePlanFit).toBeGreaterThan(0);
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

  it('keeps Rifle Tactics researchable while pricing Cuirassier\'s missing Iron', () => {
    const result = planAIResearch(context([
      tech('rifle-tactics', 'military', [], { unlocksUnits: ['cuirassier'] }),
    ], {
      availableResources: new Set(['horses']),
      forceDemands: [{
        role: 'mobile', desired: 1, assigned: 0, missing: 1, priority: 100, sourcePlanIds: ['primary'],
      }],
    }));

    expect(result?.frontierTechId).toBe('rifle-tactics');
    expect(result?.scoreComponents.resourceMismatchPenalty).toBe(4);
    expect(result?.scoreComponents.activePlanFit).toBeGreaterThan(0);
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

  it('#919 MR2: the pressure-gated, pressure-scaled bonus lifts a relief-unlocking tech', () => {
    const techs = [
      // Equal unlock breadth on both sides (monument is not a UNREST_RELIEF_SOURCES
      // building) so only the pressure-gated relief bonus can break the tie.
      tech('aaa-plain', 'civics', [], { unlocksBuildings: ['monument'] }),
      tech('zzz-courts', 'civics', [], { unlocksBuildings: ['courthouse'] }),
    ];
    const relief = (n: number) => {
      const d = planAIResearch(context(techs, n === undefined ? {} : { pressuredReliefCityCount: n }));
      return d?.scoreComponents.unrestReliefTechBonus ?? 0;
    };

    // Below the 2-pressured-city gate: no bonus, id tiebreak keeps 'aaa-plain'.
    expect(planAIResearch(context(techs))?.frontierTechId).toBe('aaa-plain');
    expect(relief(0)).toBe(0);
    expect(relief(1)).toBe(0);
    expect(planAIResearch(context(techs, { pressuredReliefCityCount: 1 }))?.frontierTechId)
      .toBe('aaa-plain');

    // At the gate: base bonus applies and the relief tech wins.
    const gate = planAIResearch(context(techs, { pressuredReliefCityCount: 2 }));
    expect(gate?.frontierTechId).toBe('zzz-courts');
    expect(gate?.scoreComponents.unrestReliefTechBonus).toBeGreaterThanOrEqual(6);
    expect(gate?.trace.candidates.find(c => c.id === 'zzz-courts')?.reasonCodes)
      .toContain('unrest-relief');

    // Scales with pressured-city count, capped.
    expect(relief(8)).toBeGreaterThan(relief(2));
    expect(relief(100)).toBe(relief(12)); // both clamp to the cap
    expect(relief(100)).toBeLessThanOrEqual(18);
  });

  it('#926: relief research only values cities whose pressure the unlocked building can cut', () => {
    const techs = [
      tech('aaa-magistracy', 'civics', [], { unlocksBuildings: ['courthouse'] }),
      tech('zzz-civil-service', 'civics', [], { unlocksBuildings: ['military-administration'] }),
    ];

    const warOnly = planAIResearch(context(techs, {
      pressuredReliefCityIdsByBuildingId: {
        courthouse: [],
        'military-administration': ['front-1', 'front-2'],
      },
    }));
    expect(warOnly?.frontierTechId).toBe('zzz-civil-service');
    expect(warOnly?.scoreComponents.unrestReliefTechBonus).toBeGreaterThan(0);

    const sprawlOnly = planAIResearch(context(techs, {
      pressuredReliefCityIdsByBuildingId: {
        courthouse: ['wide-1', 'wide-2'],
        'military-administration': [],
      },
    }));
    expect(sprawlOnly?.frontierTechId).toBe('aaa-magistracy');
    expect(sprawlOnly?.scoreComponents.unrestReliefTechBonus).toBeGreaterThan(0);
  });

  it('#927: generic relief research recognizes a direct-tech road network source', () => {
    const techs = [
      tech('aaa-plain', 'civics'),
      tech('military-logistics', 'civics'),
    ];
    const decision = planAIResearch(context(techs, {
      pressuredReliefCityIdsByBuildingId: {
        courthouse: [],
        'military-administration': [],
        'road-post-network': ['frontier-1', 'frontier-2'],
      },
    }));

    expect(decision?.frontierTechId).toBe('military-logistics');
    expect(decision?.scoreComponents.unrestReliefTechBonus).toBeGreaterThan(0);
    expect(decision?.trace.candidates.find(candidate => candidate.id === 'military-logistics')?.reasonCodes)
      .toContain('unrest-relief');
  });

  it('#927: generic relief research recognizes the Regional Capital building unlock', () => {
    const techs = [
      tech('aaa-plain', 'civics'),
      tech('political-philosophy', 'civics', [], { unlocksBuildings: ['regional_capital'] }),
    ];
    const decision = planAIResearch(context(techs, {
      pressuredReliefCityIdsByBuildingId: {
        'regional-capital': ['frontier-1', 'frontier-2'],
      },
    }));

    expect(decision?.frontierTechId).toBe('political-philosophy');
    expect(decision?.scoreComponents.unrestReliefTechBonus).toBeGreaterThan(0);
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

  it('keeps AI research targets and final research output identical across opponent challenge modes', () => {
    const base = createNewGame(undefined, 'research-challenge-symmetry', 'small');
    const outcomes = (['explorer', 'standard', 'veteran'] as const).map(opponentChallenge => {
      const state = { ...structuredClone(base), opponentChallenge };
      const result = applyAIResearch(
        state,
        'ai-1',
        prepareMajorCivStrategicPlan(state, 'ai-1'),
        neutral,
      );
      const civ = result.state.civilizations['ai-1'];
      const science = calculateCivResearchOutput(result.state, civ.id).finalScience;
      return {
        currentResearch: civ.techState.currentResearch,
        science,
        eta: civ.techState.currentResearch
          ? simulateResearchQueueTiming(civ.techState, science).get(civ.techState.currentResearch)?.finishTurns
          : null,
      };
    });

    expect(outcomes).toEqual([outcomes[0], outcomes[0], outcomes[0]]);
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

describe('#919 MR2 — unrest pressure lifts magistracy in AI research planning', () => {
  const earlyGame = () => ({
    ...createTechState(),
    completed: ['tribal-council', 'code-of-laws'],
    currentResearch: null,
    researchQueue: [],
  });

  it('applyAIResearch derives the count from real state: a wide revolt-empire beelines magistracy; a calm one and a war-only one never do', () => {
    function buildEmpire(cityCount: number, seed: string, atWarCount = 0): GameState {
      const state = createNewGame(undefined, seed, 'small');
      const civ = state.civilizations['ai-1'];
      const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
      civ.cities = [];
      for (let i = 1; i <= cityCount; i++) {
        const position = { q: settler.position.q + (i % 5), r: settler.position.r + Math.floor(i / 5) };
        const city = foundCity(civ.id, position, state.map, state.idCounters);
        city.id = i === 1 ? 'ai1-capital' : `ai1-city-${i}`;
        city.buildings = [];
        city.productionQueue = [];
        state.cities[city.id] = city;
        civ.cities.push(city.id);
      }
      civ.diplomacy.atWarWith = Array.from({ length: atWarCount }, (_, i) => `enemy-${i}`);
      civ.techState = earlyGame();
      return state;
    }

    function firstMagistracyTurn(state0: GameState): number {
      let state = state0;
      for (let turn = 1; turn <= 8; turn++) {
        const before = state.civilizations['ai-1'];
        state = {
          ...state,
          civilizations: {
            ...state.civilizations,
            'ai-1': { ...before, techState: { ...before.techState, currentResearch: null, researchProgress: 0 } },
          },
        };
        const result = applyAIResearch(state, 'ai-1', prepareMajorCivStrategicPlan(state, 'ai-1'), neutral);
        state = result.state;
        const picked = state.civilizations['ai-1'].techState.currentResearch;
        if (picked === 'magistracy') return turn;
        if (picked) {
          const civ = state.civilizations['ai-1'];
          state = {
            ...state,
            civilizations: {
              ...state.civilizations,
              'ai-1': {
                ...civ,
                techState: {
                  ...civ.techState,
                  completed: [...civ.techState.completed, picked],
                  currentResearch: null,
                  researchProgress: 0,
                  researchQueue: [],
                },
              },
            },
          };
        }
      }
      return Infinity;
    }

    // 15 cities -> empire overextension (15-6)*3 = 27 on every city -> all 15 are above
    // 0.6 * UNREST_TRIGGER_PRESSURE (24) AND carry an Empire-overextension row -> count = 15.
    expect(firstMagistracyTurn(buildEmpire(15, 'mr2-research-wide'))).toBeLessThanOrEqual(3);
    // 3 clustered cities, no wars -> no overextension / distance row -> count 0 -> no bonus.
    // It must not match the wide empire's early beeline; later generic selection remains valid.
    expect(firstMagistracyTurn(buildEmpire(3, 'mr2-research-tall'))).toBeGreaterThan(3);
    // 3 clustered cities at war x3 -> every city IS pressured (war 24) but has NO
    // distance/overextension row -> a courthouse would not help -> count 0 -> no bonus.
    expect(firstMagistracyTurn(buildEmpire(3, 'mr2-research-waronly', 3))).toBeGreaterThan(3);
  });
});
