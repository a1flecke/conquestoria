import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { buildStrategicAssessment, MAX_STRATEGIC_CONSTRAINTS } from '@/systems/strategic-assessment';
import {
  AI_A, AI_B, HUMAN_A, HUMAN_B, makeMet, setNationalIntent,
} from '../helpers/viewer-knowledge-fixtures';
import { addCity, pickSites, twoCityWorld } from '../helpers/assessment-fixtures';
import { expectViewerSafety, expectHotSeatDifferential, type ViewerSurface } from '../helpers/viewer-safety';

describe('buildStrategicAssessment (#1236)', () => {
  it('names the starving SECOND city, not the first roster city (#1229 regression)', () => {
    const state = twoCityWorld(true);
    expect(state.civilizations[HUMAN_A].cities[0]).toBe('city-a-first');

    const food = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'food');

    expect(food?.focusCityId).toBe('city-b-second');
    expect(food?.destination).toEqual({ kind: 'open-city', cityId: 'city-b-second' });
  });

  it('picks the worst city regardless of roster order', () => {
    const state = twoCityWorld(true);
    state.civilizations[HUMAN_A].cities.reverse();

    const food = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'food');

    expect(food?.focusCityId).toBe('city-b-second');
  });

  it('breaks an exact tie between two equally starving cities by city id', () => {
    const state = twoCityWorld(true);
    for (const coord of state.cities['city-a-first'].ownedTiles) state.map.tiles[hexKey(coord)].terrain = 'desert';
    state.cities['city-a-first'].focus = state.cities['city-b-second'].focus;

    const forward = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'food');
    state.civilizations[HUMAN_A].cities.reverse();
    const reversed = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'food');

    expect(forward?.focusCityId).toBe(reversed?.focusCityId);
    expect(['city-a-first', 'city-b-second']).toContain(forward?.focusCityId);
  });

  it('reports no constraints for a healthy empire (no filler)', () => {
    const assessment = buildStrategicAssessment(twoCityWorld(false), HUMAN_A);

    expect(assessment.constraints).toEqual([]);
  });

  it('is deterministic and does not mutate its input', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 1;
    state.cities['city-a-first'].unrestTurns = 2;
    const before = JSON.stringify(state);

    const first = buildStrategicAssessment(state, HUMAN_A);
    const second = buildStrategicAssessment(state, HUMAN_A);

    expect(second).toEqual(first);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('ranks by severity, highest first, and keeps at most five constraints', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 2; // revolt
    state.cities['city-a-first'].unrestTurns = 3;
    state.cities['city-b-second'].productionQueue = ['warrior'];
    state.economyStatusByCiv = {
      ...state.economyStatusByCiv,
      [HUMAN_A]: {
        turn: state.turn, grossGoldIncome: 1, buildingMaintenance: 4, unitMaintenance: 4,
        netGoldPerTurn: -7, unpaidMaintenance: 7, strainLevel: 'critical',
      },
    };
    state.civilizations[HUMAN_A].techState.currentResearch = 'pottery';
    const unitId = 'unit-supply-test';
    state.units[unitId] = {
      id: unitId, type: 'warrior', owner: HUMAN_A, position: { q: 0, r: 0 }, movementPointsLeft: 0,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 },
    } as GameState['units'][string];

    const { constraints } = buildStrategicAssessment(state, HUMAN_A);

    expect(constraints.length).toBeLessThanOrEqual(MAX_STRATEGIC_CONSTRAINTS);
    expect(constraints.map(c => c.severity)).toEqual([...constraints.map(c => c.severity)].sort((a, b) => b - a));
    // A critical treasury (90 + unpaid upkeep) outranks a 3-turn revolt (85 + turns): severity is computed, not kind-ordered.
    expect(constraints.map(c => c.kind).slice(0, 2)).toEqual(['gold', 'unrest']);
    expect(constraints.every(c => c.severity >= 1 && c.severity <= 100 && Number.isInteger(c.severity))).toBe(true);
    expect(new Set(constraints.map(c => c.kind)).size).toBe(constraints.length);
  });

  it('keeps each first sentence of copy within 18 words', () => {
    const state = twoCityWorld(true);
    state.cities['city-a-first'].unrestLevel = 1;
    state.cities['city-a-first'].unrestTurns = 1;
    for (const constraint of buildStrategicAssessment(state, HUMAN_A).constraints) {
      const firstSentence = constraint.why.split(/(?<=[.!?])\s/)[0];
      expect(firstSentence.split(/\s+/).length, constraint.why).toBeLessThanOrEqual(18);
    }
  });

  it('reports wasted science when no research is chosen, with the tech panel as destination', () => {
    const state = twoCityWorld(false);
    state.civilizations[HUMAN_A].techState.currentResearch = null;

    const science = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'science');

    expect(science?.destination).toEqual({ kind: 'open-tech' });
    expect(science?.severity).toBeGreaterThanOrEqual(40);
  });

  it('reports no science constraint while a technology is being researched', () => {
    const state = twoCityWorld(false);
    state.civilizations[HUMAN_A].techState.currentResearch = 'pottery';

    expect(buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'science')).toBeUndefined();
  });

  it('reports a queue paused by disabled production, but leaves a revolt to the unrest constraint', () => {
    const state = twoCityWorld(false);
    state.cities['city-b-second'].productionQueue = ['warrior'];
    state.cities['city-b-second'].productionDisabledTurns = 3;

    const paused = buildStrategicAssessment(state, HUMAN_A).constraints.find(c => c.kind === 'production');
    expect(paused?.focusCityId).toBe('city-b-second');

    // A city in revolt is production-locked too, but that is the unrest constraint's story.
    state.cities['city-b-second'].productionDisabledTurns = 0;
    state.cities['city-b-second'].unrestLevel = 2;
    state.cities['city-b-second'].unrestTurns = 1;
    const kinds = buildStrategicAssessment(state, HUMAN_A).constraints.map(c => c.kind);
    expect(kinds).toContain('unrest');
    expect(kinds).not.toContain('production');
  });

  it('carries no functions (plain serialisable projection)', () => {
    const assessment = buildStrategicAssessment(twoCityWorld(true), HUMAN_A);
    expect(JSON.parse(JSON.stringify(assessment))).toEqual(assessment);
  });

  it('only counts the viewer\'s own cities', () => {
    const state = twoCityWorld(true);
    // Move the starving city to Bob: Alice's empire is now healthy.
    state.cities['city-b-second'].owner = HUMAN_B;
    state.civilizations[HUMAN_A].cities = ['city-a-first'];
    state.civilizations[HUMAN_B].cities = ['city-b-second'];

    expect(buildStrategicAssessment(state, HUMAN_A).constraints).toEqual([]);
    expect(buildStrategicAssessment(state, HUMAN_B).constraints.find(c => c.kind === 'food')?.focusCityId).toBe('city-b-second');
  });
});

describe('buildStrategicAssessment viewer safety (#1236)', () => {
  const surface: ViewerSurface<GameState, ReturnType<typeof buildStrategicAssessment>> = {
    name: 'strategic assessment',
    project: (world, viewerId) => buildStrategicAssessment(world, viewerId),
  };

  function world(): GameState {
    const state = twoCityWorld(true);
    state.civilizations[HUMAN_A].techState.completed.push('space-exploration');
    return state;
  }

  it('shows nothing about an unmet rival: war, cities, intent and race progress are all hidden', () => {
    const state = world();
    // The AI has a private mind; the assessment must never read it.
    setNationalIntent(state, AI_B, 'dominate');
    expectViewerSafety(surface, {
      world: state,
      viewerId: HUMAN_A,
      hidden: [
        { label: 'unmet rival changes its national intent', apply: s => setNationalIntent(s, AI_B, 'expand') },
        {
          label: 'unmet rival builds a city and a race component',
          apply: s => {
            const [site] = pickSites(s, 3).slice(2);
            addCity(s, AI_B, site, 'city-hidden', 'grassland');
            s.civilizations[AI_B].techState.completed.push('space-exploration');
            s.builtNationalProjects = { ...s.builtNationalProjects, [`${AI_B}:space_program_initiative`]: { civId: AI_B, buildingId: 'space_program_initiative', cityId: 'city-hidden', builtEra: 11 } as never };
          },
        },
        {
          label: 'unmet rivals fight each other and sign a treaty',
          apply: s => {
            s.civilizations[AI_A].diplomacy.atWarWith.push(AI_B);
            s.civilizations[AI_B].diplomacy.atWarWith.push(AI_A);
          },
        },
      ],
      earned: [
        {
          label: 'viewer meets a rival it is at war with',
          apply: s => {
            s.civilizations[HUMAN_A].diplomacy.atWarWith.push(AI_A);
            makeMet(s, HUMAN_A, AI_A);
          },
        },
        {
          label: 'viewer\'s own city starts starving (control)',
          apply: s => {
            s.cities['city-a-first'].population = 6;
            for (const coord of s.cities['city-a-first'].ownedTiles) s.map.tiles[hexKey(coord)].terrain = 'desert';
          },
        },
      ],
    });
  });

  it('lists a rival at war only once the viewer has met it, and never a rival fighting someone else', () => {
    const state = world();
    expect(buildStrategicAssessment(state, HUMAN_A).threats).toEqual([]);

    // War is itself contact evidence (hasMetCivilization), so a war with Carthage is a known one.
    state.civilizations[HUMAN_A].diplomacy.atWarWith.push(AI_A);
    makeMet(state, HUMAN_A, AI_A);
    const threats = buildStrategicAssessment(state, HUMAN_A).threats;

    expect(threats).toHaveLength(1);
    expect(threats[0]).toMatchObject({ kind: 'war', civId: AI_A });
  });

  it('shows rival race progress only with fresh intel, and keeps lanes tied to what the viewer can see', () => {
    const state = world();
    const lane = (s: GameState) => buildStrategicAssessment(s, HUMAN_A).victory.find(v => v.id === 'world-race-first-satellite');
    expect(lane(state)).toBeDefined();
    expect(buildStrategicAssessment(state, HUMAN_A).victory.some(v => v.id === 'world-race-interstellar-colony')).toBe(false);

    const before = lane(state);
    state.espionage = {
      ...state.espionage,
      [HUMAN_A]: {
        ...state.espionage?.[HUMAN_A],
        intelReports: {
          [AI_A]: {
            turn: state.turn, completedTechCount: 9, currentResearch: null, researchProgress: 0, treasury: 10, treaties: [],
            worldRaceProgress: { 'first-satellite': { componentBuilt: true, launchQueued: true, launchProgress: 50, launchCost: 100 } },
          },
        },
      },
    } as GameState['espionage'];

    expect(lane(state)?.stage).toBe('at-risk');
    expect(lane(state)).not.toEqual(before);
  });

  it('hot seat: facts only Bob has earned never appear in Alice\'s assessment', () => {
    const state = world();
    expectHotSeatDifferential(surface, {
      world: state,
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_B,
      mutation: {
        label: 'Bob meets and fights Carthage',
        apply: s => {
          s.civilizations[HUMAN_B].diplomacy.atWarWith.push(AI_A);
          makeMet(s, HUMAN_B, AI_A);
        },
      },
    });
  });
});
