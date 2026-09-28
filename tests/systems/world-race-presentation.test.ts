import { describe, it, expect } from 'vitest';
import type { GameState, WorldRaceKind } from '@/core/types';
import {
  getWorldRacePresentationForViewer,
  buildWorldRaceConclusionMomentItem,
  RACE_INTEL_STALENESS_TURNS,
  type WorldRacePresentationForViewer,
} from '@/systems/world-race-presentation';
import { expectViewerSafety, expectHotSeatDifferential, type ViewerSurface } from '../helpers/viewer-safety';

const RACE: WorldRaceKind = 'first-satellite';
const UNLOCK_TECH = 'space-exploration';
const COMPONENT = 'space_program_initiative';
const LAUNCH = 'first_satellite_launch';

function emptyTechState() {
  return { completed: [] as string[], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} };
}

function makeCiv(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    isHuman: false,
    isEliminated: false,
    gold: 0,
    civType: 'egypt',
    name: id,
    cities: [] as string[],
    units: [] as string[],
    knownCivilizations: [] as string[],
    diplomacy: { atWarWith: [], treaties: [], relationships: {} },
    visibility: { tiles: {}, lastSeen: {} },
    techState: emptyTechState(),
    ...overrides,
  };
}

function makeCity(id: string, owner: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    owner,
    name: id,
    position: { q: 0, r: 0 },
    population: 3,
    buildings: [] as string[],
    productionQueue: [] as string[],
    productionProgress: 0,
    ownedTiles: [] as unknown[],
    workedTiles: [] as unknown[],
    ...overrides,
  };
}

function makeMet(state: GameState, a: string, b: string): void {
  (state.civilizations[a] as { knownCivilizations: string[] }).knownCivilizations.push(b);
  (state.civilizations[b] as { knownCivilizations: string[] }).knownCivilizations.push(a);
}

function setIntelReport(
  state: GameState,
  viewerId: string,
  targetId: string,
  turn: number,
  progress: { componentBuilt: boolean; launchQueued: boolean; launchProgress: number; launchCost: number },
): void {
  const espionage = (state.espionage ??= {} as GameState['espionage']);
  const viewerState = (espionage[viewerId] ??= { intelReports: {} } as never);
  (viewerState as { intelReports: Record<string, unknown> }).intelReports[targetId] = {
    turn,
    worldRaceProgress: { [RACE]: progress },
  };
}

/**
 * p1 (viewer) has met ai-1 but not ai-2; p2 is a second hot-seat human who has met neither.
 * Nobody has the unlock tech yet, so the race starts fully "not yet unlocked" -- each test
 * mutates only what it needs.
 */
function baseWorld(): GameState {
  const state = {
    turn: 20,
    era: 11,
    currentPlayer: 'p1',
    settings: {},
    civilizations: {
      p1: makeCiv('p1', { cities: ['c1'] }),
      p2: makeCiv('p2', { cities: ['c2'] }),
      'ai-1': makeCiv('ai-1', { cities: ['c-ai1'] }),
      'ai-2': makeCiv('ai-2', { cities: ['c-ai2'] }),
    },
    cities: {
      c1: makeCity('c1', 'p1'),
      c2: makeCity('c2', 'p2'),
      'c-ai1': makeCity('c-ai1', 'ai-1'),
      'c-ai2': makeCity('c-ai2', 'ai-2'),
    },
    units: {},
    map: { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {},
    espionage: {},
    embargoes: [],
    defensiveLeagues: [],
    gameOver: false,
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
  } as unknown as GameState;
  makeMet(state, 'p1', 'ai-1');
  return state;
}

const surface: ViewerSurface<GameState, WorldRacePresentationForViewer> = {
  name: 'world race presentation',
  project: (state, viewerId) => getWorldRacePresentationForViewer(state, viewerId, RACE),
};

/** Every scenario shares this as its "earned" control -- always a legitimate, viewer-safe
 * change (the viewer's own component progress) so the harness's non-vacuity check is
 * satisfied without smuggling in the scenario's own theme as the earned mutation. */
function ownComponentBuiltMutation() {
  return {
    label: 'the viewer completes their own race component',
    apply: (s: GameState) => {
      s.builtNationalProjects = {
        ...(s.builtNationalProjects ?? {}),
        [`p1:${COMPONENT}`]: { civId: 'p1', cityId: 'c1', eraBuilt: 11 },
      };
    },
  };
}

describe('#992 world race viewer-safety matrix', () => {
  it('1. two unmet AI competitors: their progress is fully invisible, met or built or not', () => {
    const world = baseWorld();
    world.civilizations['ai-1']!.knownCivilizations = []; // make ai-1 unmet too for this case
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = [];

    expectViewerSafety(surface, {
      world,
      viewerId: 'p1',
      hidden: [
        {
          label: 'unmet ai-1 completes the component',
          apply: s => {
            s.builtNationalProjects = { ...(s.builtNationalProjects ?? {}), [`ai-1:${COMPONENT}`]: { civId: 'ai-1', cityId: 'c-ai1', eraBuilt: 11 } };
          },
        },
        {
          label: 'unmet ai-2 queues the launch attempt',
          apply: s => { s.cities['c-ai2']!.productionQueue = [LAUNCH]; s.cities['c-ai2']!.productionProgress = 50; },
        },
      ],
      earned: [ownComponentBuiltMutation()],
    });
  });

  it('2. known rival with no gather_intel report contributes nothing', () => {
    const world = baseWorld(); // ai-1 already met

    expectViewerSafety(surface, {
      world,
      viewerId: 'p1',
      hidden: [
        {
          label: 'met-but-un-spied ai-1 completes the component',
          apply: s => {
            s.builtNationalProjects = { ...(s.builtNationalProjects ?? {}), [`ai-1:${COMPONENT}`]: { civId: 'ai-1', cityId: 'c-ai1', eraBuilt: 11 } };
          },
        },
        {
          label: 'met-but-un-spied ai-1 queues the launch and racks up progress',
          apply: s => { s.cities['c-ai1']!.productionQueue = [LAUNCH]; s.cities['c-ai1']!.productionProgress = 120; },
        },
      ],
      earned: [ownComponentBuiltMutation()],
    });
  });

  it('3. known rival WITH legitimate fresh intel is shown, bounded to exactly the report', () => {
    const world = baseWorld();
    setIntelReport(world, 'p1', 'ai-1', 18, { componentBuilt: true, launchQueued: true, launchProgress: 77, launchCost: 380 });

    const presentation = getWorldRacePresentationForViewer(world, 'p1', RACE);
    expect(presentation.knownRivals).toEqual([
      { civId: 'ai-1', civName: 'ai-1', asOfTurn: 18, componentBuilt: true, launchQueued: true, launchProgress: 77, launchCost: 380 },
    ]);

    // Live changes to ai-1 AFTER the report was taken do not retroactively update it --
    // the report is a one-shot snapshot, not a live feed.
    world.cities['c-ai1']!.productionProgress = 999;
    expect(getWorldRacePresentationForViewer(world, 'p1', RACE).knownRivals[0]!.launchProgress).toBe(77);
  });

  it('4. stale intel (older than the staleness window) is presented exactly as no intel at all', () => {
    const world = baseWorld();
    const staleTurn = world.turn - RACE_INTEL_STALENESS_TURNS - 1;
    setIntelReport(world, 'p1', 'ai-1', staleTurn, { componentBuilt: true, launchQueued: true, launchProgress: 200, launchCost: 380 });

    expectViewerSafety(surface, {
      world,
      viewerId: 'p1',
      hidden: [
        {
          label: 'the stale report is somehow updated with even more alarming (but still stale) numbers',
          apply: s => {
            const report = (s.espionage as Record<string, { intelReports: Record<string, { worldRaceProgress: Record<string, unknown> }> }>)['p1']!.intelReports['ai-1']!;
            report.worldRaceProgress[RACE] = { componentBuilt: true, launchQueued: true, launchProgress: 380, launchCost: 380 };
          },
        },
      ],
      earned: [ownComponentBuiltMutation()],
    });

    expect(getWorldRacePresentationForViewer(world, 'p1', RACE).knownRivals).toEqual([]);
  });

  it('5. first contact after the race already started does not retroactively leak history', () => {
    const world = baseWorld();
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = []; // p1 has NOT met ai-2
    world.cities['c-ai2']!.buildings = [COMPONENT];
    world.builtNationalProjects = { [`ai-2:${COMPONENT}`]: { civId: 'ai-2', cityId: 'c-ai2', eraBuilt: 11 } };
    world.cities['c-ai2']!.productionQueue = [LAUNCH];
    world.cities['c-ai2']!.productionProgress = 150; // ai-2 has been racing for a while already

    expectViewerSafety(surface, {
      world,
      viewerId: 'p1',
      hidden: [
        {
          // Meeting alone is not intel -- only a gather_intel report is (see the module's
          // own doc comment). This is the case that would fail if contact alone leaked.
          label: 'the viewer meets ai-2 for the first time (still no intel report)',
          apply: s => makeMet(s, 'p1', 'ai-2'),
        },
      ],
      earned: [ownComponentBuiltMutation()],
    });
  });

  it('6. hot seat: two human viewers with different intel see different projections', () => {
    const world = baseWorld();
    expectHotSeatDifferential(surface, {
      world,
      viewers: ['p1', 'p2'],
      knownOnlyTo: 'p1',
      mutation: {
        label: 'p1 (and only p1) gathers intel on ai-1',
        apply: s => setIntelReport(s, 'p1', 'ai-1', s.turn, { componentBuilt: true, launchQueued: false, launchProgress: 0, launchCost: 380 }),
      },
    });
  });

  it('7. an unseen civ wins: the completion is visible, but the winner\'s identity is redacted', () => {
    const world = baseWorld();
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = []; // p1 has not met ai-2
    world.worldRaces = { [RACE]: { kind: RACE, winnerCivId: 'ai-2', completedTurn: 20 } };

    const presentation = getWorldRacePresentationForViewer(world, 'p1', RACE);
    expect(presentation.completion).toEqual({ turn: 20, winnerName: null });

    // Meeting the winner afterward reveals the name on the same, still-accurate completion record.
    makeMet(world, 'p1', 'ai-2');
    expect(getWorldRacePresentationForViewer(world, 'p1', RACE).completion).toEqual({ turn: 20, winnerName: 'ai-2' });
  });

  it('8. a public milestone (race unlocked) is visible to every viewer, even one who has met nobody -- it names no civ', () => {
    const world = baseWorld();
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = [];
    expect(getWorldRacePresentationForViewer(world, 'p1', RACE).unlocked).toBe(false);

    // The unlocking civ (ai-2) is never named in the projection -- only the boolean flips.
    world.civilizations['ai-2']!.techState.completed.push(UNLOCK_TECH);
    const presentation = getWorldRacePresentationForViewer(world, 'p1', RACE);
    expect(presentation.unlocked).toBe(true);
    expect(JSON.stringify(presentation)).not.toContain('ai-2');
  });

  it('9. a hidden (not-yet-public) milestone produces no observable effect', () => {
    const world = baseWorld();
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = [];

    expectViewerSafety(surface, {
      world,
      viewerId: 'p1',
      hidden: [
        {
          // ai-2 privately finishes the component (not a public milestone -- only the
          // unlock-tech and launch-queued flags are), with no intel report gathered.
          label: 'an unmet civ privately completes the component stage only',
          apply: s => {
            s.builtNationalProjects = { ...(s.builtNationalProjects ?? {}), [`ai-2:${COMPONENT}`]: { civId: 'ai-2', cityId: 'c-ai2', eraBuilt: 11 } };
          },
        },
      ],
      earned: [ownComponentBuiltMutation()],
    });

    expect(getWorldRacePresentationForViewer(world, 'p1', RACE).launchBegunPublicly).toBe(false);
  });
});

describe('buildWorldRaceConclusionMomentItem', () => {
  function completionEvent(winnerCivId: string) {
    return { kind: RACE, winnerCivId, hostCityId: 'host', turn: 33 };
  }

  it('shows a victory item when the viewer is the winner', () => {
    const world = baseWorld();
    world.currentPlayer = 'p1';
    const item = buildWorldRaceConclusionMomentItem(world, completionEvent('p1'));
    expect(item.won).toBe(true);
    expect(item.winnerName).toBe('p1');
  });

  it('redacts the winner\'s name when the viewer has not met them', () => {
    const world = baseWorld();
    world.currentPlayer = 'p1';
    (world.civilizations.p1 as { knownCivilizations: string[] }).knownCivilizations = [];
    const item = buildWorldRaceConclusionMomentItem(world, completionEvent('ai-2'));
    expect(item.won).toBe(false);
    expect(item.winnerName).toBeNull();
  });

  it('names the winner when the viewer has met them', () => {
    const world = baseWorld(); // p1 has met ai-1
    world.currentPlayer = 'p1';
    const item = buildWorldRaceConclusionMomentItem(world, completionEvent('ai-1'));
    expect(item.won).toBe(false);
    expect(item.winnerName).toBe('ai-1');
  });
});
