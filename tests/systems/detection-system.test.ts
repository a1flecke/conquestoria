// tests/systems/detection-system.test.ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import {
  getPassiveDetectionChance,
  processDetection,
} from '@/systems/detection-system';
import { createEspionageCivState, createSpyFromUnit, _resetSpyIdCounter } from '@/systems/espionage-system';
import { getTrainableUnitsForCiv } from '@/systems/city-system';

// Builds a state with a player spy unit adjacent to an enemy city.
// If scoutHound is true, ai-egypt gets a scout_hound unit at the spy's position.
function buildDetectionState(seed: string, { scoutHound = false } = {}): GameState {
  const state: GameState = {
    turn: 10,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'unit-spy-1': {
        id: 'unit-spy-1',
        type: 'spy_scout',
        owner: 'player',
        position: { q: 1, r: 0 }, // adjacent to enemy city at (0,0)
        movement: 2,
        maxMovement: 2,
        health: 100,
        maxHealth: 100,
        status: 'idle',
      } as any,
    },
    cities: {
      'city-enemy': {
        id: 'city-enemy',
        name: 'Thebes',
        owner: 'ai-egypt',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [],
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      } as any,
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: [], units: ['unit-spy-1'],
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: { 'ai-egypt': -30 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-enemy'], units: scoutHound ? ['unit-hound-1'] : [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: { player: -30 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {
      player: { ...createEspionageCivState(), maxSpies: 2 },
      'ai-egypt': createEspionageCivState(),
    },
  } as unknown as GameState;

  // Add spy record
  const { state: espWithSpy } = createSpyFromUnit(
    state.espionage!['player'], 'unit-spy-1', 'player', 'spy_scout', seed,
  );
  state.espionage!['player'] = espWithSpy;

  // Optionally add scout_hound for ai-egypt at the same position as the spy
  if (scoutHound) {
    state.units['unit-hound-1'] = {
      id: 'unit-hound-1',
      type: 'scout_hound',
      owner: 'ai-egypt',
      position: { q: 1, r: 0 }, // same tile as the spy — within vision range
      movement: 3,
      maxMovement: 3,
      health: 100,
      maxHealth: 100,
      status: 'idle',
    } as any;
  }

  return state;
}

describe('passive baseline detection', () => {
  it('returns 0.05 for a city with population 1', () => {
    expect(getPassiveDetectionChance(1)).toBeCloseTo(0.05, 3);
  });

  it('scales with population, max 0.20', () => {
    expect(getPassiveDetectionChance(10)).toBeCloseTo(0.20);
    expect(getPassiveDetectionChance(100)).toBeCloseTo(0.20);
  });

  it('adds a detection record to detecting civ when spy is adjacent to enemy city', () => {
    _resetSpyIdCounter();
    // Vary turn per trial so processDetection uses different RNG seeds
    let detections = 0;
    for (let i = 0; i < 100; i++) {
      const s = buildDetectionState(`seed-passive-${i}`);
      s.turn = i + 1;
      const bus = new EventBus();
      const next = processDetection(s, bus);
      if ((next.espionage?.['ai-egypt']?.recentDetections ?? []).length > 0) {
        detections++;
      }
    }
    // With pop 5 → chance ~0.115 per turn, in 100 trials expect ~5–25 detections
    expect(detections).toBeGreaterThan(0);
    expect(detections).toBeLessThan(60);
  });

  it('does not add a detection when spy is far from any enemy city', () => {
    _resetSpyIdCounter();
    const state = buildDetectionState('seed-far');
    // Move spy far away (q=5) — beyond adjacency range of enemy city at (0,0)
    state.units['unit-spy-1'].position = { q: 5, r: 0 };
    const bus = new EventBus();
    const next = processDetection(state, bus);
    expect(next.espionage?.['ai-egypt']?.recentDetections ?? []).toHaveLength(0);
  });

  it('does not detect a spy that is stationed (not idle)', () => {
    _resetSpyIdCounter();
    const state = buildDetectionState('seed-stationed');
    state.espionage!['player'].spies['unit-spy-1'].status = 'stationed';
    const bus = new EventBus();
    const next = processDetection(state, bus);
    expect(next.espionage?.['ai-egypt']?.recentDetections ?? []).toHaveLength(0);
  });

  it('emits espionage:spy-detected-traveling event on detection', () => {
    _resetSpyIdCounter();
    let eventFired = false;
    for (let i = 0; i < 200; i++) {
      const s = buildDetectionState(`seed-event-${i}`);
      s.turn = i + 1;
      const bus = new EventBus();
      bus.on('espionage:spy-detected-traveling', () => { eventFired = true; });
      processDetection(s, bus);
      if (eventFired) break;
    }
    expect(eventFired).toBe(true);
  });
});

describe('scout_hound detection', () => {
  it('scout_hound within vision range detects spy at ~35% rate', () => {
    _resetSpyIdCounter();
    let detections = 0;
    for (let i = 0; i < 200; i++) {
      const s = buildDetectionState(`seed-hound-${i}`, { scoutHound: true });
      s.turn = i + 1;
      // Move enemy city far away so only the scout_hound path can trigger detection
      s.cities['city-enemy'].position = { q: 8, r: 0 };
      const bus = new EventBus();
      const next = processDetection(s, bus);
      if ((next.espionage?.['ai-egypt']?.recentDetections ?? []).length > 0) {
        detections++;
      }
    }
    const rate = detections / 200;
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.55);
  });

  it('scout_hound outside vision range does not detect', () => {
    _resetSpyIdCounter();
    const state = buildDetectionState('seed-hound-far', { scoutHound: true });
    // Move spy out of hound's vision range (visionRange: 3 → place spy at distance 4)
    state.units['unit-spy-1'].position = { q: 4, r: 1 };
    state.espionage!['player'].spies['unit-spy-1'].status = 'idle';
    // Ensure spy is no longer adjacent to enemy city so passive detection also won't fire
    const bus = new EventBus();
    let detections = 0;
    for (let i = 0; i < 50; i++) {
      const s = buildDetectionState(`seed-hound-far-${i}`, { scoutHound: true });
      s.units['unit-spy-1'].position = { q: 4, r: 1 };
      s.espionage!['player'].spies['unit-spy-1'].status = 'idle';
      const b = new EventBus();
      const next = processDetection(s, b);
      if ((next.espionage?.['ai-egypt']?.recentDetections ?? []).length > 0) {
        detections++;
      }
    }
    expect(detections).toBe(0);
  });
});

describe('civ-unique detection units', () => {
  it('shadow_warden is defined in UNIT_DEFINITIONS', async () => {
    const { UNIT_DEFINITIONS } = await import('@/systems/unit-system');
    expect(UNIT_DEFINITIONS['shadow_warden']).toBeDefined();
    expect(UNIT_DEFINITIONS['shadow_warden'].spyDetectionChance).toBe(0.50);
  });

  it('war_hound is defined in UNIT_DEFINITIONS', async () => {
    const { UNIT_DEFINITIONS } = await import('@/systems/unit-system');
    expect(UNIT_DEFINITIONS['war_hound']).toBeDefined();
    expect(UNIT_DEFINITIONS['war_hound'].strength).toBeGreaterThan(10);
  });

  it('persia gets shadow_warden instead of scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'persia');
    const types = units.map(u => u.type);
    expect(types).toContain('shadow_warden');
    expect(types).not.toContain('scout_hound');
  });

  it('rome gets war_hound instead of scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'rome');
    const types = units.map(u => u.type);
    expect(types).toContain('war_hound');
    expect(types).not.toContain('scout_hound');
  });

  it('standard civ still gets scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'egypt');
    const types = units.map(u => u.type);
    expect(types).toContain('scout_hound');
    expect(types).not.toContain('shadow_warden');
    expect(types).not.toContain('war_hound');
  });

  it('civType undefined returns no unique units and includes scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts']);
    const types = units.map(u => u.type);
    expect(types).toContain('scout_hound');
    expect(types).not.toContain('shadow_warden');
    expect(types).not.toContain('war_hound');
  });
});
