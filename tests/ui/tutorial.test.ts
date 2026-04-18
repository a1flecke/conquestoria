import { describe, it, expect } from 'vitest';
import { TutorialSystem } from '@/ui/tutorial';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

// Minimal state factory for tutorial testing
function makeTutorialState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentPlayer: 'player-2',
    civilizations: {
      'player-2': {
        id: 'player-2',
        name: 'Test Civ',
        color: '#ff0000',
        cities: [],
        units: [],
        gold: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { isVassal: false, isOverlord: false, vassals: [], overlord: null, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        visibility: { tiles: {}, sharedVision: [] },
      },
    },
    cities: {},
    units: {},
    turn: 1,
    tutorial: { active: true, currentStep: 'welcome', completedSteps: ['welcome'] },
    ...overrides,
  } as unknown as GameState;
}

describe('tutorial hot-seat support', () => {
  it('found_city trigger uses currentPlayer, not hardcoded player', () => {
    const bus = new EventBus();
    const tutorial = new TutorialSystem(bus);
    let emitted = false;
    bus.on('tutorial:step', () => { emitted = true; });

    const state = makeTutorialState({
      cities: {
        'city-1': { id: 'city-1', owner: 'player-2', name: 'Test', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: [], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
      },
    });

    tutorial.check(state);
    expect(emitted).toBe(true);
  });

  it('tutorial does NOT trigger when city belongs to different player', () => {
    const bus = new EventBus();
    const tutorial = new TutorialSystem(bus);
    let emitted = false;
    bus.on('tutorial:step', () => { emitted = true; });

    const state = makeTutorialState({
      cities: {
        'city-1': { id: 'city-1', owner: 'player-1', name: 'Other', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: [], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
      },
    });

    tutorial.check(state);
    // Should not trigger found_city because the city belongs to player-1, not currentPlayer (player-2)
    expect(emitted).toBe(false);
  });

  it('build_unit tutorial triggers when any current-player city is idle, not just the first one', () => {
    const bus = new EventBus();
    const tutorial = new TutorialSystem(bus);
    const emittedSteps: string[] = [];
    bus.on('tutorial:step', ({ step }) => emittedSteps.push(step));

    const state = makeTutorialState({
      tutorial: {
        active: true,
        currentStep: 'research_tech',
        completedSteps: ['welcome', 'found_city', 'explore', 'build_improvement', 'research_tech'],
      } as any,
      cities: {
        'city-1': { id: 'city-1', owner: 'player-2', name: 'Busy', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: ['warrior'], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
        'city-2': { id: 'city-2', owner: 'player-2', name: 'Idle', position: { q: 1, r: 0 }, population: 1, buildings: [], productionQueue: [], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
      },
      civilizations: {
        'player-2': {
          ...makeTutorialState().civilizations['player-2'],
          cities: ['city-1', 'city-2'],
        },
      } as any,
    });

    tutorial.check(state);
    expect(emittedSteps).toContain('build_unit');
  });
});
